import { app } from 'electron'
import log from 'electron-log/main'
import fs from 'node:fs'
import path from 'node:path'

export type AppLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug'

const LOG_RETENTION_DAYS = 7
const LOG_FILE_NAME_RE = /^app-(\d{4})-(\d{2})-(\d{2})\.log$/

let initialized = false

function pad(value: number): string {
  return String(value).padStart(2, '0')
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

function normalizeArg(arg: unknown): string {
  if (arg instanceof Error) {
    return arg.stack || `${arg.name}: ${arg.message}`
  }

  if (typeof arg === 'string') {
    return arg
  }

  try {
    return JSON.stringify(arg)
  } catch {
    return String(arg)
  }
}

function getLogDir(): string {
  return path.join(app.getPath('userData'), 'logs')
}

function cleanupOldLogs(logDir: string) {
  const retentionMs = LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const now = Date.now()

  for (const entry of fs.readdirSync(logDir, { withFileTypes: true })) {
    if (!entry.isFile()) continue

    const matched = entry.name.match(LOG_FILE_NAME_RE)
    if (!matched) continue

    const fileTime = new Date(
      Number(matched[1]),
      Number(matched[2]) - 1,
      Number(matched[3]),
    ).getTime()
    if (!Number.isNaN(fileTime) && now - fileTime > retentionMs) {
      fs.unlinkSync(path.join(logDir, entry.name))
    }
  }
}

function writeTaggedLog(processTag: 'MAIN' | 'RENDERER', level: AppLogLevel, args: unknown[]) {
  const timestamp = new Date().toLocaleString('sv-SE').replace('T', ' ')
  const text = args.map(normalizeArg).join(' ')
  const logLevel = level === 'log' ? 'info' : level

  ;(log[logLevel] as (...items: unknown[]) => void)(
    `[${processTag}] ${timestamp} [${level.toUpperCase()}] ${text}`,
  )
}

export function initLogger() {
  if (initialized) return

  const logDir = getLogDir()
  fs.mkdirSync(logDir, { recursive: true })
  log.transports.console.level = false
  log.transports.file.level = 'debug'
  log.transports.file.format = '{text}'
  log.transports.file.resolvePathFn = () => path.join(logDir, `app-${formatDate(new Date())}.log`)
  cleanupOldLogs(logDir)
  initialized = true
}

export function writeMainLog(level: AppLogLevel, ...args: unknown[]) {
  writeTaggedLog('MAIN', level, args)
}

export function writeRendererLog(level: AppLogLevel, ...args: unknown[]) {
  writeTaggedLog('RENDERER', level, args)
}

export function getLogDirectory(): string {
  return getLogDir()
}
