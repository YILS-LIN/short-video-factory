import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { MetadataState } from '../../electron/metadata/types'
import { makePayload, testContext } from './fixtures'

const { refreshMetadata, getMetadataState, getVersion, fetchGitHubRelease } = vi.hoisted(() => ({
  refreshMetadata: vi.fn(),
  getMetadataState: vi.fn(),
  getVersion: vi.fn(() => '1.2.2'),
  fetchGitHubRelease: vi.fn(),
}))

vi.mock('electron', () => ({
  app: { getVersion },
  BrowserWindow: class BrowserWindow {},
}))
vi.mock('../../electron/metadata/runtime', () => ({ refreshMetadata, getMetadataState }))
vi.mock('../../electron/github-releases', () => ({ fetchGitHubRelease }))

import { checkForUpdates } from '../../electron/updater'

function makeState(
  release: Record<string, unknown> | null,
  updatePolicy: Record<string, unknown> | null = null,
): MetadataState {
  const payload = makePayload({ release, updatePolicy }) as MetadataState['payload']
  return {
    sequence: 1,
    phase: 'ready',
    context: testContext,
    payload,
    lastSuccessAt: '2026-10-09T00:00:00Z',
    error: null,
  }
}

const metadataRelease = {
  version: '1.2.3',
  channel: 'stable',
  publishedAt: '2026-10-09T00:00:00Z',
  releaseNotes: 'Metadata default notes',
  releaseNotesTranslations: { 'zh-CN': 'Metadata Chinese notes' },
  forceUpdate: false,
  assets: [
    {
      platform: 'windows',
      arch: 'x64',
      url: 'https://example.com/app.exe',
      sha256: 'a'.repeat(64),
      size: 10,
    },
  ],
}

const githubRelease = {
  version: '1.2.3',
  releaseNotes: { en: 'GitHub English notes', 'zh-CN': 'GitHub Chinese notes' },
  fallbackReleaseNotes: 'Common GitHub notes',
  releaseDate: '2026-10-09T00:00:00Z',
}

describe('GitHub and Manifest update checks', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getVersion.mockReturnValue('1.2.2')
    getMetadataState.mockResolvedValue(makeState(null))
    refreshMetadata.mockResolvedValue(makeState(null))
    fetchGitHubRelease.mockResolvedValue(null)
  })

  it('returns no-release separately when neither source has release information', async () => {
    await expect(checkForUpdates()).resolves.toEqual({ status: 'no-release' })
    expect(fetchGitHubRelease).toHaveBeenCalledWith('stable')
  })

  it('uses the GitHub release when the Manifest has no full Release', async () => {
    fetchGitHubRelease.mockResolvedValue(githubRelease)

    const result = await checkForUpdates()

    expect(result.status).toBe('available')
    if (result.status !== 'available') throw new Error('Expected an available update')
    expect(result.info.version).toBe('1.2.3')
    expect(result.info.releaseNotes).toEqual(githubRelease.releaseNotes)
    expect(result.info.fallbackReleaseNotes).toBe('Common GitHub notes')
    expect(result.info.assetAvailable).toBeNull()
    expect(result.info.source).toBe('github')
  })

  it('prefers a newer full Manifest Release over GitHub', async () => {
    refreshMetadata.mockResolvedValue(makeState(metadataRelease))
    fetchGitHubRelease.mockResolvedValue({ ...githubRelease, version: '1.2.4' })

    const result = await checkForUpdates()

    expect(result.status).toBe('available')
    if (result.status !== 'available') throw new Error('Expected an available update')
    expect(result.info.version).toBe('1.2.3')
    expect(result.info.releaseNotes).toEqual({ 'zh-CN': 'Metadata Chinese notes' })
    expect(result.info.assetAvailable).toBe(true)
    expect(result.info.source).toBe('metadata')
  })

  it('falls back to GitHub when the metadata request fails without surfacing that error', async () => {
    refreshMetadata.mockRejectedValue(new Error('Metadata API request failed with HTTP 503.'))
    fetchGitHubRelease.mockResolvedValue(githubRelease)

    const result = await checkForUpdates()

    expect(result.status).toBe('available')
    if (result.status === 'available') expect(result.info.source).toBe('github')
  })

  it('uses a verified metadata snapshot when GitHub is unavailable', async () => {
    refreshMetadata.mockResolvedValue(makeState(metadataRelease))
    fetchGitHubRelease.mockRejectedValue(new Error('GitHub request timed out.'))

    const result = await checkForUpdates()

    expect(result.status).toBe('available')
    if (result.status === 'available') expect(result.info.source).toBe('metadata')
  })

  it('uses GitHub when a metadata Release is stale', async () => {
    getVersion.mockReturnValue('1.2.3')
    refreshMetadata.mockResolvedValue(makeState(metadataRelease))
    fetchGitHubRelease.mockResolvedValue({ ...githubRelease, version: '1.2.4' })

    const result = await checkForUpdates()

    expect(result.status).toBe('available')
    if (result.status === 'available') {
      expect(result.info.version).toBe('1.2.4')
      expect(result.info.source).toBe('github')
    }
  })

  it('reports up-to-date only after a successful GitHub check', async () => {
    getVersion.mockReturnValue('1.2.3')
    fetchGitHubRelease.mockResolvedValue({ ...githubRelease, version: '1.2.3' })

    await expect(checkForUpdates()).resolves.toEqual({ status: 'up-to-date' })
  })

  it('does not report up-to-date when GitHub is unavailable and metadata is empty', async () => {
    fetchGitHubRelease.mockRejectedValue(new Error('GitHub offline'))

    await expect(checkForUpdates()).resolves.toMatchObject({ status: 'error' })
  })

  it('applies a notes override only when its target range matches', async () => {
    const updatePolicy = {
      notesOverride: {
        versionRange: '>=1.2.3 <1.3.0',
        mode: 'prepend',
        severity: 'warning',
        defaultLocale: 'en',
        translations: {
          en: { title: 'Important', bodyMarkdown: 'Read this first.' },
        },
      },
    }
    refreshMetadata.mockResolvedValue(makeState(null, updatePolicy))
    fetchGitHubRelease.mockResolvedValue(githubRelease)

    const result = await checkForUpdates()

    expect(result.status).toBe('available')
    if (result.status === 'available') {
      expect(result.info.notesOverride).toEqual({
        mode: 'prepend',
        severity: 'warning',
        defaultLocale: 'en',
        translations: updatePolicy.notesOverride.translations,
      })
    }

    fetchGitHubRelease.mockResolvedValue({ ...githubRelease, version: '1.3.0' })
    const nonmatchingResult = await checkForUpdates()
    expect(nonmatchingResult.status).toBe('available')
    if (nonmatchingResult.status === 'available') {
      expect(nonmatchingResult.info.notesOverride).toBeNull()
    }
  })

  it('marks updates below the configured minimum as advisory mandatory', async () => {
    refreshMetadata.mockResolvedValue(makeState(null, { minSupportedVersion: '1.2.3' }))
    fetchGitHubRelease.mockResolvedValue(githubRelease)

    const result = await checkForUpdates()

    expect(result.status).toBe('available')
    if (result.status === 'available') {
      expect(result.info.mandatory).toBe(true)
      expect(result.info.minimumVersion).toBe('1.2.3')
      expect(result.info.version).toBe('1.2.3')
    }
  })

  it('does not offer a target below the minimum and reports the required minimum instead', async () => {
    refreshMetadata.mockResolvedValue(makeState(null, { minSupportedVersion: '1.3.0' }))
    fetchGitHubRelease.mockResolvedValue({ ...githubRelease, version: '1.2.9' })

    const result = await checkForUpdates()

    expect(result.status).toBe('available')
    if (result.status === 'available') {
      expect(result.info.version).toBeNull()
      expect(result.info.minimumVersion).toBe('1.3.0')
      expect(result.info.mandatory).toBe(true)
      expect(result.info.source).toBe('policy')
    }
  })

  it('returns an error only when no usable source can determine an update', async () => {
    refreshMetadata.mockRejectedValue(new Error('Metadata offline'))
    getMetadataState.mockResolvedValue({ ...makeState(null), payload: null })
    fetchGitHubRelease.mockRejectedValue(new Error('GitHub offline'))

    await expect(checkForUpdates()).resolves.toMatchObject({ status: 'error' })
  })
})
