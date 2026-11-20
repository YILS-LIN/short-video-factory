import random from 'random'
import type { RenderVideoParams } from '~/electron/ffmpeg/types'

export const segmentModes = ['standard', 'long', 'whole'] as const
export type SegmentMode = (typeof segmentModes)[number]
export const segmentOrders = ['random', 'filename'] as const
export const normalizeSegmentOrder = (value: unknown): (typeof segmentOrders)[number] =>
  value === 'filename' ? 'filename' : 'random'

export const normalizeSegmentMode = (value: unknown): SegmentMode =>
  value === 'long' || value === 'whole' ? value : 'standard'

export type SegmentSettings = Readonly<
  | { mode: 'whole'; order: ReturnType<typeof normalizeSegmentOrder> }
  | { mode: 'standard' | 'long'; minDurationMs: number; maxDurationMs: number }
>

export function resolveSegmentSettings(value: unknown, order?: unknown): SegmentSettings {
  const mode = normalizeSegmentMode(value)
  return mode === 'whole'
    ? { mode, order: normalizeSegmentOrder(order) }
    : { mode, minDurationMs: 2000, maxDurationMs: mode === 'long' ? 30_000 : 15_000 }
}

// Bound the number of FFmpeg inputs and the size of the generated filter graph.
const MAX_SEGMENTS = 100
type Range = [startMs: number, endMs: number]
type Segment = { path: string; range: Range }
type Source = { path: string; durationMs: number }
type Asset = { path: string; name: string }

export class SegmentPlanError extends Error {
  constructor(
    readonly code:
      | 'audioDurationInvalid'
      | 'noVideoAssets'
      | 'noUsableVideoAssets'
      | 'segmentLimit',
    readonly limit?: number,
  ) {
    super(code)
  }
}

const formatTimestamp = (ms: number) => (ms / 1000).toFixed(3)

function randomRange(
  durationMs: number,
  remainingMs: number,
  settings: Extract<SegmentSettings, { maxDurationMs: number }>,
): Range {
  const max = Math.min(durationMs, remainingMs, settings.maxDurationMs)
  const length = random.int(Math.min(max, settings.minDurationMs), max)
  const start = random.int(0, durationMs - length)
  return [start, start + length]
}

// Keep the union of used half-open ranges so each reusable gap has exact millisecond bounds.
function addUsedRange(used: Range[], [start, end]: Range) {
  let index = 0
  while (index < used.length && used[index][1] < start) index++
  let next = index
  while (next < used.length && used[next][0] <= end) {
    start = Math.min(start, used[next][0])
    end = Math.max(end, used[next][1])
    next++
  }
  used.splice(index, next - index, [start, end])
}

function largestUnusedRange(durationMs: number, used: Range[]): Range {
  let largest: Range = [0, 0]
  let cursor = 0
  for (const [start, end] of used) {
    if (start - cursor > largest[1] - largest[0]) largest = [cursor, start]
    cursor = end
  }
  return durationMs - cursor > largest[1] - largest[0] ? [cursor, durationMs] : largest
}

function chooseDifferentSource<T extends { path: string }>(sources: T[], previous?: string): T {
  const alternatives = sources.filter(({ path }) => path !== previous)
  const candidates = alternatives.length ? alternatives : sources
  return candidates[random.int(0, candidates.length - 1)]
}

export async function planVideoSegments(options: {
  assets: Asset[]
  duration: number
  settings: SegmentSettings
  readDuration: (path: string, signal?: AbortSignal) => Promise<number>
  signal?: AbortSignal
  onUnreadable: (asset: Asset, reason: string) => void
}): Promise<Pick<RenderVideoParams, 'videoFiles' | 'timeRanges'>> {
  const { assets, settings, readDuration, signal, onUnreadable } = options
  signal?.throwIfAborted()
  const targetMs = Math.ceil(options.duration * 1000)
  if (!Number.isSafeInteger(targetMs) || targetMs <= 0)
    throw new SegmentPlanError('audioDurationInvalid')
  if (!assets.length) throw new SegmentPlanError('noVideoAssets')

  const pending = [...new Map(assets.map((asset) => [asset.path, asset])).values()]
  const byFilename = settings.mode === 'whole' && settings.order === 'filename'
  if (byFilename) {
    const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
    pending.sort((a, b) => collator.compare(a.name, b.name) || (a.path < b.path ? -1 : 1)).reverse()
  }
  const sources: Source[] = []
  const segments: Segment[] = []
  let remainingMs = targetMs
  const append = (path: string, range: Range) => {
    if (segments.length >= MAX_SEGMENTS) throw new SegmentPlanError('segmentLimit', MAX_SEGMENTS)
    segments.push({ path, range })
    remainingMs -= range[1] - range[0]
  }

  // Probe lazily in the requested order. A finished plan avoids reading the rest of the folder.
  while (pending.length && remainingMs > 0 && segments.length < MAX_SEGMENTS) {
    signal?.throwIfAborted()
    const index = byFilename ? pending.length - 1 : random.int(0, pending.length - 1)
    const asset = pending[index]
    pending[index] = pending[pending.length - 1]
    pending.pop()
    let durationMs: number
    try {
      durationMs = Math.floor((await readDuration(asset.path, signal)) * 1000)
      if (!Number.isSafeInteger(durationMs) || durationMs <= 0) throw new Error('视频时长无效')
    } catch (error) {
      signal?.throwIfAborted()
      onUnreadable(asset, error instanceof Error ? error.message : String(error))
      continue
    }
    signal?.throwIfAborted()
    sources.push({ path: asset.path, durationMs })
    append(
      asset.path,
      settings.mode === 'whole'
        ? [0, Math.min(durationMs, remainingMs)]
        : randomRange(durationMs, remainingMs, settings),
    )
  }
  if (!sources.length) throw new SegmentPlanError('noUsableVideoAssets')

  if (remainingMs > 0 && settings.mode === 'whole') {
    // Loop the selected source order if needed. Every occurrence starts at the file head.
    for (let index = 0; remainingMs > 0; index = (index + 1) % sources.length) {
      signal?.throwIfAborted()
      const { path, durationMs } = sources[index]
      append(path, [0, Math.min(remainingMs, durationMs)])
    }
  } else if (remainingMs > 0 && settings.mode !== 'whole') {
    const used = new Map<string, Range[]>()
    // Spend any spare first-pass capacity before repeating a source, even if the random cuts
    // happened to be short. Keep the already selected footage inside the extended window.
    for (const [index, { path, durationMs }] of sources.entries()) {
      const segment = segments[index]
      const [start, end] = segment.range
      const extra = Math.min(
        remainingMs,
        Math.min(durationMs, settings.maxDurationMs) - (end - start),
      )
      const extendedEnd = Math.min(durationMs, end + extra)
      segment.range = [start - (extra - (extendedEnd - end)), extendedEnd]
      remainingMs -= extra
      used.set(path, [segment.range])
    }

    while (remainingMs > 0) {
      signal?.throwIfAborted()
      const unused = sources
        .map(({ path, durationMs }) => ({
          path,
          range: largestUnusedRange(durationMs, used.get(path)!),
        }))
        .filter(({ range: [start, end] }) => end > start)
      const previous = segments.at(-1)?.path
      if (unused.length) {
        const {
          path,
          range: [start, end],
        } = chooseDifferentSource(unused, previous)
        // Consume a gap from its edge to preserve a contiguous window for a later cut.
        const range: Range = [
          start,
          Math.min(end, start + settings.maxDurationMs, start + remainingMs),
        ]
        append(path, range)
        addUsedRange(used.get(path)!, range)
      } else {
        const { path, durationMs } = chooseDifferentSource(sources, previous)
        append(path, randomRange(durationMs, remainingMs, settings))
      }
    }
  }

  return {
    videoFiles: segments.map(({ path }) => path),
    timeRanges: segments.map(({ range: [start, end] }) => [
      formatTimestamp(start),
      formatTimestamp(end),
    ]),
  }
}
