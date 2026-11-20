const openTag = '<think>'
const closeTag = '</think>'

/** Decode one leading reasoning wrapper; once the body starts, pass its text through unchanged. */
export function createLeadingThinkDecoder() {
  let state: 'prefix' | 'thinking' | 'body' = 'prefix'
  let pending = ''

  return {
    push(delta: string): string {
      if (state === 'body') return delta
      const previousLength = pending.length
      pending += delta
      let searchStart = Math.max(0, previousLength - closeTag.length + 1)
      if (state === 'prefix') {
        const prefix = pending.trimStart()
        if (openTag.startsWith(prefix) && prefix !== openTag) return ''
        if (!prefix.startsWith(openTag)) {
          state = 'body'
          const text = pending
          pending = ''
          return text
        }
        state = 'thinking'
        searchStart = pending.length - prefix.length + openTag.length
      }

      const closeAt = pending.indexOf(closeTag, searchStart)
      if (closeAt === -1) return ''
      state = 'body'
      const text = pending.slice(closeAt + closeTag.length)
      pending = ''
      return text
    },
    finish() {
      const result =
        state === 'thinking' ? { text: '', unclosedThinkingOutput: pending } : { text: pending }
      state = 'body'
      pending = ''
      return result
    },
  }
}
