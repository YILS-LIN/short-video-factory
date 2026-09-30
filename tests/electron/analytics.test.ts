import { describe, expect, it } from 'vitest'
import { isAnalyticsEventName, sanitizeAnalyticsData } from '../../electron/lib/analytics/schema'
import {
  createAnalyticsState,
  getAnalyticsDate,
  parseAnalyticsState,
} from '../../electron/lib/analytics/state'

describe('analytics event schema', () => {
  it('allows only known event names', () => {
    expect(isAnalyticsEventName('video_generation_succeeded')).toBe(true)
    expect(isAnalyticsEventName('raw-prompt')).toBe(false)
    expect(isAnalyticsEventName({})).toBe(false)
  })

  it('keeps approved event attributes and drops arbitrary or invalid values', () => {
    expect(
      sanitizeAnalyticsData('video_generation_failed', {
        operation_id: 'c2c5b9e6-32fb-4c2b-9495-9a0194630d5d',
        trigger: 'manual',
        failed_stage: 'tts',
        error_code: 'network_timeout',
        duration_ms: 1250,
        prompt: 'private user content',
        api_key: 'private secret',
        text_source: 'unrecognized-value',
        input_tokens: -1,
      }),
    ).toEqual({
      operation_id: 'c2c5b9e6-32fb-4c2b-9495-9a0194630d5d',
      trigger: 'manual',
      failed_stage: 'tts',
      error_code: 'network_timeout',
      duration_ms: 1250,
    })
  })

  it('does not accept attributes not defined for that event', () => {
    expect(
      sanitizeAnalyticsData('app_ready', {
        operation_id: 'c2c5b9e6-32fb-4c2b-9495-9a0194630d5d',
        duration_ms: 100,
      }),
    ).toEqual({})
  })
})

describe('analytics local identity state', () => {
  it('creates a random UUID identity and validates persisted state', () => {
    const now = new Date('2026-01-01T00:00:00.000Z')
    const first = createAnalyticsState('1.2.2', now)
    const second = createAnalyticsState('1.2.2', now)

    expect(first.installationId).not.toBe(second.installationId)
    expect(first.firstObservedAt).toBe(now.toISOString())
    expect(parseAnalyticsState(first)).toEqual(first)
    expect(parseAnalyticsState({ ...first, installationId: 'machine-name' })).toBeNull()
  })

  it('uses the documented Shanghai analytics day boundary', () => {
    expect(getAnalyticsDate(new Date('2026-01-01T15:59:59.000Z'))).toBe('2026-01-01')
    expect(getAnalyticsDate(new Date('2026-01-01T16:00:00.000Z'))).toBe('2026-01-02')
  })
})
