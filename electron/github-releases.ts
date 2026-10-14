import axios from 'axios'
import { compare, prerelease, valid } from 'semver'
import { z } from 'zod'
import type { ReleaseChannel } from './metadata/types'

const GITHUB_API_BASE_URL = 'https://api.github.com/repos/YILS-LIN/short-video-factory'
const REQUEST_TIMEOUT_MS = 10000
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024
const MAX_RELEASE_NOTES_LENGTH = 100000

const GitHubReleaseSchema = z
  .object({
    tag_name: z.string().min(1).max(128),
    body: z.string().nullable().optional(),
    published_at: z.string().nullable().optional(),
    draft: z.boolean().optional(),
    prerelease: z.boolean().optional(),
  })
  .passthrough()

export interface GitHubRelease {
  version: string
  releaseNotes: Record<string, string>
  fallbackReleaseNotes: string
  releaseDate: string
}

interface GitHubNotes {
  releaseNotes: Record<string, string>
  fallbackReleaseNotes: string
}

type GitHubRequest = (url: string) => Promise<unknown>

export async function fetchGitHubRelease(
  channel: ReleaseChannel,
  request: GitHubRequest = requestGitHub,
): Promise<GitHubRelease | null> {
  if (channel === 'stable') {
    let response: unknown
    try {
      response = await request(`${GITHUB_API_BASE_URL}/releases/latest`)
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 404) return null
      throw error
    }

    const release = parseGitHubRelease(response)
    if (!release || release.prerelease) return null
    return toGitHubRelease(release)
  }

  const response = await request(`${GITHUB_API_BASE_URL}/releases?per_page=100`)
  if (!Array.isArray(response) || response.length > 100) {
    throw new Error('GitHub returned an invalid releases response.')
  }

  const releases = response
    .map(parseGitHubRelease)
    .filter((release): release is ParsedGitHubRelease => Boolean(release))
    .filter((release) => release.prerelease && getPrereleaseChannel(release.version) === channel)
    .sort((left, right) => compare(right.version, left.version))

  return releases[0] ? toGitHubRelease(releases[0]) : null
}

export function parseGitHubReleaseNotes(body: string | null | undefined): GitHubNotes {
  const notes = body ?? ''
  const pattern = /<!-- i18n:([A-Za-z0-9-]+):start -->\s*([\s\S]*?)\s*<!-- i18n:\1:end -->/g
  const parts: Array<{ locale?: string; content: string }> = []
  const locales = new Set<string>()
  let lastIndex = 0

  for (const match of notes.matchAll(pattern)) {
    const [, locale, content] = match
    const startIndex = match.index ?? lastIndex
    const commonContent = notes.slice(lastIndex, startIndex).trim()
    if (commonContent) parts.push({ content: commonContent })
    if (locale && content?.trim()) {
      locales.add(locale)
      parts.push({ locale, content: content.trim() })
    }
    lastIndex = startIndex + match[0].length
  }

  const commonContent = notes.slice(lastIndex).trim()
  if (commonContent) parts.push({ content: commonContent })

  if (locales.size === 0) {
    return { releaseNotes: {}, fallbackReleaseNotes: notes.trim() }
  }

  const commonFallback = parts
    .filter((part) => !part.locale)
    .map((part) => part.content)
    .join('\n\n')
  const releaseNotes = Object.fromEntries(
    [...locales].map((locale) => [
      locale,
      parts
        .filter((part) => !part.locale || part.locale === locale)
        .map((part) => part.content)
        .join('\n\n'),
    ]),
  )

  const fallbackReleaseNotes =
    commonFallback || releaseNotes['en'] || Object.values(releaseNotes)[0] || ''
  return { releaseNotes, fallbackReleaseNotes }
}

interface ParsedGitHubRelease {
  version: string
  body: string | null | undefined
  publishedAt: string
  prerelease: boolean
}

function parseGitHubRelease(value: unknown): ParsedGitHubRelease | null {
  const result = GitHubReleaseSchema.safeParse(value)
  if (!result.success || result.data.draft) return null

  const version = valid(result.data.tag_name)
  if (!version) return null

  const publishedAt = result.data.published_at ?? ''
  return {
    version,
    body: result.data.body?.slice(0, MAX_RELEASE_NOTES_LENGTH),
    publishedAt: Number.isFinite(Date.parse(publishedAt)) ? publishedAt : '',
    prerelease: result.data.prerelease ?? false,
  }
}

function toGitHubRelease(release: ParsedGitHubRelease): GitHubRelease {
  return {
    version: release.version,
    ...parseGitHubReleaseNotes(release.body),
    releaseDate: release.publishedAt,
  }
}

function getPrereleaseChannel(version: string): ReleaseChannel | null {
  const identifiers = prerelease(version)
  const first = identifiers?.[0]
  return first === 'beta' || first === 'nightly' ? first : null
}

async function requestGitHub(url: string): Promise<unknown> {
  const response = await axios.get<unknown>(url, {
    timeout: REQUEST_TIMEOUT_MS,
    maxContentLength: MAX_RESPONSE_BYTES,
    maxBodyLength: MAX_RESPONSE_BYTES,
    maxRedirects: 3,
    responseType: 'json',
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'short-video-factory',
    },
    transitional: { forcedJSONParsing: true, silentJSONParsing: false },
  })
  return response.data
}
