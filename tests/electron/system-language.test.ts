import { describe, expect, it } from 'vitest'
import { resolveSystemLanguage } from '../../electron/i18n/system-language'

describe('system language selection', () => {
  it.each(['zh-Hans-CN', 'zh-Hans', 'zh-CN', 'zh-SG', 'zh_Hans_CN', 'ZH-cn', 'zh'])(
    'maps %s to Simplified Chinese',
    (language) => {
      expect(resolveSystemLanguage([language])).toBe('zh-CN')
    },
  )

  it.each(['en', 'en-US', 'en-GB'])('maps %s to English', (language) => {
    expect(resolveSystemLanguage([language])).toBe('en')
  })

  it('respects preference order and skips unsupported languages', () => {
    expect(resolveSystemLanguage(['fr-FR', 'zh-Hans-CN', 'en-US'])).toBe('zh-CN')
    expect(resolveSystemLanguage(['en-US', 'zh-Hans-CN'])).toBe('en')
    expect(resolveSystemLanguage(['zh-Hant-TW', 'zh-Hans-CN'])).toBe('zh-CN')
  })

  it('falls back to English when no supported preference exists', () => {
    expect(resolveSystemLanguage([])).toBe('en')
    expect(resolveSystemLanguage(['fr-FR', 'zh-Hant', 'zh-TW'])).toBe('en')
  })
})
