import type {
  AnalyticsContextParams,
  AnalyticsEventName,
  AnalyticsScalar,
  AnalyticsTrackParams,
} from '~/electron/analytics-types'

const ACTIVE_INPUT_WINDOW_MS = 5 * 60_000
const ACTIVITY_CHECK_INTERVAL_MS = 60_000

let activityTrackingStarted = false
let lastInputAt = 0
let lastPulseAt = 0
let lastActivityRequestAt = 0
let pendingActivityMs = 0
let activityTimer: number | undefined
const activeOperations = new Set<string>()

export function createAnalyticsOperationId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const value = Math.floor(Math.random() * 16)
    return (char === 'x' ? value : (value & 0x3) | 0x8).toString(16)
  })
}

export function trackAnalytics(
  event: AnalyticsEventName,
  data?: Record<string, AnalyticsScalar>,
): void {
  const params: AnalyticsTrackParams = { event, ...(data ? { data } : {}) }

  if (event === 'video_generation_started' && typeof data?.operation_id === 'string') {
    activeOperations.add(data.operation_id)
    lastPulseAt = Date.now()
  }
  if (
    (event === 'video_generation_succeeded' ||
      event === 'video_generation_failed' ||
      event === 'video_generation_cancelled') &&
    typeof data?.operation_id === 'string'
  ) {
    activeOperations.delete(data.operation_id)
  }

  const request = window.electron?.analyticsTrack?.(params)
  if (request) void request.catch(() => {})
}

export function setAnalyticsContext(context: AnalyticsContextParams): void {
  const request = window.electron?.analyticsSetContext?.(context)
  if (request) void request.catch(() => {})
}

function isActive(now: number): boolean {
  if (activeOperations.size > 0) return true
  return (
    document.visibilityState === 'visible' &&
    document.hasFocus() &&
    now - lastInputAt <= ACTIVE_INPUT_WINDOW_MS
  )
}

function reportActivity(now = Date.now()) {
  if (!isActive(now)) {
    lastPulseAt = now
    pendingActivityMs = 0
    return
  }

  if (lastPulseAt !== 0) {
    pendingActivityMs += Math.max(0, Math.min(ACTIVITY_CHECK_INTERVAL_MS, now - lastPulseAt))
  }
  lastPulseAt = now
  if (lastActivityRequestAt !== 0 && now - lastActivityRequestAt < ACTIVITY_CHECK_INTERVAL_MS) {
    return
  }
  const durationMs = Math.min(ACTIVITY_CHECK_INTERVAL_MS, pendingActivityMs)
  pendingActivityMs = Math.max(0, pendingActivityMs - durationMs)
  lastActivityRequestAt = now
  const request = window.electron?.analyticsMarkActive?.(durationMs)
  if (request) void request.catch(() => {})
}

function onUserInput() {
  lastInputAt = Date.now()
  reportActivity(lastInputAt)
}

export function initializeAnalyticsActivityTracking(): void {
  if (activityTrackingStarted) return
  activityTrackingStarted = true

  for (const eventName of ['pointerdown', 'keydown', 'wheel', 'touchstart']) {
    window.addEventListener(eventName, onUserInput, { passive: true })
  }
  window.addEventListener('focus', () => reportActivity())
  document.addEventListener('visibilitychange', () => reportActivity())
  activityTimer = window.setInterval(() => reportActivity(), ACTIVITY_CHECK_INTERVAL_MS)
}

export function getAnalyticsActivityTimerForTests(): number | undefined {
  return activityTimer
}
