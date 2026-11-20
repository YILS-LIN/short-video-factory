import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const instances: Array<{
    listeners: Map<string, ((...args: unknown[]) => void)[]>
    on: (event: string, listener: (...args: unknown[]) => void) => unknown
    emit: (event: string, ...args: unknown[]) => void
    send: ReturnType<typeof vi.fn>
    terminate: ReturnType<typeof vi.fn>
    url: string
  }> = []

  class MockWebSocket {
    listeners = new Map<string, ((...args: unknown[]) => void)[]>()
    send = vi.fn()
    close = vi.fn()
    terminate = vi.fn(() => this.emit('close', 1006, Buffer.from('terminated')))

    constructor(public readonly url: string) {
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

import {
  Constants,
  DRM,
  EdgeTTS,
  SEC_MS_GEC_VERSION,
  splitTextByByteLength,
} from '../../electron/lib/edge-tts'

describe('splitTextByByteLength', () => {
  it('splits 1810 continuous Chinese characters without losing text', () => {
    const text = '中'.repeat(1810)
    const chunks = splitTextByByteLength(text, 4096)

    expect(chunks.map((chunk) => Buffer.byteLength(chunk))).toEqual([4095, 1335])
    expect(chunks.join('')).toBe(text)
  })

  it('prefers sentence punctuation or a newline over a later space', () => {
    expect(splitTextByByteLength('你好。再见 世界', 18)).toEqual(['你好。', '再见 世界'])
    expect(splitTextByByteLength('hello\nworld again', 13)).toEqual(['hello\n', 'world again'])
    expect(splitTextByByteLength('hello world again', 9)).toEqual(['hello ', 'world ', 'again'])
  })

  it('counts XML escapes and does not cut a multibyte character', () => {
    expect(splitTextByByteLength(Buffer.from('中🙂&<>'), 6)).toEqual(['中', '🙂', '&', '<', '>'])
    expect(splitTextByByteLength('中&', 8)).toEqual(['中&'])
    expect(() => splitTextByByteLength('&', 4)).toThrow()
    expect(() => splitTextByByteLength('text', NaN)).toThrow()
  })
})

describe('EdgeTTS chunked synthesis', () => {
  beforeEach(() => {
    mocks.instances.length = 0
  })

  it('sends bounded, escaped SSML in order and joins audio and word offsets', async () => {
    const edgeTts = new EdgeTTS()
    const text = '中'.repeat(1364) + '&<尾>'
    const operation = edgeTts.synthesize(text, 'zh-CN-YunjianNeural')
    const sentTexts: string[] = []
    const audioChunks: Buffer[] = []
    const wordOffset = 200_000

    for (const index of [0, 1]) {
      await vi.waitFor(() => expect(mocks.instances).toHaveLength(index + 1))
      const socket = mocks.instances[index]
      socket.emit('open')
      const speechMessage = socket.send.mock.calls[1][0] as string
      const sentText = speechMessage.match(/<prosody[^>]*>\s*([^\n]*)/)?.[1] ?? ''
      expect(Buffer.byteLength(sentText)).toBeLessThanOrEqual(4096)
      sentTexts.push(sentText)

      const audioChunk = Buffer.alloc(600, index)
      audioChunk.set([0xff, 0xfb, 0x90, 0x64])
      audioChunks.push(audioChunk)
      const metadata = {
        Metadata: [{ Type: 'WordBoundary', Data: { Offset: wordOffset, Duration: 100, text: {} } }],
      }
      socket.emit('message', Buffer.from(`Path:audio.metadata\r\n\r\n${JSON.stringify(metadata)}`))
      socket.emit('message', Buffer.concat([Buffer.from('Path:audio\r\n'), audioChunk]))
      socket.emit('message', Buffer.from('Path:turn.end\r\n\r\n'))
      socket.emit('close', 1000, Buffer.alloc(0))
    }

    const result = await operation
    expect(sentTexts).toEqual(['中'.repeat(1364), '&amp;&lt;尾&gt;'])
    expect(mocks.instances).toHaveLength(2)
    expect(result.getBuffer()).toEqual(Buffer.concat(audioChunks))
    expect(result.getWordList().map((word) => word.Offset)).toEqual([wordOffset, 1_200_000])
  })
})

describe('EdgeTTS cancellation', () => {
  beforeEach(() => {
    mocks.instances.length = 0
  })

  it('terminates an active WebSocket and rejects as AbortError without retrying', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1791888000000)
    const edgeTts = new EdgeTTS()
    const controller = new AbortController()
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener')
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const operation = edgeTts.synthesize('hello', 'en-US-Test', {}, controller.signal)

    await vi.waitFor(() => expect(mocks.instances).toHaveLength(1))
    const socket = mocks.instances[0]
    const url = new URL(socket.url)
    expect(url.searchParams.get('Sec-MS-GEC')).toBe(DRM.generateSecMsGec())
    expect(url.searchParams.get('Sec-MS-GEC')).toMatch(/^[0-9A-F]{16}-[0-9A-F]{64}$/)
    expect(url.searchParams.get('Sec-MS-GEC-Version')).toBe(SEC_MS_GEC_VERSION)
    expect(SEC_MS_GEC_VERSION).toMatch(/^2-/)
    expect(url.searchParams.get('trustedclienttoken')).toBe(Constants.TRUSTED_CLIENT_TOKEN)
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

  it('keeps failure diagnostics bounded when the upstream sends many repeated messages', async () => {
    const edgeTts = new EdgeTTS()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const operation = edgeTts.synthesize('hello', 'en-US-Test')

    await vi.waitFor(() => expect(mocks.instances).toHaveLength(1))
    const socket = mocks.instances[0]
    const audioMessage = Buffer.from('Path:audio\r\n\r\ndata')
    const metadataMessage = Buffer.from(
      `Path:audio.metadata\r\n\r\n${JSON.stringify({ Metadata: [] })}`,
    )
    for (let index = 0; index < 250; index += 1) socket.emit('message', audioMessage)
    for (let index = 0; index < 100; index += 1) socket.emit('message', metadataMessage)
    for (let index = 0; index < 50; index += 1) {
      socket.emit('message', Buffer.from(`Path:unrecognized-type-${index}\r\n\r\ndata`))
    }
    socket.emit('message', Buffer.from('Path:audio.metadata\r\n\r\n{'))

    const error = await operation.catch((reason: unknown) => reason)
    expect(error).toMatchObject({
      name: 'EdgeTTSError',
      diagnostics: {
        escapedTextBytes: 5,
        ssmlBytes: expect.any(Number),
        chunkIndex: 1,
        chunkCount: 1,
        messageTypes: ['audio', 'audio.metadata', 'other'],
        messageCounts: { audio: 250, 'audio.metadata': 101, other: 50 },
      },
    })
    expect(consoleError).toHaveBeenCalledTimes(1)
    const loggedDiagnostics = consoleError.mock.calls[0][1] as {
      diagnostics: { messageTypes: string[]; messageCounts: Record<string, number> }
    }
    expect(loggedDiagnostics.diagnostics.messageTypes).toHaveLength(3)
    expect(Object.keys(loggedDiagnostics.diagnostics.messageCounts)).toHaveLength(3)
    expect(loggedDiagnostics.diagnostics.messageCounts).toMatchObject({
      audio: 250,
      'audio.metadata': 101,
      other: 50,
    })
  })

  it('does not emit a verbose diagnostic object for successful synthesis', async () => {
    const edgeTts = new EdgeTTS()
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const operation = edgeTts.synthesize('hello', 'en-US-Test')

    await vi.waitFor(() => expect(mocks.instances).toHaveLength(1))
    const socket = mocks.instances[0]
    socket.emit('open')

    const audioChunk = Buffer.alloc(4)
    audioChunk.set([0xff, 0xfb, 0x90, 0x64])
    for (let index = 0; index < 160; index += 1) {
      socket.emit('message', Buffer.concat([Buffer.from('Path:audio\r\n\r\n'), audioChunk]))
    }
    socket.emit('message', Buffer.from('Path:turn.end\r\n\r\n'))
    socket.emit('close', 1000, Buffer.from(''))

    await expect(operation).resolves.toMatchObject({ getSize: expect.any(Function) })
    expect(consoleDebug).not.toHaveBeenCalled()
  })
})
