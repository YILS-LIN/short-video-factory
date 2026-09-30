import { randomUUID } from 'node:crypto'

export interface AnalyticsState {
  schemaVersion: 1
  installationId: string
  firstObservedAt: string
  firstObservedVersion: string
  firstSeenDelivered: boolean
  lastReportedActiveDate?: string
  successfulGenerationCount: number
  firstSuccessAt?: string
  activeMsBeforeFirstSuccess: number
  attemptsBeforeFirstSuccess: number
  failuresBeforeFirstSuccess: number
  seenOperationIds: string[]
  completedOperationIds: string[]
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function createAnalyticsState(version: string, now = new Date()): AnalyticsState {
  return {
    schemaVersion: 1,
    installationId: randomUUID(),
    firstObservedAt: now.toISOString(),
    firstObservedVersion: version.slice(0, 40),
    firstSeenDelivered: false,
    successfulGenerationCount: 0,
    activeMsBeforeFirstSuccess: 0,
    attemptsBeforeFirstSuccess: 0,
    failuresBeforeFirstSuccess: 0,
    seenOperationIds: [],
    completedOperationIds: [],
  }
}

export function parseAnalyticsState(value: unknown): AnalyticsState | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<AnalyticsState>
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.installationId !== 'string' ||
    !UUID_PATTERN.test(candidate.installationId) ||
    typeof candidate.firstObservedAt !== 'string' ||
    !Number.isFinite(Date.parse(candidate.firstObservedAt)) ||
    typeof candidate.firstObservedVersion !== 'string' ||
    typeof candidate.firstSeenDelivered !== 'boolean' ||
    !Number.isSafeInteger(candidate.successfulGenerationCount) ||
    (candidate.successfulGenerationCount ?? -1) < 0 ||
    !Number.isSafeInteger(candidate.activeMsBeforeFirstSuccess) ||
    (candidate.activeMsBeforeFirstSuccess ?? -1) < 0 ||
    !Number.isSafeInteger(candidate.attemptsBeforeFirstSuccess) ||
    (candidate.attemptsBeforeFirstSuccess ?? -1) < 0 ||
    !Number.isSafeInteger(candidate.failuresBeforeFirstSuccess) ||
    (candidate.failuresBeforeFirstSuccess ?? -1) < 0 ||
    !Array.isArray(candidate.seenOperationIds) ||
    !candidate.seenOperationIds.every((id) => typeof id === 'string' && UUID_PATTERN.test(id)) ||
    !Array.isArray(candidate.completedOperationIds) ||
    !candidate.completedOperationIds.every((id) => typeof id === 'string' && UUID_PATTERN.test(id))
  ) {
    return null
  }

  if (
    candidate.firstSuccessAt !== undefined &&
    (typeof candidate.firstSuccessAt !== 'string' ||
      !Number.isFinite(Date.parse(candidate.firstSuccessAt)))
  ) {
    return null
  }
  if (
    candidate.lastReportedActiveDate !== undefined &&
    (typeof candidate.lastReportedActiveDate !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(candidate.lastReportedActiveDate))
  ) {
    return null
  }

  return {
    schemaVersion: 1,
    installationId: candidate.installationId,
    firstObservedAt: candidate.firstObservedAt,
    firstObservedVersion: candidate.firstObservedVersion.slice(0, 40),
    firstSeenDelivered: candidate.firstSeenDelivered,
    ...(candidate.lastReportedActiveDate
      ? { lastReportedActiveDate: candidate.lastReportedActiveDate }
      : {}),
    successfulGenerationCount: candidate.successfulGenerationCount!,
    ...(candidate.firstSuccessAt ? { firstSuccessAt: candidate.firstSuccessAt } : {}),
    activeMsBeforeFirstSuccess: candidate.activeMsBeforeFirstSuccess!,
    attemptsBeforeFirstSuccess: candidate.attemptsBeforeFirstSuccess!,
    failuresBeforeFirstSuccess: candidate.failuresBeforeFirstSuccess!,
    seenOperationIds: candidate.seenOperationIds.slice(-200),
    completedOperationIds: candidate.completedOperationIds.slice(-200),
  }
}

export function getAnalyticsDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now)
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}
