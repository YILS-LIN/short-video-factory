import { app, BrowserWindow } from 'electron'
import axios from 'axios'
import { compare, satisfies, valid } from 'semver'
import { fetchGitHubRelease, type GitHubRelease } from './github-releases'
import { getMetadataState, refreshMetadata } from './metadata/runtime'
import type { MetadataClientContext, MetadataState } from './metadata/types'
import type { Release, UpdateNotesOverride, UpdatePolicy } from './metadata/schema'

const APP_HOMEPAGE = 'https://short-video-factory.yils.blog/'

export interface UpdateNotesOverrideInfo {
  mode: UpdateNotesOverride['mode']
  severity: UpdateNotesOverride['severity']
  defaultLocale: string
  translations: Record<string, { title: string; bodyMarkdown: string }>
}

export interface UpdateInfo {
  version: string | null
  minimumVersion: string | null
  releaseNotes: Record<string, string>
  fallbackReleaseNotes: string
  releaseDate: string
  mandatory: boolean
  assetAvailable: boolean | null
  homepage: string
  notesOverride: UpdateNotesOverrideInfo | null
  source: 'metadata' | 'github' | 'policy'
}

export type UpdateCheckResult =
  | { status: 'available'; info: UpdateInfo }
  | { status: 'up-to-date' }
  | { status: 'no-release' }
  | { status: 'error'; message: string }

interface UpdateCandidate {
  version: string
  releaseNotes: Record<string, string>
  fallbackReleaseNotes: string
  releaseDate: string
  mandatory: boolean
  assetAvailable: boolean | null
  source: 'metadata' | 'github'
}

interface MetadataSnapshot {
  state: MetadataState | null
  error: unknown | null
}

let mainWindow: BrowserWindow | null = null
let checking: Promise<UpdateCheckResult> | null = null

export function initUpdateChecker(win: BrowserWindow) {
  mainWindow = win
}

export async function checkForUpdates(
  currentVersion = app.getVersion(),
): Promise<UpdateCheckResult> {
  if (checking) return checking

  checking = (async () => {
    try {
      if (!valid(currentVersion)) {
        throw new Error('The installed application version is not valid SemVer.')
      }

      const previousState = await getMetadataState().catch((error: unknown) => {
        console.warn('[Updater] Could not read local metadata snapshot:', getErrorMessage(error))
        return null
      })
      const channel = previousState?.context.releaseChannel ?? 'stable'
      const metadataPromise = refreshMetadataSnapshot(previousState)
      const githubPromise = fetchGitHubRelease(channel)
      const [metadataResult, githubResult] = await Promise.allSettled([
        metadataPromise,
        githubPromise,
      ])

      const metadata = metadataResult.status === 'fulfilled' ? metadataResult.value : null
      const githubRelease = githubResult.status === 'fulfilled' ? githubResult.value : null

      if (metadata?.error) {
        console.warn(
          '[Updater] Metadata API unavailable; using its last verified snapshot and GitHub fallback:',
          getErrorMessage(metadata.error),
        )
      }
      if (githubResult.status === 'rejected') {
        console.warn('[Updater] GitHub release check failed:', getErrorMessage(githubResult.reason))
      }

      const result = resolveUpdateResult({
        currentVersion,
        state: metadata?.state ?? previousState,
        githubRelease,
        githubAvailable: githubResult.status === 'fulfilled',
      })

      if (
        result.status === 'available' &&
        mainWindow &&
        !mainWindow.isDestroyed() &&
        !mainWindow.webContents.isDestroyed()
      ) {
        mainWindow.webContents.send('update-available', result.info)
      }
      return result
    } catch (error) {
      const message = getErrorMessage(error)
      console.error('[Updater] Failed to check for updates:', message)
      return { status: 'error', message }
    } finally {
      checking = null
    }
  })()

  return checking
}

async function refreshMetadataSnapshot(
  previousState: MetadataState | null,
): Promise<MetadataSnapshot> {
  try {
    return { state: await refreshMetadata(), error: null }
  } catch (error) {
    const state = await getMetadataState().catch(() => previousState)
    return { state, error }
  }
}

function resolveUpdateResult(options: {
  currentVersion: string
  state: MetadataState | null
  githubRelease: GitHubRelease | null
  githubAvailable: boolean
}): UpdateCheckResult {
  const { currentVersion, state, githubRelease, githubAvailable } = options
  const payload = state?.payload
  const metadataRelease = payload?.release ?? null
  const policy = payload?.updatePolicy ?? null
  const minimumVersion = getMinimumSupportedVersion(policy, metadataRelease)
  const homepage = payload?.app.homepage || APP_HOMEPAGE
  const minimumNotMet = Boolean(minimumVersion && compare(currentVersion, minimumVersion) < 0)

  const metadataCandidate = metadataRelease
    ? makeMetadataCandidate(metadataRelease, state?.context, currentVersion, minimumVersion)
    : null
  const githubCandidate = githubRelease
    ? makeGitHubCandidate(githubRelease, currentVersion, minimumVersion)
    : null

  // A complete, applicable metadata Release takes precedence. A stale one does not mask GitHub.
  const candidate = metadataCandidate ?? githubCandidate
  if (candidate) {
    const notesOverride = getApplicableNotesOverride(policy, candidate.version)
    return {
      status: 'available',
      info: {
        version: candidate.version,
        minimumVersion,
        releaseNotes: candidate.releaseNotes,
        fallbackReleaseNotes: candidate.fallbackReleaseNotes,
        releaseDate: candidate.releaseDate,
        mandatory: candidate.mandatory || minimumNotMet,
        assetAvailable: candidate.assetAvailable,
        homepage,
        notesOverride,
        source: candidate.source,
      },
    }
  }

  if (minimumNotMet && minimumVersion) {
    return {
      status: 'available',
      info: {
        version: null,
        minimumVersion,
        releaseNotes: {},
        fallbackReleaseNotes: '',
        releaseDate: '',
        mandatory: true,
        assetAvailable: null,
        homepage,
        notesOverride: null,
        source: 'policy',
      },
    }
  }

  if (githubAvailable) {
    const hasKnownRelease = Boolean(metadataRelease || githubRelease)
    if (hasKnownRelease) return { status: 'up-to-date' }
    return { status: 'no-release' }
  }

  return {
    status: 'error',
    message: getErrorMessage(new Error('GitHub release information is unavailable.')),
  }
}

function makeMetadataCandidate(
  release: Release,
  context: MetadataClientContext | undefined,
  currentVersion: string,
  minimumVersion: string | null,
): UpdateCandidate | null {
  if (compare(release.version, currentVersion) <= 0) return null
  if (minimumVersion && compare(release.version, minimumVersion) < 0) return null

  return {
    version: release.version,
    releaseNotes: release.releaseNotesTranslations ?? {},
    fallbackReleaseNotes: release.releaseNotes,
    releaseDate: release.publishedAt,
    mandatory: Boolean(
      (release.minSupportedVersion && compare(currentVersion, release.minSupportedVersion) < 0) ||
        (release.forceUpdate && compare(currentVersion, release.version) < 0),
    ),
    assetAvailable: context ? hasCompatibleAsset(release.assets, context) : null,
    source: 'metadata',
  }
}

function makeGitHubCandidate(
  release: GitHubRelease,
  currentVersion: string,
  minimumVersion: string | null,
): UpdateCandidate | null {
  if (!valid(release.version) || compare(release.version, currentVersion) <= 0) return null
  if (minimumVersion && compare(release.version, minimumVersion) < 0) return null

  return {
    version: release.version,
    releaseNotes: release.releaseNotes,
    fallbackReleaseNotes: release.fallbackReleaseNotes,
    releaseDate: release.releaseDate,
    mandatory: false,
    // GitHub asset names do not provide a reliable platform/architecture contract.
    assetAvailable: null,
    source: 'github',
  }
}

function getMinimumSupportedVersion(
  policy: UpdatePolicy | null,
  release: Release | null,
): string | null {
  const candidates = [policy?.minSupportedVersion, release?.minSupportedVersion].filter(
    (version): version is string => Boolean(version),
  )
  return candidates.reduce<string | null>(
    (currentMinimum, version) =>
      !currentMinimum || compare(version, currentMinimum) > 0 ? version : currentMinimum,
    null,
  )
}

function getApplicableNotesOverride(
  policy: UpdatePolicy | null,
  targetVersion: string,
): UpdateNotesOverrideInfo | null {
  const notesOverride = policy?.notesOverride
  if (!notesOverride || !satisfies(targetVersion, notesOverride.versionRange)) return null
  return {
    mode: notesOverride.mode,
    severity: notesOverride.severity,
    defaultLocale: notesOverride.defaultLocale,
    translations: notesOverride.translations,
  }
}

function hasCompatibleAsset(
  assets: Array<{ platform: string; arch: string }>,
  context: MetadataClientContext,
): boolean {
  return assets.some(
    (asset) =>
      asset.platform === context.platform &&
      (asset.arch === context.architecture ||
        (context.platform === 'macos' && asset.arch === 'universal')),
  )
}

function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    if (error.response) return `HTTP ${error.response.status}`
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') return 'Request timed out.'
    return 'Network request failed.'
  }
  return error instanceof Error ? error.message : String(error)
}
