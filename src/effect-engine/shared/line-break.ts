import type { SubtitleRenderLine, SubtitleStyleConfig } from './types'

const CJK = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
const PUNCTUATION = /^[,.;!?%:，。！？；：、）】》〉」』]$/u

function splitTokens(text: string): string[] {
  const segmenter = (Intl as typeof Intl & { Segmenter?: any }).Segmenter
  if (segmenter) {
    try {
      const segments = new segmenter('zh', { granularity: 'word' }).segment(text) as Iterable<{
        segment: string
      }>
      return Array.from(segments)
        .map((item) => item.segment.trim())
        .filter(Boolean)
    } catch {
      // Fall through to character-based CJK tokenization.
    }
  }

  const tokens: string[] = []
  let word = ''
  for (const char of Array.from(text)) {
    if (/\s/u.test(char)) {
      if (word) tokens.push(word)
      word = ''
    } else if (CJK.test(char) || PUNCTUATION.test(char)) {
      if (word) tokens.push(word)
      word = ''
      if (PUNCTUATION.test(char) && tokens.length) tokens[tokens.length - 1] += char
      else tokens.push(char)
    } else {
      word += char
    }
  }
  if (word) tokens.push(word)
  return tokens
}

function joinTokens(tokens: string[]): string {
  return tokens.reduce((text, token, index) => {
    if (index === 0) return token
    const previous = text.at(-1) ?? ''
    if (PUNCTUATION.test(token[0] ?? '') || (CJK.test(previous) && CJK.test(token[0] ?? ''))) {
      return text + token
    }
    return `${text} ${token}`
  }, '')
}

export function autoLineBreak(params: {
  text: string
  style: SubtitleStyleConfig
  videoWidth: number
  measure: (text: string, fontSize: number) => number
}): { lines: SubtitleRenderLine[]; fontSize: number } {
  const { text, style, videoWidth, measure } = params
  const tokens = splitTokens(text)
  const maxWidth = Math.max(1, Math.floor(videoWidth * style.maxWidthRatio))

  for (let fontSize = style.fontSize; fontSize >= style.minFontSize; fontSize -= 1) {
    const lines: string[][] = [[]]
    for (const token of tokens) {
      const line = lines.at(-1)!
      const candidate = joinTokens([...line, token])
      if (!line.length || measure(candidate, fontSize) <= maxWidth) line.push(token)
      else lines.push([token])
    }
    if (lines.length <= style.maxLines) {
      return { fontSize, lines: lines.map((line) => ({ text: joinTokens(line) })) }
    }
  }

  const lines = Array.from({ length: style.maxLines }, () => [] as string[])
  for (const token of tokens) {
    const target =
      lines.find((line) => measure(joinTokens([...line, token]), style.minFontSize) <= maxWidth) ??
      lines.at(-1)!
    target.push(token)
  }
  return {
    fontSize: style.minFontSize,
    lines: lines.map((line) => ({ text: joinTokens(line) })).filter((line) => line.text),
  }
}
