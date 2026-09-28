import { describe, expect, it, vi } from 'vitest'
import { generateCopywriting } from '../../src/lib/llm/generate'
import type { LlmConfig } from '../../src/lib/llm/types'
import { createOpenAiEvents, startSseServer, writeSse } from './server'

const createConfig = (apiUrl: string, overrides: Partial<LlmConfig> = {}): LlmConfig => ({
  protocol: 'openai-compatible',
  apiUrl,
  apiKey: 'test-secret',
  modelName: 'test-model',
  timeoutSeconds: 5,
  anthropicAuthMode: 'api-key',
  instructionDelivery: 'standard',
  customHeaders: [],
  ...overrides,
})

const generate = (apiUrl: string, abortSignal = new AbortController().signal) =>
  generateCopywriting({
    llmConfig: createConfig(apiUrl),
    copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
    prompt: '写一句欢迎语',
    abortSignal,
  })

describe('copywriting stream lifecycle', () => {
  it('returns completed text only after a normal stop finish reason', async () => {
    const server = await startSseServer((_request, response) =>
      writeSse(response, createOpenAiEvents()),
    )
    try {
      await expect(generate(server.baseUrl)).resolves.toMatchObject({
        text: '你好',
        finishReason: 'stop',
        status: 'completed',
      })
    } finally {
      await server.close()
    }
  })

  it('keeps text but marks length-limited and unknown finish reasons as truncated', async () => {
    for (const finishReason of ['length', 'future_reason']) {
      const server = await startSseServer((_request, response) =>
        writeSse(response, createOpenAiEvents(finishReason)),
      )
      try {
        await expect(generate(server.baseUrl)).resolves.toMatchObject({
          text: '你好',
          finishReason,
          status: 'truncated',
        })
      } finally {
        await server.close()
      }
    }
  })

  it('marks an empty normal stream as failed', async () => {
    const server = await startSseServer((_request, response) =>
      writeSse(response, [
        {
          data: {
            id: 'chatcmpl-empty',
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          },
        },
        { data: '[DONE]' },
      ]),
    )
    try {
      await expect(generate(server.baseUrl)).resolves.toMatchObject({
        text: '',
        status: 'failed',
      })
    } finally {
      await server.close()
    }
  })

  it('marks a stream without a finish event as incomplete', async () => {
    const server = await startSseServer((_request, response) =>
      writeSse(response, [
        {
          data: {
            id: 'chatcmpl-incomplete',
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { content: '你好' }, finish_reason: null }],
          },
        },
        { data: '[DONE]' },
      ]),
    )
    try {
      await expect(generate(server.baseUrl)).rejects.toThrow(/finish reason/i)
    } finally {
      await server.close()
    }
  })

  it('preserves partial text when cancellation follows the received delta', async () => {
    const server = await startSseServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream', connection: 'keep-alive' })
      response.write(
        `data: ${JSON.stringify({
          id: 'chatcmpl-partial',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: '你好' }, finish_reason: null }],
        })}\n\n`,
      )
    })
    const controller = new AbortController()
    let receivedDelta = false
    try {
      const result = await generateCopywriting({
        llmConfig: createConfig(server.baseUrl, { timeoutSeconds: 1 }),
        copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
        prompt: '写一句欢迎语',
        abortSignal: controller.signal,
        onTextDelta: (delta) => {
          if (delta === '你好') {
            receivedDelta = true
            controller.abort()
          }
        },
      })

      expect(receivedDelta).toBe(true)
      expect(result).toMatchObject({ text: '你好', status: 'cancelled' })
    } finally {
      await server.close()
    }
  })

  it('returns a cancelled empty result when already aborted before starting', async () => {
    const server = await startSseServer((_request, response) =>
      writeSse(response, createOpenAiEvents()),
    )
    const controller = new AbortController()
    controller.abort()
    try {
      await expect(generate(server.baseUrl, controller.signal)).resolves.toMatchObject({
        text: '',
        status: 'cancelled',
      })
      expect(server.requests).toHaveLength(0)
    } finally {
      await server.close()
    }
  })

  it('reports timeout independently from user cancellation', async () => {
    const server = await startSseServer(() => undefined)
    try {
      await expect(
        generateCopywriting({
          llmConfig: createConfig(server.baseUrl, { timeoutSeconds: 1 }),
          copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
          prompt: '写一句欢迎语',
          abortSignal: new AbortController().signal,
        }),
      ).rejects.toThrow('Request timed out after 1 seconds')
      await server.waitForRequest()
    } finally {
      await server.close()
    }
  }, 5000)

  it('keeps timeout as the first termination reason if the user cancels afterward', async () => {
    const server = await startSseServer(() => undefined)
    const controller = new AbortController()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    try {
      const request = generateCopywriting({
        llmConfig: createConfig(server.baseUrl, { timeoutSeconds: 1 }),
        copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
        prompt: '写一句欢迎语',
        abortSignal: controller.signal,
      })
      const timeoutAssertion = expect(request).rejects.toThrow('Request timed out after 1 seconds')
      await server.waitForRequest()
      await vi.advanceTimersByTimeAsync(1000)
      controller.abort()
      await timeoutAssertion
    } finally {
      vi.useRealTimers()
      await server.close()
    }
  }, 5000)

  it('surfaces an SSE error instead of treating it as completed output', async () => {
    const consoleError = vi.spyOn(console, 'error')
    const server = await startSseServer((_request, response) =>
      writeSse(response, [
        {
          data: {
            id: 'chatcmpl-error',
            object: 'chat.completion.chunk',
            choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }],
          },
        },
        { data: { error: { message: 'provider failed', type: 'server_error' } } },
      ]),
    )
    let partialText = ''
    try {
      await expect(
        generateCopywriting({
          llmConfig: createConfig(server.baseUrl),
          copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
          prompt: '写一句欢迎语',
          abortSignal: new AbortController().signal,
          onTextDelta: (delta) => (partialText += delta),
        }),
      ).rejects.toThrow()
      expect(server.requests).toHaveLength(1)
      expect(partialText).toBe('partial')
      expect(consoleError).not.toHaveBeenCalled()
    } finally {
      await server.close()
    }
  })

  it('does not convert a physical stream interruption into a successful result', async () => {
    const server = await startSseServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'text/event-stream', connection: 'keep-alive' })
      response.write(
        `data: ${JSON.stringify({
          id: 'chatcmpl-disconnect',
          object: 'chat.completion.chunk',
          choices: [{ index: 0, delta: { content: 'partial' }, finish_reason: null }],
        })}\n\n`,
      )
      response.destroy()
    })
    try {
      await expect(
        generateCopywriting({
          llmConfig: createConfig(server.baseUrl, { timeoutSeconds: 2 }),
          copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
          prompt: '写一句欢迎语',
          abortSignal: new AbortController().signal,
        }),
      ).rejects.toThrow()
    } finally {
      await server.close()
    }
  }, 5000)

  it('retries failed requests only within the configured pre-output retry limit', async () => {
    const server = await startSseServer((_request, response) => {
      if (server.requests.length < 3) {
        response.writeHead(503, { 'content-type': 'application/json' })
        response.end(JSON.stringify({ error: { message: 'temporary unavailable' } }))
        return
      }
      writeSse(response, createOpenAiEvents())
    })
    try {
      await expect(
        generateCopywriting({
          llmConfig: createConfig(server.baseUrl, { timeoutSeconds: 20 }),
          copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
          prompt: '写一句欢迎语',
          abortSignal: new AbortController().signal,
        }),
      ).resolves.toMatchObject({ text: '你好', status: 'completed' })
      expect(server.requests).toHaveLength(3)
    } finally {
      await server.close()
    }
  }, 15000)

  it('rejects invalid service-boundary configuration before making a request', async () => {
    const server = await startSseServer((_request, response) =>
      writeSse(response, createOpenAiEvents()),
    )
    try {
      await expect(
        generateCopywriting({
          llmConfig: createConfig(server.baseUrl, { modelName: ' ' }),
          copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
          prompt: '写一句欢迎语',
          abortSignal: new AbortController().signal,
        }),
      ).rejects.toThrow('Invalid model configuration: model-name-required')
      expect(server.requests).toHaveLength(0)
    } finally {
      await server.close()
    }
  })
})
