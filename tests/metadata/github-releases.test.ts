import { describe, expect, it, vi } from 'vitest'
import { fetchGitHubRelease, parseGitHubReleaseNotes } from '../../electron/github-releases'

describe('GitHub release fallback', () => {
  it('requests the GitHub latest endpoint for stable builds and normalizes v-prefixed tags', async () => {
    const request = vi.fn().mockResolvedValue({
      tag_name: 'v1.4.0',
      body: 'Bug fixes',
      published_at: '2026-10-09T12:00:00Z',
      draft: false,
      prerelease: false,
    })

    await expect(fetchGitHubRelease('stable', request)).resolves.toEqual({
      version: '1.4.0',
      releaseNotes: {},
      fallbackReleaseNotes: 'Bug fixes',
      releaseDate: '2026-10-09T12:00:00Z',
    })
    expect(request).toHaveBeenCalledWith(
      'https://api.github.com/repos/YILS-LIN/short-video-factory/releases/latest',
    )
  })

  it('selects the highest matching beta without falling back to stable or nightly', async () => {
    const request = vi.fn().mockResolvedValue([
      { tag_name: '2.0.0-nightly.2', prerelease: true },
      { tag_name: '1.9.0', prerelease: false },
      { tag_name: '1.8.0-beta.2', prerelease: true, body: 'Beta 2' },
      { tag_name: '1.8.0-beta.10', prerelease: true, body: 'Beta 10' },
      { tag_name: '1.8.0-rc.1', prerelease: true },
    ])

    await expect(fetchGitHubRelease('beta', request)).resolves.toMatchObject({
      version: '1.8.0-beta.10',
      fallbackReleaseNotes: 'Beta 10',
    })
    expect(request).toHaveBeenCalledWith(
      'https://api.github.com/repos/YILS-LIN/short-video-factory/releases?per_page=100',
    )
  })

  it('composes common GitHub notes with locale-specific sections', () => {
    const notes = parseGitHubReleaseNotes(
      [
        'Common introduction',
        '<!-- i18n:zh-CN:start -->',
        '简体更新内容',
        '<!-- i18n:zh-CN:end -->',
        '<!-- i18n:en:start -->',
        'English update notes',
        '<!-- i18n:en:end -->',
        'Common conclusion',
      ].join('\n'),
    )

    expect(notes.releaseNotes['zh-CN']).toBe(
      'Common introduction\n\n简体更新内容\n\nCommon conclusion',
    )
    expect(notes.releaseNotes['en']).toBe(
      'Common introduction\n\nEnglish update notes\n\nCommon conclusion',
    )
    expect(notes.fallbackReleaseNotes).toBe('Common introduction\n\nCommon conclusion')
  })

  it('uses a translation as fallback when release notes contain only localized sections', () => {
    const notes = parseGitHubReleaseNotes('<!-- i18n:zh-CN:start -->中文<!-- i18n:zh-CN:end -->')
    expect(notes.fallbackReleaseNotes).toBe('中文')
  })

  it('returns null when a stable endpoint response is a prerelease or invalid tag', async () => {
    await expect(
      fetchGitHubRelease(
        'stable',
        vi.fn().mockResolvedValue({ tag_name: '1.5.0-beta.1', prerelease: true }),
      ),
    ).resolves.toBeNull()
    await expect(
      fetchGitHubRelease('stable', vi.fn().mockResolvedValue({ tag_name: 'latest' })),
    ).resolves.toBeNull()
  })
})
