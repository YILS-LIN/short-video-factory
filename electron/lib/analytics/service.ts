import axios from 'axios'
import { app } from 'electron'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import type {
  AnalyticsContextParams,
  AnalyticsEventName,
  AnalyticsTrackParams,
} from '../../analytics-types'
import { isDev } from '../is-dev'
import { isAnalyticsEventName, sanitizeAnalyticsData } from './schema'
import {
  createAnalyticsState,
  getAnalyticsDate,
  parseAnalyticsState,
  type AnalyticsState,
} from './state'

declare const __APP_ANALYTICS_BUILD_INFO__: {
  productName: string
  appId: string
  packageName: string
  buildId: string
  distributionChannel: string
}

const STAT_API_URL = 'https://stat.yils.blog/api/batch'
const WEBSITE_ID = 'a15a52e1-e2ad-4cc7-a6f1-c0979e8dd9c7'
const APP_HOSTNAME = 'short-video-factory.app'
const APP_URL = '/desktop'
const ANALYTICS_SCHEMA_VERSION = 2
const MAX_QUEUE_SIZE = 200
const MAX_BATCH_SIZE = 10
const BATCH_DELAY_MS = 3000
const MAX_RETRIES = 2
const REPLACEABLE_EVENTS = new Set<AnalyticsEventName>([
  'app_active',
  'app_ready',
  'update_check_finished',
  'text_generation_finished',
  'tts_preview_finished',
  'provider_test_finished',
  'media_import_finished',
])

interface UmamiEvent {
  type: 'event'
  payload: {
    website: string
    id: string
    hostname: string
    url: string
    title: string
    language: string
    referrer: string
    name: AnalyticsEventName
    timestamp: number
    data?: Record<string, unknown>
  }
}

interface QueuedEvent {
  eventName: AnalyticsEventName
  request: UmamiEvent
  retries: number
}

const pending: QueuedEvent[] = []
let state: AnalyticsState | null = null
let statePath: string | null = null
let initialization: Promise<void> | null = null
let flushPromise: Promise<void> | null = null
let flushTimer: NodeJS.Timeout | null = null
let cacheToken: string | undefined
let uiTitle = ''
let uiLocale = ''
let readyReported = false
let registeredWindowId: number | null = null
let lastActivityCreditAt = 0

const buildInfo = (() => {
  try {
    return __APP_ANALYTICS_BUILD_INFO__
  } catch {
    return {
      productName: 'unknown',
      appId: 'unknown',
      packageName: 'unknown',
      buildId: 'unknown',
      distributionChannel: 'unknown',
    }
  }
})()

function logDevWarning(...args: unknown[]) {
  if (isDev) console.warn('[analytics]', ...args)
}

function getWebsiteId(): string | null {
  if (!isDev) return WEBSITE_ID
  if (!isAnalyticsInDevEnabled()) return null
  const developmentWebsiteId = process.env['ANALYTICS_DEV_WEBSITE_ID']?.trim()
  return developmentWebsiteId || null
}

function isAnalyticsInDevEnabled(): boolean {
  const value = process.env['ANALYTICS_IN_DEV']?.trim().toLowerCase()
  return ['1', 'true', 'yes', 'on'].includes(value ?? '')
}

function getPackageVersion(): string {
  return app.getVersion().slice(0, 40)
}

function saveState() {
  if (!state || !statePath) return
  const temporaryPath = `${statePath}.${process.pid}.tmp`
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify(state), { encoding: 'utf8', mode: 0o600 })
    fs.renameSync(temporaryPath, statePath)
  } catch (error) {
    try {
      fs.rmSync(temporaryPath, { force: true })
    } catch {
      // Keep analytics persistence best-effort.
    }
    logDevWarning('failed to persist local state', error)
  }
}

function loadState(): boolean {
  const fileName = isDev ? 'analytics-state.dev.json' : 'analytics-state.json'
  statePath = path.join(app.getPath('userData'), fileName)

  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as unknown
    state = parseAnalyticsState(parsed)
    if (state) return false
  } catch {
    // A missing or damaged state file starts a new anonymous installation identity.
  }

  state = createAnalyticsState(getPackageVersion())
  saveState()
  return true
}

function getSafeUiTitle(value: unknown): string {
  if (typeof value !== 'string') return ''
  return value
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 120)
}

function getSafeLocale(value: unknown): string {
  if (typeof value !== 'string') return ''
  const normalized = value.trim().slice(0, 16)
  return /^[a-z]{2,3}(?:-[A-Z]{2})?$/.test(normalized) ? normalized : ''
}

function getPublicEventData(): Record<string, string | number> {
  const release = os.release().split('.')[0]?.slice(0, 12) || 'unknown'
  return {
    schema_version: ANALYTICS_SCHEMA_VERSION,
    app_version: getPackageVersion(),
    first_observed_version: state?.firstObservedVersion ?? getPackageVersion(),
    platform: process.platform,
    arch: process.arch,
    os_major: release,
    app_locale: uiLocale || app.getLocale() || 'zh-CN',
    ui_app_title: (uiTitle || app.getName()).slice(0, 120),
    build_id: buildInfo.buildId.slice(0, 40) || 'unknown',
    distribution_channel: buildInfo.distributionChannel.slice(0, 40) || 'unknown',
    app_name: app.getName().slice(0, 100),
    product_name: buildInfo.productName.slice(0, 100),
    package_name: buildInfo.packageName.slice(0, 100),
    app_id: buildInfo.appId.slice(0, 100),
  }
}

function createEvent(
  eventName: AnalyticsEventName,
  data: Record<string, unknown>,
): QueuedEvent | null {
  if (!state) return null
  const website = getWebsiteId()
  if (!website) return null

  const eventData = {
    ...getPublicEventData(),
    ...data,
  }
  const payload: UmamiEvent = {
    type: 'event',
    payload: {
      website,
      id: state.installationId,
      hostname: APP_HOSTNAME,
      url: APP_URL,
      title: uiTitle || app.getName().slice(0, 120),
      language: uiLocale || app.getLocale() || 'zh-CN',
      referrer: '',
      name: eventName,
      timestamp: Math.floor(
        (eventName === 'installation_first_seen' ? Date.parse(state.firstObservedAt) : Date.now()) /
          1000,
      ),
      ...(Object.keys(eventData).length ? { data: eventData } : {}),
    },
  }

  return { eventName, request: payload, retries: 0 }
}

function scheduleFlush(delay = BATCH_DELAY_MS) {
  if (pending.length === 0 || !getWebsiteId()) return
  if (flushTimer && delay > 0) return
  if (flushTimer) clearTimeout(flushTimer)
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushAnalytics()
  }, delay)
}

function enqueue(eventName: AnalyticsEventName, data: Record<string, unknown> = {}) {
  const entry = createEvent(eventName, data)
  if (!entry) return

  if (!makeQueueRoom(eventName)) return

  pending.push(entry)
  if (pending.length >= MAX_BATCH_SIZE) scheduleFlush(0)
  else scheduleFlush()
}

function makeQueueRoom(eventName: AnalyticsEventName): boolean {
  if (pending.length < MAX_QUEUE_SIZE) return true
  const replaceableIndex = pending.findIndex(({ eventName: queuedName }) =>
    REPLACEABLE_EVENTS.has(queuedName),
  )
  if (replaceableIndex >= 0) {
    pending.splice(replaceableIndex, 1)
    return true
  }
  if (REPLACEABLE_EVENTS.has(eventName)) return false
  pending.shift()
  return true
}

function appendUnique(items: string[], item: string) {
  if (items.includes(item)) return
  items.push(item)
  if (items.length > 200) items.splice(0, items.length - 200)
}

function getTimeToValueBucket(durationMs: number): string {
  if (durationMs < 3 * 60_000) return '<3m'
  if (durationMs < 10 * 60_000) return '3–10m'
  if (durationMs < 30 * 60_000) return '10–30m'
  if (durationMs < 60 * 60_000) return '30–60m'
  return '≥60m'
}

async function ensureInitialized(): Promise<void> {
  if (state) return
  if (initialization) return initialization

  initialization = Promise.resolve().then(() => {
    const isFirstObservation = loadState()
    if (isFirstObservation || !state?.firstSeenDelivered) {
      enqueue('installation_first_seen')
    }
    enqueue('app_started')
  })
  await initialization
}

export async function startAnalytics(): Promise<void> {
  try {
    await ensureInitialized()
  } catch (error) {
    logDevWarning('initialization failed', error)
  }
}

export function registerAnalyticsWindow(webContentsId: number) {
  registeredWindowId = webContentsId
}

export function isTrustedAnalyticsSender(
  webContentsId: number,
  isMainFrame: boolean,
  frameUrl: string,
): boolean {
  if (webContentsId !== registeredWindowId || !isMainFrame) return false

  try {
    const parsed = new URL(frameUrl)
    if (isDev) {
      const devUrl = process.env['VITE_DEV_SERVER_URL']
      return Boolean(devUrl && parsed.origin === new URL(devUrl).origin)
    }
    if (parsed.protocol !== 'file:') return false
    const targetPath = path.resolve(fileURLToPath(parsed))
    const expectedPath = path.resolve(process.env.APP_ROOT, 'dist', 'index.html')
    return targetPath.toLowerCase() === expectedPath.toLowerCase()
  } catch {
    return false
  }
}

export async function setAnalyticsContext(params: AnalyticsContextParams): Promise<void> {
  await ensureInitialized()
  uiTitle = getSafeUiTitle(params?.title)
  uiLocale = getSafeLocale(params?.locale)
  if (!readyReported) {
    readyReported = true
    enqueue('app_ready')
  }
}

function markActiveDate(now = new Date()): boolean {
  if (!state) return false
  const date = getAnalyticsDate(now)
  if (state.lastReportedActiveDate === date) return false
  state.lastReportedActiveDate = date
  saveState()
  return true
}

export async function markAnalyticsActive(durationMs: unknown): Promise<void> {
  await ensureInitialized()
  const now = Date.now()

  if (
    typeof durationMs === 'number' &&
    Number.isSafeInteger(durationMs) &&
    durationMs > 0 &&
    durationMs <= 60_000 &&
    now - lastActivityCreditAt >= 30_000
  ) {
    lastActivityCreditAt = now
    if (state && !state.firstSuccessAt) {
      state.activeMsBeforeFirstSuccess += durationMs
      saveState()
    }
  }

  if (markActiveDate()) enqueue('app_active')
}

function markActivityFromEvent(eventName: AnalyticsEventName) {
  if (
    eventName === 'installation_first_seen' ||
    eventName === 'app_started' ||
    eventName === 'app_ready' ||
    eventName === 'app_active'
  ) {
    return
  }

  markActiveDate()
}

function processGenerationMilestones(
  eventName: AnalyticsEventName,
  data: Record<string, unknown>,
): boolean {
  if (!state) return true
  const operationId = typeof data.operation_id === 'string' ? data.operation_id : ''

  if (eventName === 'video_generation_blocked' || eventName === 'video_generation_started') {
    if (!state.firstSuccessAt && operationId && !state.seenOperationIds.includes(operationId)) {
      appendUnique(state.seenOperationIds, operationId)
      state.attemptsBeforeFirstSuccess += 1
      saveState()
    }
    return true
  }

  if (
    eventName !== 'video_generation_succeeded' &&
    eventName !== 'video_generation_failed' &&
    eventName !== 'video_generation_cancelled'
  ) {
    return true
  }

  if (operationId && state.completedOperationIds.includes(operationId)) return false
  if (operationId) appendUnique(state.completedOperationIds, operationId)

  if (eventName === 'video_generation_failed' && !state.firstSuccessAt) {
    state.failuresBeforeFirstSuccess += 1
  }

  if (eventName === 'video_generation_succeeded') {
    const previousSuccessCount = state.successfulGenerationCount
    state.successfulGenerationCount += 1

    if (previousSuccessCount === 0) {
      const now = new Date()
      const elapsedMs = Math.max(0, now.getTime() - Date.parse(state.firstObservedAt))
      enqueue('activation_completed', {
        ...(operationId ? { operation_id: operationId } : {}),
        trigger: typeof data.trigger === 'string' ? data.trigger : 'manual',
        elapsed_since_first_seen_ms: Math.floor(elapsedMs),
        active_before_success_ms: state.activeMsBeforeFirstSuccess,
        attempts_before_success: state.attemptsBeforeFirstSuccess,
        failed_attempts_before_success: state.failuresBeforeFirstSuccess,
        time_to_value_bucket: getTimeToValueBucket(state.activeMsBeforeFirstSuccess),
      })
      state.firstSuccessAt = now.toISOString()
    } else if (previousSuccessCount === 1) {
      enqueue('repeat_generation_completed', {
        ...(operationId ? { operation_id: operationId } : {}),
        trigger: typeof data.trigger === 'string' ? data.trigger : 'manual',
      })
    }
  }

  saveState()
  return true
}

export async function trackAnalyticsEvent(params: AnalyticsTrackParams): Promise<void> {
  await ensureInitialized()
  if (!params || !isAnalyticsEventName(params.event)) return

  const cleanData = sanitizeAnalyticsData(params.event, params.data)
  if (!processGenerationMilestones(params.event, cleanData)) return
  markActivityFromEvent(params.event)
  enqueue(params.event, cleanData)
}

function markFirstSeenDelivered(entries: QueuedEvent[]) {
  if (!state || state.firstSeenDelivered) return
  if (entries.some(({ eventName }) => eventName === 'installation_first_seen')) {
    state.firstSeenDelivered = true
    saveState()
  }
}

async function sendBatch(entries: QueuedEvent[], timeoutMs: number): Promise<void> {
  const website = getWebsiteId()
  if (!website || entries.length === 0) return

  try {
    const response = await axios.post(
      STAT_API_URL,
      entries.map(({ request }) => request),
      {
        headers: {
          accept: '*/*',
          'content-type': 'application/json',
          'user-agent': `ShortVideoFactory/${getPackageVersion()} (${process.platform}; ${process.arch})`,
          ...(cacheToken ? { 'x-umami-cache': cacheToken } : {}),
        },
        timeout: timeoutMs,
      },
    )

    if (typeof response.data?.cache === 'string') cacheToken = response.data.cache
    const errors = Number(response.data?.errors) || 0
    if (errors === 0) {
      markFirstSeenDelivered(entries)
      return
    }

    const failedIndices = new Set<number>()
    if (Array.isArray(response.data?.details)) {
      for (const detail of response.data.details) {
        if (Number.isInteger(detail?.index)) failedIndices.add(detail.index)
      }
    }

    if (failedIndices.size === 0) {
      logDevWarning(
        'batch response reported errors without item indexes; not retrying to avoid duplicates',
      )
      return
    }

    const failedEntries = entries.filter((_entry, index) => failedIndices.has(index))
    const successfulEntries = entries.filter((_entry, index) => !failedIndices.has(index))
    markFirstSeenDelivered(successfulEntries)
    retryEntries(failedEntries)
  } catch (error) {
    const status = axios.isAxiosError(error) ? error.response?.status : undefined
    if (status === undefined || status === 408 || status === 429 || status >= 500) {
      logDevWarning('batch request failed', status ?? 'network')
      retryEntries(entries)
    } else {
      logDevWarning('batch request rejected', status)
    }
  }
}

function retryEntries(entries: QueuedEvent[]) {
  const retryable = entries
    .filter((entry) => entry.retries < MAX_RETRIES)
    .map((entry) => ({ ...entry, retries: entry.retries + 1 }))
  for (const entry of retryable) {
    if (!makeQueueRoom(entry.eventName)) continue
    pending.push(entry)
  }
  if (retryable.length)
    scheduleFlush(1000 * 2 ** Math.min(...retryable.map(({ retries }) => retries)))
}

export function getPendingAnalyticsCount(): number {
  return pending.length
}

export async function flushAnalytics(timeoutMs = 5000): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (flushPromise) return flushPromise

  flushPromise = (async () => {
    const entries = pending.splice(0, MAX_BATCH_SIZE)
    await sendBatch(entries, timeoutMs)
    if (pending.length) scheduleFlush(0)
  })()

  try {
    await flushPromise
  } finally {
    flushPromise = null
  }
}
