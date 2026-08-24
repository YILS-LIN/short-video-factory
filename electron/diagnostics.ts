import archiver from 'archiver'
import { app, BrowserWindow, dialog, shell } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getLogDirectory } from './logger'

function formatDate(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`
}

function buildSystemInfo(): string {
  return [
    `Application: ${app.getName()}`,
    `Version: ${app.getVersion()}`,
    `Electron: ${process.versions.electron}`,
    `Chrome: ${process.versions.chrome}`,
    `Node: ${process.versions.node}`,
    `Platform: ${process.platform} ${os.release()} (${os.arch()})`,
    `Locale: ${app.getLocale()}`,
    `Generated at: ${new Date().toISOString()}`,
  ].join('\n')
}

export async function exportDiagnostics(win: BrowserWindow | null): Promise<string | null> {
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

  await new Promise<void>((resolve, reject) => {
    const output = fs.createWriteStream(result.filePath!)
    const archive = archiver('zip', { zlib: { level: 9 } })

    output.on('close', resolve)
    output.on('error', reject)
    archive.on('error', reject)
    archive.pipe(output)
    archive.append(buildSystemInfo(), { name: 'system-info.txt' })

    const logDir = getLogDirectory()
    if (fs.existsSync(logDir)) {
      archive.directory(logDir, 'logs')
    }
    void archive.finalize()
  })

  shell.showItemInFolder(result.filePath)
  return result.filePath
}
