import { i18nLanguages } from './common-options'

export function resolveSystemLanguage(languages: readonly string[]): string {
  for (const language of languages) {
    const normalized = language.replace(/_/g, '-').toLowerCase()
    const exact = i18nLanguages.find((item) => item.code.toLowerCase() === normalized)
    if (exact) return exact.code
    if (normalized === 'en' || normalized.startsWith('en-')) return 'en'
    if (
      normalized === 'zh' ||
      /^zh-hans(?:-|$)/.test(normalized) ||
      /^zh-(cn|sg)(?:-|$)/.test(normalized)
    ) {
      return 'zh-CN'
    }
  }
  return 'en'
}
