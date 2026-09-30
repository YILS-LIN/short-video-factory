import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { aggregateEvents, run } from '../scripts/analytics/aggregate.mjs'

const installations = {
  first: '32d22a62-637c-4695-8d8c-867a99ab8001',
  second: '32d22a62-637c-4695-8d8c-867a99ab8002',
  inactive: '32d22a62-637c-4695-8d8c-867a99ab8003',
  observedOnly: '32d22a62-637c-4695-8d8c-867a99ab8004',
}

function event(installationId, name, localDateTime, data = {}, extra = {}) {
  return {
    installationId,
    name,
    timestamp: `${localDateTime}+08:00`,
    data,
    ...extra,
  }
}

const rows = [
  event(installations.first, 'installation_first_seen', '2026-01-01T08:00:00'),
  event(installations.first, 'app_active', '2026-01-01T08:01:00'),
  event(installations.first, 'video_generation_started', '2026-01-01T08:02:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8005',
  }),
  event(installations.first, 'video_generation_failed', '2026-01-01T08:04:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8005',
  }),
  event(installations.first, 'video_generation_started', '2026-01-01T08:04:30', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8001',
  }),
  event(installations.first, 'activation_completed', '2026-01-01T08:05:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8001',
    attempts_before_success: 2,
    failed_attempts_before_success: 1,
    active_before_success_ms: 180_000,
    elapsed_since_first_seen_ms: 300_000,
  }),
  event(installations.first, 'video_generation_started', '2026-01-02T07:59:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8002',
  }),
  event(installations.first, 'video_generation_succeeded', '2026-01-01T08:05:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8001',
    trigger: 'manual',
    duration_ms: 30_000,
    llm_call_count: 1,
    llm_usage_complete: true,
    input_tokens: 1_000,
    output_tokens: 250,
    tts_characters: 42,
  }),
  event(installations.first, 'video_generation_succeeded', '2026-01-02T08:00:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8002',
    trigger: 'manual',
  }),
  event(installations.second, 'app_started', '2026-01-02T08:00:00'),
  event(installations.second, 'app_active', '2026-01-02T08:01:00'),
  event(installations.second, 'video_generation_started', '2026-01-02T08:09:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8003',
  }),
  event(installations.second, 'activation_completed', '2026-01-02T08:10:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8003',
    attempts_before_success: 1,
    failed_attempts_before_success: 0,
    active_before_success_ms: 60_000,
    elapsed_since_first_seen_ms: 600_000,
  }),
  event(installations.second, 'video_generation_succeeded', '2026-01-02T08:10:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8003',
    trigger: 'manual',
  }),
  event(installations.inactive, 'installation_first_seen', '2026-01-01T09:00:00'),
  event(installations.inactive, 'app_active', '2026-01-01T09:01:00'),
  event(
    installations.observedOnly,
    'installation_first_seen',
    '2026-01-01T10:00:00',
    {
      app_name: 'short-video-factory',
      product_name: '短视频工厂',
      package_name: 'short-video-factory',
      app_id: 'com.yils.short-video-factory',
      build_id: 'test-build',
      distribution_channel: 'self_build',
      platform: 'win32',
    },
    { title: '短视频工厂' },
  ),
  event(
    installations.observedOnly,
    'app_ready',
    '2026-01-01T10:01:00',
    {
      app_name: 'short-video-factory',
      product_name: '短视频工厂',
      package_name: 'short-video-factory',
      app_id: 'com.yils.short-video-factory',
      build_id: 'test-build',
      distribution_channel: 'self_build',
      platform: 'win32',
    },
    { title: ' =1+1' },
  ),
  event(installations.second, 'provider_test_finished', '2026-01-02T08:20:00', {
    operation_id: '42d22a62-637c-4695-8d8c-867a99ab8004',
    llm_call_count: 1,
    llm_usage_complete: true,
    input_tokens: 10_000,
    output_tokens: 5_000,
  }),
]

test('aggregates mature activation, repeated generation, and first-observed installations', () => {
  const { summary, dailyRows, retentionRows, brandsRows } = aggregateEvents(rows, {
    asOfDate: '2026-01-20',
  })

  assert.equal(summary.installationsObserved, 4)
  assert.equal(dailyRows.find(({ date }) => date === '2026-01-01').firstObservedInstallations, 3)
  assert.deepEqual(summary.activation24h, {
    eligibleInstallations: 4,
    activatedInstallations: 2,
    rate: 2 / 4,
  })
  assert.deepEqual(summary.firstGenerationAttempt, {
    eligibleInstallations: 2,
    successfulInstallations: 1,
    rate: 1 / 2,
  })
  assert.equal(summary.firstSuccess.afterFailureInstallations, 1)
  assert.equal(summary.firstSuccess.activeTimeToValueMs.p50, 60_000)
  assert.equal(summary.firstSuccess.elapsedTimeToValueMs.p90, 600_000)
  assert.equal(summary.repeatGeneration7d.manualRepeatInstallations, 1)
  assert.equal(summary.repeatGeneration7d.manualCrossDayInstallations, 1)
  assert.equal(summary.resourceUsage.inputTokens, 11_000)
  assert.equal(summary.resourceUsage.inputTokensPerSuccessfulVideo, 1_000 / 3)
  assert.equal(summary.resourceUsage.videoGeneration.inputTokens, 1_000)
  assert.equal(retentionRows.find(({ cohortDate }) => cohortDate === '2026-01-01').d1Eligible, 2)
  assert.equal(brandsRows.length, 1)
})

test('rejects invalid calendar dates and report dates before the data', () => {
  assert.throws(() => aggregateEvents(rows, { asOfDate: '2026-02-31' }), /YYYY-MM-DD/)
  assert.throws(() => aggregateEvents(rows, { asOfDate: '2026-01-01' }), /cannot be earlier/)
})

test('does not treat a partially observed latest event day as a complete retention day', () => {
  const { summary, retentionRows } = aggregateEvents(rows)
  assert.equal(summary.dataThroughDate, '2026-01-02')
  assert.equal(summary.retentionMatureThroughDate, '2026-01-01')
  assert.equal(retentionRows.find(({ cohortDate }) => cohortDate === '2026-01-01').d1Eligible, 0)
})

test('writes reports without exposing installation or operation IDs', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'svf-analytics-test-'))
  const inputPath = path.join(directory, 'events.ndjson')
  const outputPath = path.join(directory, 'reports')
  fs.writeFileSync(inputPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}\n`)

  try {
    await run(inputPath, outputPath, { asOfDate: '2026-01-20' })
    const reportFiles = fs.readdirSync(outputPath)
    assert.deepEqual(reportFiles.sort(), [
      'brands.csv',
      'daily.csv',
      'retention.csv',
      'stages.csv',
      'summary.json',
    ])
    const reports = reportFiles
      .map((fileName) => fs.readFileSync(path.join(outputPath, fileName), 'utf8'))
      .join('\n')
    assert.doesNotMatch(reports, new RegExp(installations.first))
    assert.doesNotMatch(reports, /42d22a62-637c-4695-8d8c-867a99ab8001/)
    assert.match(fs.readFileSync(path.join(outputPath, 'brands.csv'), 'utf8'), /' =1\+1,/)
  } finally {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})
