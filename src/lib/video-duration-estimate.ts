/// <reference lib="es2022.intl" />

/** Rough playback seconds at a normal reading pace, independent of any TTS engine. */
export function estimateVideoDuration(text: string): number {
  const normalized = text.normalize('NFKC')
  let seconds = 0
  // Count syllabic/logographic scripts directly, regardless of native word boundaries.
  const remainder = normalized.replace(
    /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}ー]/gu,
    (character) => {
      seconds += /\p{Script=Han}/u.test(character)
        ? 0.22
        : /[\p{Script=Hiragana}\p{Script=Katakana}ー]/u.test(character)
          ? 0.14
          : 0.2
      return ' '
    },
  )
  const words =
    typeof Intl.Segmenter === 'function'
      ? Array.from(new Intl.Segmenter(undefined, { granularity: 'word' }).segment(remainder))
          .filter((part) => part.isWordLike)
          .map((part) => part.segment)
      : (remainder.match(/[\p{L}\p{M}\p{N}]+/gu) ?? [])
  for (const word of words) {
    const length = word.match(/[\p{L}\p{N}]/gu)?.length ?? 0
    if (length) seconds += /\p{L}/u.test(word) ? Math.max(0.32, length * 0.065) : length * 0.22
  }
  if (!seconds) return 0
  // Decimal/thousands separators are not pauses; repeated punctuation counts once.
  const punctuation = normalized.replace(/(\p{N})[.,](?=\p{N})/gu, '$1')
  seconds += (punctuation.match(/[,，、:：;；،؛]+/g)?.length ?? 0) * 0.15
  seconds += (punctuation.match(/[.!?。！？؟।॥…\n]+/g)?.length ?? 0) * 0.3
  return Math.max(1, Math.round(seconds))
}

export function formatPlaybackDuration(seconds: number): string {
  const total = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0))
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const remainder = String(total % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${remainder}`
    : `${String(minutes).padStart(2, '0')}:${remainder}`
}
