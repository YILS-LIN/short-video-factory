import { app, BrowserWindow } from 'electron'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { FileMetadataCache } from './cache'
import { createMetadataClientContext, getMetadataBuildConfig } from './config'
import { MetadataService } from './service'
import type { MetadataState } from './types'

let service: MetadataService | null = null
let unsubscribe: (() => void) | null = null

function getService(): MetadataService {
  if (service) return service

  const config = getMetadataBuildConfig()
  const context = createMetadataClientContext(
    config,
    app.getVersion(),
    process.platform,
    process.arch,
  )
  const storageId = createHash('sha256')
    .update(
      `${config.environment}\0${config.apiBaseUrl}\0${config.appId}\0${context.releaseChannel}`,
    )
    .digest('hex')
    .slice(0, 16)
  const cache = new FileMetadataCache(
    path.join(app.getPath('userData'), `metadata-${storageId}.json`),
  )

  service = new MetadataService({ config, context, cache })
  return service
}

export function initializeMetadataService(): void {
  const metadataService = getService()
  if (unsubscribe) return

  unsubscribe = metadataService.subscribe((state) => {
    for (const window of BrowserWindow.getAllWindows()) {
      if (!window.isDestroyed() && !window.webContents.isDestroyed()) {
        window.webContents.send('metadata-state-changed', state)
      }
    }
  })
}

export function getMetadataState(): Promise<MetadataState> {
  return getService().getState()
}

export function refreshMetadata(): Promise<MetadataState> {
  return getService().refresh()
}
