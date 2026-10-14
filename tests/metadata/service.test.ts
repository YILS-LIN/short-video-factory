import { describe, expect, it, vi } from 'vitest'
import type { MetadataCache } from '../../electron/metadata/cache'
import type { MetadataService } from '../../electron/metadata/service'
import { MetadataService as MetadataServiceClass } from '../../electron/metadata/service'
import type { MetadataCacheRecord } from '../../electron/metadata/types'
import { makePayload, signManifest, testConfig, testContext } from './fixtures'

class MemoryCache implements MetadataCache {
  value: unknown | null = null

  async read() {
    return this.value
  }

  async write(record: MetadataCacheRecord) {
    this.value = record
  }
}

function createService(
  fetchManifest: (url: string) => Promise<unknown>,
  cache = new MemoryCache(),
): MetadataService {
  return new MetadataServiceClass({
    config: testConfig,
    context: testContext,
    cache,
    fetchManifest,
    now: () => new Date('2026-10-09T12:00:00Z'),
  })
}

describe('MetadataService', () => {
  it('requests the fixed app endpoint and configured channel', async () => {
    const fetchManifest = vi.fn(async () => signManifest(makePayload()))
    const service = createService(fetchManifest)

    await service.refresh()

    expect(fetchManifest).toHaveBeenCalledWith(
      'http://127.0.0.1:3000/v1/apps/short-video-factory/manifest?channel=stable',
    )
  })

  it('coalesces concurrent startup and manual refresh requests', async () => {
    let resolveResponse: ((value: unknown) => void) | undefined
    const fetchManifest = vi.fn(
      () =>
        new Promise<unknown>((resolve) => {
          resolveResponse = resolve
        }),
    )
    const service = createService(fetchManifest)

    const first = service.refresh()
    const second = service.refresh()
    await vi.waitFor(() => expect(fetchManifest).toHaveBeenCalledTimes(1))
    resolveResponse?.(signManifest(makePayload()))

    const [firstState, secondState] = await Promise.all([first, second])
    expect(firstState.payload?.revision).toBe(1)
    expect(secondState.payload?.revision).toBe(1)
    expect(fetchManifest).toHaveBeenCalledTimes(1)
  })

  it('keeps the last accepted snapshot when a lower revision arrives', async () => {
    const fetchManifest = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(signManifest(makePayload({ revision: 4 })))
      .mockResolvedValueOnce(signManifest(makePayload({ revision: 3 })))
    const cache = new MemoryCache()
    const service = createService(fetchManifest, cache)

    await service.refresh()
    await expect(service.refresh()).rejects.toThrow('older than the locally accepted revision')

    const state = await service.getState()
    expect(state.payload?.revision).toBe(4)
    expect(state.lastSuccessAt).toBe('2026-10-09T12:00:00.000Z')
    expect(state.phase).toBe('ready')
  })

  it('rejects changed content without a matching revision increment', async () => {
    const fetchManifest = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(signManifest(makePayload()))
      .mockResolvedValueOnce(
        signManifest(makePayload({ app: { ...makePayload().app, name: '改名但未升版' } })),
      )
    const service = createService(fetchManifest)

    await service.refresh()
    await expect(service.refresh()).rejects.toThrow('without incrementing its revision')
    expect((await service.getState()).payload?.app.name).toBe('短视频工厂')
  })

  it('compares the original signed payload rather than schema-defaulted data', async () => {
    const notice = {
      id: 'default-values',
      revision: 1,
      kind: 'general',
      severity: 'info',
      publishedAt: '2026-10-08T00:00:00Z',
      defaultLocale: 'en',
      translations: { en: { title: 'Notice', summary: 'Summary', bodyMarkdown: 'Body' } },
    }
    const fetchManifest = vi
      .fn<() => Promise<unknown>>()
      .mockResolvedValueOnce(signManifest(makePayload({ notices: [notice] })))
      .mockResolvedValueOnce(signManifest(makePayload({ notices: [{ ...notice, priority: 0 }] })))
    const service = createService(fetchManifest)

    await service.refresh()
    await expect(service.refresh()).rejects.toThrow('without incrementing its revision')
  })

  it('hydrates a persisted signed snapshot without making a request', async () => {
    const cache = new MemoryCache()
    cache.value = {
      manifest: signManifest(makePayload()),
      lastSuccessAt: '2026-10-09T11:00:00.000Z',
    }
    const fetchManifest = vi.fn(async () => signManifest(makePayload()))
    const service = createService(fetchManifest, cache)

    const state = await service.getState()

    expect(state.phase).toBe('ready')
    expect(state.payload?.revision).toBe(1)
    expect(state.lastSuccessAt).toBe('2026-10-09T11:00:00.000Z')
    expect(fetchManifest).not.toHaveBeenCalled()
  })
})
