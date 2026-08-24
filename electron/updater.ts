import axios from 'axios'
import { BrowserWindow } from 'electron'

const LATEST_RELEASE_URL =
  'https://api.github.com/repos/YILS-LIN/short-video-factory/releases/latest'

export interface UpdateInfo {
  version: string
  releaseNotes: string
  releaseDate: string
}

export type UpdateCheckResult =
  | { status: 'available'; info: UpdateInfo }
  | { status: 'up-to-date' }
  | { status: 'error'; message: string }

interface GitHubLatestRelease {
  tag_name: string
  body: string | null
  published_at: string | null
}

let mainWindow: BrowserWindow | null = null
let checking: Promise<UpdateCheckResult> | null = null

function compareVersions(current: string, latest: string): number {
  const normalize = (version: string) => version.replace(/^v/, '').split('-')[0]
  const currentParts = normalize(current)
    .split('.')
    .map((part) => Number(part) || 0)
  const latestParts = normalize(latest)
    .split('.')
    .map((part) => Number(part) || 0)
  const length = Math.max(currentParts.length, latestParts.length)

  for (let index = 0; index < length; index++) {
    const difference = (latestParts[index] ?? 0) - (currentParts[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

export function initUpdateChecker(win: BrowserWindow) {
  mainWindow = win
}

export async function checkForUpdates(currentVersion: string): Promise<UpdateCheckResult> {
  if (checking) return checking

  checking = (async () => {
    try {
      const { data } = await axios.get<GitHubLatestRelease>(LATEST_RELEASE_URL, {
        timeout: 10000,
        headers: {
          Accept: 'application/vnd.github+json',
          'User-Agent': 'short-video-factory',
        },
      })
      const version = data.tag_name.replace(/^v/, '')

      if (!version || compareVersions(currentVersion, version) >= 0) {
        return { status: 'up-to-date' }
      }

      const info: UpdateInfo = {
        version,
        releaseNotes: data.body || '',
        releaseDate: data.published_at || '',
      }
      mainWindow?.webContents.send('update-available', info)
      return { status: 'available', info }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error('[Updater] Failed to check for updates:', message)
      return { status: 'error', message }
    } finally {
      checking = null
    }
  })()

  return checking
}
