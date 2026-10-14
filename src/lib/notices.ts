import { satisfies, valid } from 'semver'
import type { MetadataClientContext } from '~/electron/metadata/types'
import type { Notice, NoticeTranslation } from '~/electron/metadata/schema'

export interface NoticePreference {
  read: boolean
  dismissed: boolean
}

export interface MatchedNotice {
  notice: Notice
  translation: NoticeTranslation
  read: boolean
  dismissed: boolean
}

const severityOrder = { critical: 4, warning: 3, info: 2, success: 1 } as const
const knownTargetKeys = new Set([
  'versionRange',
  'platforms',
  'architectures',
  'channels',
  'distributionChannels',
  'requiredCapabilities',
])

export function matchNotices(
  notices: Notice[],
  context: MetadataClientContext,
  locale: string,
  now = Date.now(),
  preferences: Record<string, NoticePreference> = {},
): MatchedNotice[] {
  return notices
    .flatMap((notice) => {
      if (!isNoticeActive(notice, now) || !matchesNoticeTarget(notice, context)) return []
      const translation = selectNoticeTranslation(notice, locale)
      if (!translation) return []
      const preference = preferences[getNoticePreferenceKey(context, notice)]
      return [
        {
          notice,
          translation,
          read: preference?.read ?? false,
          // Legacy dismissal preferences no longer suppress announcements.
          dismissed: false,
        },
      ]
    })
    .sort(compareNotices)
}

export function isNoticeActive(notice: Notice, now = Date.now()): boolean {
  if (notice.startsAt && Date.parse(notice.startsAt) > now) return false
  if (notice.expiresAt && Date.parse(notice.expiresAt) <= now) return false
  return true
}

export function matchesNoticeTarget(notice: Notice, context: MetadataClientContext): boolean {
  const targets = notice.targets
  if (!targets) return true

  for (const key of Object.keys(targets)) {
    if (!knownTargetKeys.has(key)) return false
  }

  if (targets.versionRange) {
    if (!valid(context.version) || !satisfies(context.version, targets.versionRange)) return false
  }
  if (targets.platforms && !targets.platforms.includes(context.platform)) return false
  if (targets.architectures && !targets.architectures.includes(context.architecture)) return false
  if (targets.channels && !targets.channels.includes(context.releaseChannel)) return false
  if (
    targets.distributionChannels &&
    !targets.distributionChannels.includes(context.distributionChannel)
  ) {
    return false
  }
  if (
    targets.requiredCapabilities &&
    !targets.requiredCapabilities.every((capability) => context.capabilities.includes(capability))
  ) {
    return false
  }

  return true
}

export function selectNoticeTranslation(notice: Notice, locale: string): NoticeTranslation | null {
  const translations = notice.translations
  for (const fallbackLocale of getLocaleFallbacks(locale)) {
    if (Object.prototype.hasOwnProperty.call(translations, fallbackLocale)) {
      return translations[fallbackLocale] ?? null
    }
  }

  return translations[notice.defaultLocale] ?? null
}

export function getLocaleFallbacks(locale: string): string[] {
  const fallbacks: string[] = []
  let candidate = locale

  while (candidate) {
    fallbacks.push(candidate)
    const separator = candidate.lastIndexOf('-')
    if (separator < 0) break
    candidate = candidate.slice(0, separator)
  }

  return fallbacks
}

export function getNoticePreferenceKey(context: MetadataClientContext, notice: Notice): string {
  return `${context.environment}:${context.apiAppId}:${notice.id}:${notice.revision}`
}

export function getNextNoticeBoundary(notices: Notice[], now = Date.now()): number | null {
  const boundaries = notices
    .flatMap((notice) => [notice.startsAt, notice.expiresAt])
    .filter((value): value is string => Boolean(value))
    .map((value) => Date.parse(value))
    .filter((value) => Number.isFinite(value) && value > now)
  return boundaries.length ? Math.min(...boundaries) : null
}

function compareNotices(left: MatchedNotice, right: MatchedNotice): number {
  const severityDifference =
    severityOrder[right.notice.severity] - severityOrder[left.notice.severity]
  if (severityDifference) return severityDifference
  const priorityDifference = right.notice.priority - left.notice.priority
  if (priorityDifference) return priorityDifference
  const publishedDifference = right.notice.publishedAt.localeCompare(left.notice.publishedAt)
  return publishedDifference || left.notice.id.localeCompare(right.notice.id)
}
