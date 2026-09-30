#!/usr/bin/env node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { pathToFileURL } from 'node:url'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TIME_ZONE = 'Asia/Shanghai'
const DAY_MS = 24 * 60 * 60 * 1000

function dateInReportTimezone(timestamp) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date(timestamp))
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]))
  return `${values.year}-${values.month}-${values.day}`
}

function getTimestamp(row) {
  const value = row.timestamp ?? row.created_at ?? row.createdAt
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 100_000_000_000 ? value * 1000 : value
  }
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (Number.isFinite(numeric) && value.trim()) {
      return numeric < 100_000_000_000 ? numeric * 1000 : numeric
    }
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function parseData(value) {
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value)
    } catch {
      return {}
    }
  }
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {}
}

function normalizeRow(row, lineNumber) {
  if (!row || typeof row !== 'object') return null
  const installationId = row.installationId ?? row.distinct_id
  const eventName = row.name ?? row.event_name ?? row.eventName
  const timestamp = getTimestamp(row)
  if (
    typeof installationId !== 'string' ||
    !UUID_PATTERN.test(installationId) ||
    typeof eventName !== 'string' ||
    !Number.isFinite(timestamp)
  ) {
    return null
  }

  return {
    installationId,
    eventName,
    timestamp,
    date: dateInReportTimezone(timestamp),
    data: parseData(row.data ?? row.event_data ?? row.eventData),
    title: typeof row.title === 'string' ? row.title.slice(0, 120) : '',
    lineNumber,
  }
}

function getInstall(installs, id) {
  let install = installs.get(id)
  if (!install) {
    install = {
      activityDays: new Set(),
      generations: [],
      generationAttempts: new Map(),
      generationOutcomes: new Map(),
      firstObservedAt: null,
      firstActivityAt: null,
      firstSuccessAt: null,
      activationData: null,
    }
    installs.set(id, install)
  }
  return install
}

function isActivityEvent(name) {
  return !['installation_first_seen', 'app_started', 'app_ready'].includes(name)
}

function getBrandKey(row) {
  if (['installation_first_seen', 'app_started'].includes(row.eventName)) return ''
  const data = row.data
  const values = [
    row.title || data.ui_app_title || '',
    data.app_name || '',
    data.product_name || '',
    data.package_name || '',
    data.app_id || '',
    data.app_version || '',
    data.first_observed_version || '',
    data.build_id || '',
    data.distribution_channel || '',
    data.platform || '',
  ]
  if (!values[0] || (!values[1] && !values[2]) || (!values[3] && !values[4])) return ''
  return JSON.stringify(values)
}

function getBrandingStatus({ title, appName, productName, packageName, appId, buildId }) {
  const expectedTitles = new Set(['AI Short Video Factory', 'AI Short Video Factory - 短视频工厂'])
  const expectedAppNames = new Set(['短视频工厂', 'short-video-factory'])
  if (!title || !appId || !packageName || !buildId || buildId === 'unknown') return 'unknown_build'
  if (
    !expectedTitles.has(title) ||
    !expectedAppNames.has(appName) ||
    productName !== '短视频工厂' ||
    packageName !== 'short-video-factory' ||
    appId !== 'com.yils.short-video-factory'
  ) {
    return 'branding_differs'
  }
  return 'matches_known_branding'
}

function getWeekStart(date) {
  const dateValue = new Date(`${date}T00:00:00Z`)
  const day = (dateValue.getUTCDay() + 6) % 7
  dateValue.setUTCDate(dateValue.getUTCDate() - day)
  return dateValue.toISOString().slice(0, 10)
}

function longestConsecutiveWeeks(dates) {
  const weeks = [...new Set(dates.map(getWeekStart))].sort()
  let longest = 0
  let current = 0
  let previous = null
  for (const week of weeks) {
    const weekValue = Date.parse(`${week}T00:00:00Z`)
    if (previous !== null && weekValue - previous === 7 * DAY_MS) current += 1
    else current = 1
    previous = weekValue
    longest = Math.max(longest, current)
  }
  return longest
}

function percentile(values, percentileValue) {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.max(0, Math.ceil(percentileValue * sorted.length) - 1)]
}

function daysBetween(startDate, endDate) {
  return Math.round(
    (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS,
  )
}

function addDailyDate(daily, date) {
  if (!daily.has(date)) {
    daily.set(date, {
      activeInstallIds: new Set(),
      productionInstallIds: new Set(),
      firstSeenInstallIds: new Set(),
      successfulVideos: 0,
      failedVideos: 0,
      cancelledVideos: 0,
      blockedAttempts: 0,
    })
  }
  return daily.get(date)
}

export function aggregateEvents(inputRows, options = {}) {
  const installs = new Map()
  const daily = new Map()
  const brands = new Map()
  const seenTerminals = new Set()
  const seenBlocked = new Set()
  const resourceRows = new Map()
  const resourceTotals = {
    inputTokens: 0,
    outputTokens: 0,
    tokenEvents: 0,
    completeTokenEvents: 0,
    ttsCharacters: 0,
    videoGenerationInputTokens: 0,
    videoGenerationOutputTokens: 0,
    videoGenerationTokenEvents: 0,
    videoGenerationCompleteTokenEvents: 0,
    videoGenerationTtsCharacters: 0,
    successfulVideoDurationMs: 0,
    successfulVideoCount: 0,
    phaseDurationsMs: { text: 0, tts: 0, media: 0, export: 0 },
    phaseDurationCounts: { text: 0, tts: 0, media: 0, export: 0 },
    failedStages: {},
    enteredStages: {},
    batchSuccessfulVideos: 0,
    manualSuccessfulVideos: 0,
  }
  let minDate = null
  let maxDate = null
  let maxTimestamp = null
  const normalizedRows = inputRows
    .map((row, index) => normalizeRow(row, index + 1))
    .filter(Boolean)
    .sort((left, right) => left.timestamp - right.timestamp || left.lineNumber - right.lineNumber)
  const validRows = normalizedRows.length

  for (const row of normalizedRows) {
    minDate = minDate === null || row.date < minDate ? row.date : minDate
    maxDate = maxDate === null || row.date > maxDate ? row.date : maxDate
    maxTimestamp = maxTimestamp === null ? row.timestamp : Math.max(maxTimestamp, row.timestamp)

    const install = getInstall(installs, row.installationId)
    if (install.firstObservedAt === null || row.timestamp < install.firstObservedAt) {
      install.firstObservedAt = row.timestamp
    }
    if (
      row.eventName === 'video_generation_started' &&
      typeof row.data.operation_id === 'string' &&
      UUID_PATTERN.test(row.data.operation_id)
    ) {
      if (!install.generationAttempts.has(row.data.operation_id)) {
        install.generationAttempts.set(row.data.operation_id, {
          timestamp: row.timestamp,
          date: row.date,
        })
      }
    }
    if (isActivityEvent(row.eventName)) {
      install.activityDays.add(row.date)
      if (install.firstActivityAt === null || row.timestamp < install.firstActivityAt) {
        install.firstActivityAt = row.timestamp
      }
      addDailyDate(daily, row.date).activeInstallIds.add(row.installationId)
    }

    const brandKey = getBrandKey(row)
    if (brandKey) {
      if (!brands.has(brandKey)) brands.set(brandKey, new Set())
      brands.get(brandKey).add(row.installationId)
    }

    if (row.eventName === 'activation_completed' && install.activationData === null) {
      install.activationData = row.data
    }

    if (row.eventName === 'video_generation_blocked') {
      const blockedId =
        typeof row.data.operation_id === 'string' ? row.data.operation_id : `line-${row.lineNumber}`
      const blockedKey = `${row.installationId}:${blockedId}`
      if (!seenBlocked.has(blockedKey)) {
        seenBlocked.add(blockedKey)
        addDailyDate(daily, row.date).blockedAttempts += 1
      }
    }

    const hasResources = [
      'video_generation_succeeded',
      'video_generation_failed',
      'video_generation_cancelled',
      'text_generation_finished',
      'provider_test_finished',
      'tts_preview_finished',
      'tts_generation_finished',
    ].includes(row.eventName)
    if (hasResources) {
      const resourceId =
        typeof row.data.operation_id === 'string' && UUID_PATTERN.test(row.data.operation_id)
          ? row.data.operation_id
          : `line-${row.lineNumber}`
      resourceRows.set(`${row.installationId}:${resourceId}`, row)
    }

    const terminal = [
      'video_generation_succeeded',
      'video_generation_failed',
      'video_generation_cancelled',
    ].includes(row.eventName)
    if (!terminal) continue

    const operationId =
      typeof row.data.operation_id === 'string' && UUID_PATTERN.test(row.data.operation_id)
        ? row.data.operation_id
        : `line-${row.lineNumber}`
    const operationKey = `${row.installationId}:${operationId}`
    if (seenTerminals.has(operationKey)) continue
    seenTerminals.add(operationKey)
    if (typeof row.data.operation_id === 'string' && UUID_PATTERN.test(row.data.operation_id)) {
      install.generationOutcomes.set(row.data.operation_id, row.eventName)
    }

    if (row.eventName === 'video_generation_succeeded') {
      install.generations.push({ timestamp: row.timestamp, date: row.date, data: row.data })
      if (install.firstSuccessAt === null || row.timestamp < install.firstSuccessAt) {
        install.firstSuccessAt = row.timestamp
      }
      const day = addDailyDate(daily, row.date)
      day.successfulVideos += 1
      day.productionInstallIds.add(row.installationId)
      resourceTotals.successfulVideoCount += 1
      resourceTotals.successfulVideoDurationMs += Number(row.data.duration_ms) || 0
      if (row.data.trigger === 'batch') resourceTotals.batchSuccessfulVideos += 1
      else resourceTotals.manualSuccessfulVideos += 1
    } else if (row.eventName === 'video_generation_failed') {
      addDailyDate(daily, row.date).failedVideos += 1
      if (typeof row.data.failed_stage === 'string') {
        resourceTotals.failedStages[row.data.failed_stage] =
          (resourceTotals.failedStages[row.data.failed_stage] ?? 0) + 1
      }
    } else {
      addDailyDate(daily, row.date).cancelledVideos += 1
    }

    for (const stage of ['text', 'tts', 'media', 'export']) {
      if (row.data[`${stage}_entered`] === true) {
        resourceTotals.enteredStages[stage] = (resourceTotals.enteredStages[stage] ?? 0) + 1
      }
      const duration = Number(row.data[`${stage}_duration_ms`])
      if (Number.isFinite(duration) && duration >= 0) {
        resourceTotals.phaseDurationsMs[stage] += duration
        resourceTotals.phaseDurationCounts[stage] += 1
      }
    }
  }

  if (validRows === 0 || minDate === null || maxDate === null || maxTimestamp === null) {
    throw new Error('No valid UUID-identified Umami event rows were found.')
  }

  const asOfDate = options.asOfDate ?? maxDate
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate) ||
    Number.isNaN(Date.parse(`${asOfDate}T00:00:00Z`)) ||
    new Date(`${asOfDate}T00:00:00Z`).toISOString().slice(0, 10) !== asOfDate
  ) {
    throw new Error('The report as-of date must use YYYY-MM-DD format.')
  }
  if (asOfDate < maxDate)
    throw new Error('The report as-of date cannot be earlier than an input event.')
  const retentionMatureThroughDate = options.asOfDate ? asOfDate : addDays(maxDate, -1)
  const reportEndTimestamp = options.asOfDate
    ? Date.parse(`${asOfDate}T23:59:59.999+08:00`)
    : maxTimestamp

  const dateSet = new Set(daily.keys())
  const dateCursor = new Date(`${minDate}T00:00:00Z`)
  const dateEnd = new Date(`${asOfDate}T00:00:00Z`)
  while (dateCursor <= dateEnd) {
    const date = dateCursor.toISOString().slice(0, 10)
    dateSet.add(date)
    addDailyDate(daily, date)
    dateCursor.setUTCDate(dateCursor.getUTCDate() + 1)
  }
  const dates = [...dateSet].sort()

  for (const [id, install] of installs) {
    if (install.firstObservedAt !== null) {
      const firstDate = dateInReportTimezone(install.firstObservedAt)
      addDailyDate(daily, firstDate).firstSeenInstallIds.add(id)
    }
  }

  const dailyRows = dates.map((date, index) => {
    const record = daily.get(date)
    const weekWindow = new Set(dates.slice(Math.max(0, index - 6), index + 1))
    const monthWindow = new Set(dates.slice(Math.max(0, index - 29), index + 1))
    const countActive = (window) => {
      const unique = new Set()
      for (const windowDate of window) {
        for (const id of daily.get(windowDate).activeInstallIds) unique.add(id)
      }
      return unique.size
    }
    return {
      date,
      firstObservedInstallations: record.firstSeenInstallIds.size,
      dau: record.activeInstallIds.size,
      wau: countActive(weekWindow),
      mau: countActive(monthWindow),
      productionInstallations: record.productionInstallIds.size,
      successfulVideos: record.successfulVideos,
      failedVideos: record.failedVideos,
      cancelledVideos: record.cancelledVideos,
      blockedAttempts: record.blockedAttempts,
    }
  })

  const cohorts = new Map()
  for (const [id, install] of installs) {
    if (install.firstActivityAt === null) continue
    const date = dateInReportTimezone(install.firstActivityAt)
    if (!cohorts.has(date)) cohorts.set(date, new Set())
    cohorts.get(date).add(id)
    addDailyDate(daily, date).firstSeenInstallIds.add(id)
  }

  const retentionRows = [...cohorts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, ids]) => {
      const row = { cohortDate: date, cohortInstallations: ids.size }
      for (const day of [1, 7, 30]) {
        const eligibleIds = [...ids].filter(
          (id) => daysBetween(date, retentionMatureThroughDate) >= day,
        )
        const returned = eligibleIds.filter((id) => {
          const returnDate = new Date(`${date}T00:00:00Z`)
          returnDate.setUTCDate(returnDate.getUTCDate() + day)
          return installs.get(id).activityDays.has(returnDate.toISOString().slice(0, 10))
        })
        row[`d${day}Eligible`] = eligibleIds.length
        row[`d${day}Returned`] = returned.length
        row[`d${day}Rate`] = eligibleIds.length ? returned.length / eligibleIds.length : null
      }
      return row
    })

  const stageRows = ['text', 'tts', 'media', 'export'].map((stage) => {
    const entered = resourceTotals.enteredStages[stage] ?? 0
    const failed = resourceTotals.failedStages[stage] ?? 0
    return { stage, entered, failed, failureRate: entered ? failed / entered : null }
  })

  let activation24hEligible = 0
  let activation24h = 0
  let activation7dEligible = 0
  let activation7d = 0
  let repeat7dEligible = 0
  let repeat7d = 0
  let crossDayRepeat7d = 0
  let manualRepeat7d = 0
  let manualCrossDayRepeat7d = 0
  let threeVideos7d = 0
  let fourWeekEligible = 0
  let fourWeekActive = 0
  let fourWeekProduction = 0
  let silentReturnInstallations = 0
  let firstAttemptSuccessInstallations = 0
  let firstAttemptEligibleInstallations = 0
  let firstSuccessAfterFailureInstallations = 0
  let firstSuccessAfterFailureEligibleInstallations = 0
  const activeTimeToValueMs = []
  const elapsedTimeToValueMs = []
  const videoCounts = []
  for (const install of installs.values()) {
    const firstAttempt = [...install.generationAttempts.entries()].sort(
      ([, left], [, right]) => left.timestamp - right.timestamp,
    )[0]
    if (!firstAttempt) continue
    const [operationId] = firstAttempt
    const outcome = install.generationOutcomes.get(operationId)
    if (outcome === 'video_generation_succeeded' || outcome === 'video_generation_failed') {
      firstAttemptEligibleInstallations += 1
      if (outcome === 'video_generation_succeeded') firstAttemptSuccessInstallations += 1
    }
  }

  const brandsRows = [...brands.entries()].map(([serialized, ids]) => {
    const [
      title,
      appName,
      productName,
      packageName,
      appId,
      appVersion,
      firstObservedVersion,
      buildId,
      channel,
      platform,
    ] = JSON.parse(serialized)
    return {
      title,
      appName,
      productName,
      packageName,
      appId,
      appVersion,
      firstObservedVersion,
      buildId,
      channel,
      platform,
      brandingStatus: getBrandingStatus({
        title,
        appName,
        productName,
        packageName,
        appId,
        buildId,
      }),
      installations: ids.size,
    }
  })

  for (const install of installs.values()) {
    const activityDays = [...install.activityDays].sort()
    const successes = install.generations.sort((left, right) => left.timestamp - right.timestamp)
    videoCounts.push(successes.length)

    if (install.firstObservedAt !== null) {
      const elapsed =
        install.firstSuccessAt === null ? null : install.firstSuccessAt - install.firstObservedAt
      if (reportEndTimestamp - install.firstObservedAt >= DAY_MS) {
        activation24hEligible += 1
        if (elapsed !== null && elapsed >= 0 && elapsed <= DAY_MS) activation24h += 1
      }
      if (reportEndTimestamp - install.firstObservedAt >= 7 * DAY_MS) {
        activation7dEligible += 1
        if (elapsed !== null && elapsed >= 0 && elapsed <= 7 * DAY_MS) activation7d += 1
      }
    }

    if (install.activationData) {
      const activation = install.activationData
      if (Number.isSafeInteger(activation.failed_attempts_before_success)) {
        firstSuccessAfterFailureEligibleInstallations += 1
        if (activation.failed_attempts_before_success > 0)
          firstSuccessAfterFailureInstallations += 1
      }
      if (
        Number.isSafeInteger(activation.active_before_success_ms) &&
        activation.active_before_success_ms >= 0
      ) {
        activeTimeToValueMs.push(activation.active_before_success_ms)
      }
      if (
        Number.isSafeInteger(activation.elapsed_since_first_seen_ms) &&
        activation.elapsed_since_first_seen_ms >= 0
      ) {
        elapsedTimeToValueMs.push(activation.elapsed_since_first_seen_ms)
      }
    }

    if (successes.length && reportEndTimestamp - successes[0].timestamp >= 7 * DAY_MS) {
      repeat7dEligible += 1
      const repeatWindow = successes.filter(
        ({ timestamp }) =>
          timestamp >= successes[0].timestamp && timestamp < successes[0].timestamp + 7 * DAY_MS,
      )
      if (repeatWindow.length >= 2) repeat7d += 1
      if (new Set(repeatWindow.map(({ date }) => date)).size >= 2) crossDayRepeat7d += 1
      const manualRepeats = repeatWindow.filter(
        ({ timestamp, data }, index) =>
          index > 0 && data.trigger !== 'batch' && timestamp > successes[0].timestamp,
      )
      if (manualRepeats.length) manualRepeat7d += 1
      if (manualRepeats.some(({ date }) => date !== successes[0].date)) manualCrossDayRepeat7d += 1
      if (repeatWindow.length >= 3) threeVideos7d += 1
    }

    const activeWeeks = longestConsecutiveWeeks(activityDays)
    if (activityDays.length && asOfDate >= addDays(getWeekStart(activityDays[0]), 21)) {
      fourWeekEligible += 1
      if (activeWeeks >= 4) fourWeekActive += 1
      const productionWeeks = longestConsecutiveWeeks(successes.map(({ date }) => date))
      if (productionWeeks >= 4) fourWeekProduction += 1
    }

    if (
      activityDays.some(
        (date, index) => index > 0 && daysBetween(activityDays[index - 1], date) >= 15,
      )
    ) {
      silentReturnInstallations += 1
    }
  }

  for (const row of resourceRows.values()) {
    const data = row.data
    const isVideoGenerationEvent = row.eventName.startsWith('video_generation_')
    const hasLlmCall = Number.isSafeInteger(data.llm_call_count) && data.llm_call_count > 0
    if (hasLlmCall) {
      resourceTotals.tokenEvents += data.llm_call_count
      if (data.llm_usage_complete === true)
        resourceTotals.completeTokenEvents += data.llm_call_count
      if (isVideoGenerationEvent) {
        resourceTotals.videoGenerationTokenEvents += data.llm_call_count
        if (data.llm_usage_complete === true) {
          resourceTotals.videoGenerationCompleteTokenEvents += data.llm_call_count
        }
      }
    }
    if (Number.isSafeInteger(data.input_tokens) && data.input_tokens >= 0) {
      resourceTotals.inputTokens += data.input_tokens
      if (isVideoGenerationEvent) resourceTotals.videoGenerationInputTokens += data.input_tokens
    }
    if (Number.isSafeInteger(data.output_tokens) && data.output_tokens >= 0) {
      resourceTotals.outputTokens += data.output_tokens
      if (isVideoGenerationEvent) resourceTotals.videoGenerationOutputTokens += data.output_tokens
    }
    if (Number.isSafeInteger(data.tts_characters) && data.tts_characters >= 0) {
      resourceTotals.ttsCharacters += data.tts_characters
      if (isVideoGenerationEvent) resourceTotals.videoGenerationTtsCharacters += data.tts_characters
    }
  }

  const videoInstallCounts = [...installs.values()]
    .filter((install) => install.generations.length > 0)
    .map((install) => install.generations.length)
  const activeInstallCount = [...installs.values()].filter(
    (install) => install.firstActivityAt !== null,
  ).length
  const totalSuccesses = resourceTotals.successfulVideoCount
  const firstSuccessInstallations = installCountWithActivationData(installs)
  const summary = {
    timezone: TIME_ZONE,
    validRows,
    installationsObserved: installs.size,
    range: { start: minDate, end: asOfDate },
    dataThroughDate: maxDate,
    reportAsOfDate: asOfDate,
    retentionMatureThroughDate,
    latestEventAt: new Date(maxTimestamp).toISOString(),
    totalSuccessfulVideos: totalSuccesses,
    batchSuccessfulVideos: resourceTotals.batchSuccessfulVideos,
    nonBatchSuccessfulVideos: resourceTotals.manualSuccessfulVideos,
    successfulVideosPerActiveInstallation: activeInstallCount
      ? totalSuccesses / activeInstallCount
      : 0,
    successfulVideosPerProducingInstallation: videoInstallCounts.length
      ? totalSuccesses / videoInstallCounts.length
      : 0,
    successfulVideosPerInstallationP50: percentile(videoCounts, 0.5),
    successfulVideosPerInstallationP90: percentile(videoCounts, 0.9),
    activation24h: {
      eligibleInstallations: activation24hEligible,
      activatedInstallations: activation24h,
      rate: activation24hEligible ? activation24h / activation24hEligible : null,
    },
    activation7d: {
      eligibleInstallations: activation7dEligible,
      activatedInstallations: activation7d,
      rate: activation7dEligible ? activation7d / activation7dEligible : null,
    },
    firstGenerationAttempt: {
      eligibleInstallations: firstAttemptEligibleInstallations,
      successfulInstallations: firstAttemptSuccessInstallations,
      rate: firstAttemptEligibleInstallations
        ? firstAttemptSuccessInstallations / firstAttemptEligibleInstallations
        : null,
    },
    firstSuccess: {
      installations: firstSuccessInstallations,
      afterFailureEligibleInstallations: firstSuccessAfterFailureEligibleInstallations,
      afterFailureInstallations: firstSuccessAfterFailureInstallations,
      afterFailureRate: firstSuccessAfterFailureEligibleInstallations
        ? firstSuccessAfterFailureInstallations / firstSuccessAfterFailureEligibleInstallations
        : null,
      activeTimeToValueMs: {
        installations: activeTimeToValueMs.length,
        p50: percentile(activeTimeToValueMs, 0.5),
        p90: percentile(activeTimeToValueMs, 0.9),
      },
      elapsedTimeToValueMs: {
        installations: elapsedTimeToValueMs.length,
        p50: percentile(elapsedTimeToValueMs, 0.5),
        p90: percentile(elapsedTimeToValueMs, 0.9),
      },
    },
    repeatGeneration7d: {
      eligibleInstallations: repeat7dEligible,
      repeatInstallations: repeat7d,
      rate: repeat7dEligible ? repeat7d / repeat7dEligible : null,
      crossDayInstallations: crossDayRepeat7d,
      manualRepeatInstallations: manualRepeat7d,
      manualRepeatRate: repeat7dEligible ? manualRepeat7d / repeat7dEligible : null,
      manualCrossDayInstallations: manualCrossDayRepeat7d,
      threeOrMoreVideosInstallations: threeVideos7d,
      threeOrMoreVideosRate: repeat7dEligible ? threeVideos7d / repeat7dEligible : null,
    },
    consecutiveWeeks: {
      eligibleInstallations: fourWeekEligible,
      activeFourWeeks: fourWeekActive,
      activeFourWeeksRate: fourWeekEligible ? fourWeekActive / fourWeekEligible : null,
      productionFourWeeks: fourWeekProduction,
      productionFourWeeksRate: fourWeekEligible ? fourWeekProduction / fourWeekEligible : null,
      observedSilentReturnInstallations: silentReturnInstallations,
    },
    resourceUsage: {
      inputTokens: resourceTotals.inputTokens,
      outputTokens: resourceTotals.outputTokens,
      tokenCallCoverage: resourceTotals.tokenEvents
        ? resourceTotals.completeTokenEvents / resourceTotals.tokenEvents
        : null,
      ttsCharacters: resourceTotals.ttsCharacters,
      inputTokensPerSuccessfulVideo: totalSuccesses
        ? resourceTotals.videoGenerationInputTokens / totalSuccesses
        : null,
      outputTokensPerSuccessfulVideo: totalSuccesses
        ? resourceTotals.videoGenerationOutputTokens / totalSuccesses
        : null,
      ttsCharactersPerSuccessfulVideo: totalSuccesses
        ? resourceTotals.videoGenerationTtsCharacters / totalSuccesses
        : null,
      videoGeneration: {
        inputTokens: resourceTotals.videoGenerationInputTokens,
        outputTokens: resourceTotals.videoGenerationOutputTokens,
        tokenCallCoverage: resourceTotals.videoGenerationTokenEvents
          ? resourceTotals.videoGenerationCompleteTokenEvents /
            resourceTotals.videoGenerationTokenEvents
          : null,
        ttsCharacters: resourceTotals.videoGenerationTtsCharacters,
      },
      averageSuccessfulVideoDurationMs: resourceTotals.successfulVideoCount
        ? resourceTotals.successfulVideoDurationMs / resourceTotals.successfulVideoCount
        : null,
      averagePhaseDurationMs: Object.fromEntries(
        Object.entries(resourceTotals.phaseDurationsMs).map(([stage, duration]) => [
          stage,
          resourceTotals.phaseDurationCounts[stage]
            ? duration / resourceTotals.phaseDurationCounts[stage]
            : null,
        ]),
      ),
      stageFailureCounts: resourceTotals.failedStages,
      stageEnteredCounts: resourceTotals.enteredStages,
    },
    brandingCombinations: brandsRows.length,
    stageRows,
  }

  return { summary, dailyRows, retentionRows, brandsRows, stageRows }
}

function installCountWithActivationData(installs) {
  let count = 0
  for (const install of installs.values()) {
    if (install.activationData) count += 1
  }
  return count
}

function addDays(date, count) {
  const value = new Date(`${date}T00:00:00Z`)
  value.setUTCDate(value.getUTCDate() + count)
  return value.toISOString().slice(0, 10)
}

function csvCell(value) {
  if (value === null || value === undefined) return ''
  let text = String(value)
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

function toCsv(rows, columns) {
  return [
    columns.join(','),
    ...rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')),
  ].join(os.EOL)
}

export async function readNdjson(inputPath) {
  const rows = []
  const stream = fs.createReadStream(inputPath, { encoding: 'utf8' })
  const lines = readline.createInterface({ input: stream, crlfDelay: Infinity })
  let lineNumber = 0
  for await (const line of lines) {
    lineNumber += 1
    if (!line.trim()) continue
    try {
      rows.push(JSON.parse(line))
    } catch {
      throw new Error(`Invalid JSON on input line ${lineNumber}.`)
    }
  }
  return rows
}

export async function run(inputPath, outputDirectory, options = {}) {
  const inputRows = await readNdjson(inputPath)
  const result = aggregateEvents(inputRows, options)
  fs.mkdirSync(outputDirectory, { recursive: true })
  fs.writeFileSync(
    path.join(outputDirectory, 'summary.json'),
    `${JSON.stringify(result.summary, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(outputDirectory, 'daily.csv'),
    `${toCsv(result.dailyRows, [
      'date',
      'firstObservedInstallations',
      'dau',
      'wau',
      'mau',
      'productionInstallations',
      'successfulVideos',
      'failedVideos',
      'cancelledVideos',
      'blockedAttempts',
    ])}\n`,
  )
  fs.writeFileSync(
    path.join(outputDirectory, 'retention.csv'),
    `${toCsv(result.retentionRows, [
      'cohortDate',
      'cohortInstallations',
      'd1Eligible',
      'd1Returned',
      'd1Rate',
      'd7Eligible',
      'd7Returned',
      'd7Rate',
      'd30Eligible',
      'd30Returned',
      'd30Rate',
    ])}\n`,
  )
  fs.writeFileSync(
    path.join(outputDirectory, 'brands.csv'),
    `${toCsv(result.brandsRows, [
      'title',
      'appName',
      'productName',
      'packageName',
      'appId',
      'appVersion',
      'firstObservedVersion',
      'buildId',
      'channel',
      'platform',
      'brandingStatus',
      'installations',
    ])}\n`,
  )
  fs.writeFileSync(
    path.join(outputDirectory, 'stages.csv'),
    `${toCsv(result.stageRows, ['stage', 'entered', 'failed', 'failureRate'])}\n`,
  )
  return result.summary
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const [, , inputPath, outputDirectory, ...extraArgs] = process.argv
  if (!inputPath || !outputDirectory) {
    console.error(
      'Usage: node scripts/analytics/aggregate.mjs <normalized-events.ndjson> <output-directory> [--as-of YYYY-MM-DD]',
    )
    process.exitCode = 2
  } else {
    let asOfDate
    if (extraArgs.length) {
      if (extraArgs.length !== 2 || extraArgs[0] !== '--as-of') {
        console.error('The only supported option is --as-of YYYY-MM-DD.')
        process.exitCode = 2
      } else {
        asOfDate = extraArgs[1]
      }
    }
    if (process.exitCode !== 2)
      run(inputPath, outputDirectory, { asOfDate })
        .then((summary) =>
          console.log(
            `Aggregated ${summary.validRows} events for ${summary.installationsObserved} installations.`,
          ),
        )
        .catch((error) => {
          console.error(error instanceof Error ? error.message : 'Analytics aggregation failed.')
          process.exitCode = 1
        })
  }
}
