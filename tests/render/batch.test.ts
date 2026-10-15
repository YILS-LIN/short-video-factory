import { describe, expect, it } from 'vitest'
import { normalizeBatchConfig, runBatch, type BatchRunState } from '../../src/lib/batch'

const state = (): BatchRunState => ({
  id: 'batch',
  startedAt: 0,
  total: 5,
  current: 0,
  completedCount: 0,
  failedCount: 0,
  cancelledCount: 0,
  warningCount: 0,
  consecutiveFailures: 0,
  onError: 'continue',
  running: true,
  stopRequested: false,
  stopReason: '',
  finished: false,
})
describe('finite sequential batches', () => {
  it.each([
    null,
    {},
    { count: 0 },
    { count: 2.5 },
    { count: 1000 },
    { count: '10', onError: 'invalid' },
  ])('normalizes invalid saved settings %j', (value) => {
    expect(normalizeBatchConfig(value)).toEqual({ count: 10, onError: 'stop' })
  })
  it('runs exactly the requested number of attempts with no overlapping work', async () => {
    const batch = state()
    let active = 0
    let next = 0
    expect(
      await runBatch(
        batch,
        async () => {
          expect(++active).toBe(1)
          await Promise.resolve()
          batch.completedCount++
          active--
        },
        () => next++,
      ),
    ).toBe('completed')
    expect(batch.completedCount).toBe(5)
    expect(batch.current).toBe(5)
    expect(next).toBe(4)
  })
  it('counts failed attempts and resets the consecutive failure limit on success', async () => {
    const batch = state()
    await runBatch(
      batch,
      async () => {
        if (batch.current === 3) batch.completedCount++
        else batch.failedCount++
      },
      () => {},
    )
    expect(batch.failedCount).toBe(4)
    expect(batch.completedCount).toBe(1)
    expect(batch.current).toBe(5)
  })
  it('stops after three consecutive failures', async () => {
    const batch = state()
    expect(
      await runBatch(
        batch,
        async () => {
          batch.failedCount++
        },
        () => {},
      ),
    ).toBe('consecutive_failures')
    expect(batch.current).toBe(3)
  })
  it('stops on subtitle export errors without counting a successful video as failed', async () => {
    const batch = state()
    batch.onError = 'stop'
    expect(
      await runBatch(
        batch,
        async () => {
          batch.completedCount++
          batch.warningCount++
        },
        () => {},
      ),
    ).toBe('generation_failed')
    expect(batch.completedCount).toBe(1)
    expect(batch.failedCount).toBe(0)
  })
  it('never prepares or starts another task after cancellation', async () => {
    const batch = state()
    expect(
      await runBatch(
        batch,
        async () => {
          batch.stopRequested = true
          batch.cancelledCount++
        },
        () => {
          throw new Error('must not start next')
        },
      ),
    ).toBe('user_cancelled')
    expect(batch.current).toBe(1)
  })
})
