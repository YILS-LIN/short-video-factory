import { describe, expect, it } from 'vitest'
import { isSafeMarkdownLink, renderSafeMarkdown } from '../../src/lib/safe-markdown'
import { validateExternalHttpsUrl } from '../../electron/lib/external-url'

describe('safe Markdown rendering', () => {
  it('escapes raw HTML, removes images, and only marks safe HTTPS links', () => {
    const html = renderSafeMarkdown(
      '<img src=x onerror=alert(1)>\n\n![tracking](https://example.com/pixel.png)\n\n[good](https://example.com) [bad](javascript:alert(1))',
    )

    expect(html).not.toContain('<img')
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;')
    expect(html).not.toContain('src="https://example.com/pixel.png"')
    expect(html).toContain('data-external-url="https://example.com/"')
    expect(html).not.toContain('href="javascript:')
  })

  it('rejects unsafe Markdown and external URL schemes', () => {
    expect(isSafeMarkdownLink('https://example.com/path')).toBe(true)
    expect(isSafeMarkdownLink('javascript:alert(1)')).toBe(false)
    expect(isSafeMarkdownLink('https://user:pass@example.com')).toBe(false)
    expect(() => validateExternalHttpsUrl('file:///C:/secret.txt')).toThrow('HTTPS')
    expect(() => validateExternalHttpsUrl('https://user:pass@example.com')).toThrow(
      'credential-free',
    )
    expect(validateExternalHttpsUrl('https://example.com/a')).toBe('https://example.com/a')
  })
})
