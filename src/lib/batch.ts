export function normalizeBatchConfig(value: unknown): {
  count: number
  onError: 'stop' | 'continue'
} {
  const config = value && typeof value === 'object' ? (value as Record<string, unknown>) : {}
  return {
    count:
      typeof config.count === 'number' &&
      Number.isInteger(config.count) &&
      config.count >= 1 &&
      config.count <= 999
        ? config.count
        : 10,
    onError: config.onError === 'continue' ? 'continue' : 'stop',
  }
}

export interface BatchRunState {
  id: string
  startedAt: number
  total: number
  current: number
  completedCount: number
  failedCount: number
  cancelledCount: number
  warningCount: number
  consecutiveFailures: number
  onError: 'stop' | 'continue'
  running: boolean
  stopRequested: boolean
  stopReason: string
  finished: boolean
}

export async function runBatch(
  batch: BatchRunState,
  execute: () => Promise<void>,
  prepareNext: () => void,
): Promise<string> {
  for (let index = 1; index <= batch.total; index++) {
    if (batch.stopRequested || batch.finished) break
    batch.current = index
    const errorsBefore = batch.failedCount + batch.warningCount
    await execute()
    if (batch.stopRequested || batch.finished) break
    const failed = batch.failedCount + batch.warningCount > errorsBefore
    batch.consecutiveFailures = failed ? batch.consecutiveFailures + 1 : 0
    if (failed && batch.onError === 'stop') return 'generation_failed'
    if (batch.consecutiveFailures >= 3) return 'consecutive_failures'
    if (index < batch.total) prepareNext()
  }
  return batch.stopReason || (batch.stopRequested ? 'user_cancelled' : 'completed')
}
