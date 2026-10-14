import { describe, expect, it } from 'vitest'
import { matchNotices, selectNoticeTranslation, type MatchedNotice } from '../../src/lib/notices'
import type { Notice } from '../../electron/metadata/schema'
import { testContext } from './fixtures'

function makeNotice(overrides: Record<string, unknown> = {}): Notice {
  return {
    id: 'general-notice',
    revision: 1,
    kind: 'general',
    severity: 'info',
    priority: 0,
    publishedAt: '2026-10-08T00:00:00Z',
    dismissible: true,
    defaultLocale: 'en',
    translations: {
      en: { title: 'Announcement', summary: 'Summary', bodyMarkdown: 'Body', actions: [] },
      'zh-CN': { title: '公告', summary: '摘要', bodyMarkdown: '正文', actions: [] },
    },
    ...overrides,
  } as Notice
}

describe('announcement matching', () => {
  it('uses the half-open start and expiry interval', () => {
    const notice = makeNotice({
      startsAt: '2026-10-09T12:00:00Z',
      expiresAt: '2026-10-10T12:00:00Z',
    })
    const notices = [notice]
    expect(
      matchNotices(notices, testContext, 'en', Date.parse('2026-10-09T11:59:59Z')),
    ).toHaveLength(0)
    expect(
      matchNotices(notices, testContext, 'en', Date.parse('2026-10-09T12:00:00Z')),
    ).toHaveLength(1)
    expect(
      matchNotices(notices, testContext, 'en', Date.parse('2026-10-10T12:00:00Z')),
    ).toHaveLength(0)
  })

  it('matches all target groups and skips unknown conditions', () => {
    const matching = makeNotice({
      targets: {
        versionRange: '>=1.2.0 <2.0.0',
        platforms: ['windows'],
        architectures: ['x64'],
        channels: ['stable'],
        distributionChannels: ['official'],
        requiredCapabilities: ['markdown-v1'],
      },
    })
    const unsupported = makeNotice({
      id: 'future-condition',
      targets: { futureRule: true },
    })

    expect(matchNotices([matching, unsupported], testContext, 'en')).toHaveLength(1)
    expect(matchNotices([matching], { ...testContext, platform: 'macos' }, 'en')).toHaveLength(0)
    expect(matchNotices([matching], { ...testContext, capabilities: [] }, 'en')).toHaveLength(0)
  })

  it('falls back progressively from exact locale, then to the configured default', () => {
    const notice = makeNotice()
    expect(selectNoticeTranslation(notice, 'zh-CN')?.title).toBe('公告')
    const regionalNotice = makeNotice({
      translations: {
        en: notice.translations['en'],
        'zh-Hant': {
          title: '繁體公告',
          summary: '摘要',
          bodyMarkdown: '正文',
          actions: [],
        },
      },
    })
    expect(selectNoticeTranslation(regionalNotice, 'zh-Hant-TW')?.title).toBe('繁體公告')
    expect(selectNoticeTranslation(notice, 'zh-TW')?.title).toBe('Announcement')
    expect(selectNoticeTranslation(notice, 'fr-FR')?.title).toBe('Announcement')
  })

  it('sorts by severity, priority, publish date, and stable ID', () => {
    const notices = [
      makeNotice({ id: 'info-high', priority: 100 }),
      makeNotice({ id: 'warning', severity: 'warning', priority: 0 }),
      makeNotice({ id: 'info-old', publishedAt: '2026-10-07T00:00:00Z' }),
      makeNotice({ id: 'info-new', publishedAt: '2026-10-09T00:00:00Z' }),
    ]

    const result = matchNotices(notices, testContext, 'en')
    expect(result.map((entry: MatchedNotice) => entry.notice.id)).toEqual([
      'warning',
      'info-high',
      'info-new',
      'info-old',
    ])
  })

  it('ignores legacy dismissal preferences while retaining the read state', () => {
    const notice = makeNotice({ id: 'important', dismissible: true })
    const preferences = {
      'test:short-video-factory:important:1': { read: true, dismissed: true },
    }

    const [matched] = matchNotices([notice], testContext, 'en', Date.now(), preferences)
    expect(matched?.dismissed).toBe(false)
    expect(matched?.read).toBe(true)
  })
})
