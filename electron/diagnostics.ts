import archiver from 'archiver'
import { app, BrowserWindow, dialog, screen, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import si from 'systeminformation'
import { getLogDirectory } from './logger'

export type DiagnosticsExportPhase = 'collecting' | 'archiving'

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

interface CollectionResult<T> {
  data: T | null
  durationMs: number
  error?: string
}

async function collect<T>(name: string, operation: () => Promise<T>): Promise<CollectionResult<T>> {
  const startedAt = performance.now()
  try {
    return {
      data: await operation(),
      durationMs: Math.round(performance.now() - startedAt),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[Diagnostics] Failed to collect ${name}:`, message)
    return {
      data: null,
      durationMs: Math.round(performance.now() - startedAt),
      error: message,
    }
  }
}

async function buildSystemInfo(): Promise<string> {
  const graphics = await collect('graphics', () => si.graphics())
  const cpus = os.cpus()
  const totalMemory = os.totalmem()
  const freeMemory = os.freemem()

  const displays = screen.getAllDisplays().map((display) => ({
    id: display.id,
    bounds: display.bounds,
    workArea: display.workArea,
    scaleFactor: display.scaleFactor,
    rotation: display.rotation,
    colorDepth: display.colorDepth,
    depthPerComponent: display.depthPerComponent,
    displayFrequency: display.displayFrequency,
    colorSpace: display.colorSpace,
    internal: display.internal,
  }))

  return JSON.stringify(
    {
      generatedAt: new Date().toISOString(),
      schemaVersion: 3,
      collectionTimings: {
        graphics: graphics.durationMs,
      },
      collectionErrors: {
        graphics: graphics.error,
      },
      application: {
        name: app.getName(),
        version: app.getVersion(),
        packaged: app.isPackaged,
        locale: app.getLocale(),
      },
      runtime: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node,
        v8: process.versions.v8,
        processUptimeSeconds: Math.round(process.uptime()),
      },
      operatingSystem: {
        platform: process.platform,
        release: os.release(),
        version: os.version(),
        architecture: process.arch,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
      hardware: {
        cpu: {
          model: cpus[0]?.model ?? null,
          logicalCores: cpus.length,
          speedMHz: cpus[0]?.speed ?? null,
        },
        memory: {
          totalBytes: totalMemory,
          freeBytes: freeMemory,
          usedBytes: totalMemory - freeMemory,
        },
        graphics: {
          controllers: graphics.data?.controllers.map((controller) => ({
            model: controller.model,
            vendor: controller.vendor,
            bus: controller.bus,
            vramMB: controller.vram,
            vramDynamicMB: controller.vramDynamic,
            driverVersion: controller.driverVersion,
          })),
          displays: graphics.data?.displays.map((display) => ({
            model: display.model,
            vendor: display.vendor,
            main: display.main,
            builtin: display.builtin,
            connection: display.connection,
            resolution: `${display.currentResX}x${display.currentResY}`,
            refreshRateHz: display.currentRefreshRate,
            pixelDepth: display.pixelDepth,
          })),
        },
      },
      displays,
      graphics: {
        featureStatus: app.getGPUFeatureStatus(),
      },
      privacy: {
        excluded: [
          'serial numbers',
          'device UUIDs',
          'host name',
          'user name',
          'file paths',
          'IP addresses',
          'MAC addresses',
          'application secrets and content',
        ],
      },
    },
    null,
    2,
  )
}

export async function exportDiagnostics(
  win: BrowserWindow | null,
  onProgress: (phase: DiagnosticsExportPhase) => void,
): Promise<string | null> {
  const defaultPath = path.join(
    app.getPath('downloads'),
    `short-video-factory-diagnostics-${formatDate(new Date())}.zip`,
  )
  const dialogOptions = {
    title: 'Export diagnostics',
    defaultPath,
    filters: [{ name: 'ZIP archive', extensions: ['zip'] }],
  }
  const result = win
    ? await dialog.showSaveDialog(win, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions)
  if (result.canceled || !result.filePath) return null

  onProgress('collecting')
  const systemInfo = await buildSystemInfo()

  onProgress('archiving')
  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(result.filePath!)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.append(systemInfo, { name: 'system-info.json' })

    const logDir = getLogDirectory()
    if (fs.existsSync(logDir)) {
      archive.directory(logDir, 'logs')
    }
    void archive.finalize()
  })

  shell.showItemInFolder(result.filePath)
  return result.filePath
}
