import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const instances: Array<{
    listeners: Map<string, ((...args: unknown[]) => void)[]>
    on: (event: string, listener: (...args: unknown[]) => void) => unknown
    emit: (event: string, ...args: unknown[]) => void
    send: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
  }> = []

  class MockWebSocket {
    listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    send = vi.fn()
    close = vi.fn()
    terminate = vi.fn(() => this.emit('close', 1006, Buffer.from('terminated')))

    constructor() {
      instances.push(this)
    }

    on(event: string, listener: (...args: unknown[]) => void) {
      const listeners = this.listeners.get(event) ?? []
      listeners.push(listener)
      this.listeners.set(event, listeners)
      return this
    }

    emit(event: string, ...args: unknown[]) {
      for (const listener of this.listeners.get(event) ?? []) listener(...args)
    }
  }

  return { instances, MockWebSocket }
})

vi.mock('ws', () => ({ default: mocks.MockWebSocket }))

import { EdgeTTS } from '../../electron/lib/edge-tts'

describe('EdgeTTS cancellation', () => {
  beforeEach(() => {
    mocks.instances.length = 0
  })

  it('terminates an active WebSocket and rejects as AbortError without retrying', async () => {
    const edgeTts = new EdgeTTS()
    const controller = new AbortController()
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const operation = edgeTts.synthesize('hello', 'en-US-Test', {}, controller.signal)

    await vi.waitFor(() => expect(mocks.instances).toHaveLength(1))
    const socket = mocks.instances[0]
    controller.abort()

    await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
    expect(socket.terminate).toHaveBeenCalledTimes(1)
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
    expect(mocks.instances).toHaveLength(1)
    expect(consoleError).not.toHaveBeenCalled()
  })

  it('does not open a WebSocket when already aborted', async () => {
    const edgeTts = new EdgeTTS()
    const controller = new AbortController()
    controller.abort()

    await expect(
      edgeTts.synthesize('hello', 'en-US-Test', {}, controller.signal),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(mocks.instances).toHaveLength(0)
  })

  it('does not retry a retryable upstream failure after cancellation during backoff', async () => {
    vi.useFakeTimers()
    const edgeTts = new EdgeTTS()
    const controller = new AbortController()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    try {
      const operation = edgeTts.synthesize('hello', 'en-US-Test', {}, controller.signal)
      await vi.waitFor(() => expect(mocks.instances).toHaveLength(1))
      mocks.instances[0].emit('unexpected-response', {}, { statusCode: 503 })
      await vi.waitFor(() => expect(vi.getTimerCount()).toBeGreaterThan(0))

      controller.abort()
      await expect(operation).rejects.toMatchObject({ name: 'AbortError' })
      expect(mocks.instances).toHaveLength(1)
      expect(vi.getTimerCount()).toBe(0)
      expect(consoleError).toHaveBeenCalledTimes(1)
      expect(consoleWarn).toHaveBeenCalledTimes(1)
    } finally {
      vi.useRealTimers()
    }
  })
})
