import { describe, expect, it } from 'vitest'
import { generateCopywriting } from '../../src/lib/llm/generate'
import type { LlmConfig } from '../../src/lib/llm/types'
import {
  createAnthropicEvents,
  createOpenAiEvents,
  createResponsesEvents,
  startSseServer,
  writeSse,
} from './server'

const createConfig = (apiUrl: string, overrides: Partial<LlmConfig> = {}): LlmConfig => ({
  protocol: 'openai-compatible',
  apiUrl,
  apiKey: 'test-secret',
  modelName: 'test-model',
  timeoutSeconds: 5,
  anthropicAuthMode: 'api-key',
  instructionDelivery: 'standard',
  maxOutputTokens: 123,
  customHeaders: [{ name: 'X-Trace', value: 'trace-123' }],
  ...overrides,
})

const asObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' ? (value as Record<string, unknown>) : {}

describe('SDK provider requests', () => {
  it('sends the expected paths, request bodies, headers, prompts, and parses each protocol stream', async () => {
    const cases = [
      {
        protocol: 'openai-compatible',
        path: '/v1/chat/completions',
        events: createOpenAiEvents(),
      },
      {
        protocol: 'openai-chat',
        path: '/v1/chat/completions',
        events: createOpenAiEvents(),
      },
      {
        protocol: 'openai-responses',
        path: '/v1/responses',
        events: createResponsesEvents(),
      },
      {
        protocol: 'anthropic-messages',
        path: '/v1/messages',
        events: createAnthropicEvents(),
      },
    ] as const

    for (const { protocol, path, events } of cases) {
      const server = await startSseServer((_request, response) => writeSse(response, events))
      try {
        const result = await generateCopywriting({
          llmConfig: createConfig(server.baseUrl, { protocol, temperature: 0.4, topP: 0.8 }),
          copywritingConfig: { systemPromptMode: 'custom', customSystemPrompt: '只写口播正文' },
          prompt: '写一句欢迎语',
          abortSignal: new AbortController().signal,
        })
        const request = server.requests[0]
        const body = request.body

        expect(result).toMatchObject({ text: '你好', status: 'completed' })
        expect(request.method).toBe('POST')
        expect(request.url).toBe(path)
        expect(request.headers['content-type']).toContain('application/json')
        expect(request.headers['x-trace']).toBe('trace-123')
        expect(body.model).toBe('test-model')
        expect(body.stream).toBe(true)
        expect(body.temperature).toBe(0.4)
        expect(body.top_p).toBe(0.8)

        if (protocol === 'openai-compatible' || protocol === 'openai-chat') {
          const messages = body.messages as Array<{ role: string; content: string }>
          expect(messages).toContainEqual({ role: 'system', content: '只写口播正文' })
          expect(messages).toContainEqual({ role: 'user', content: '写一句欢迎语' })
          expect(body.max_tokens ?? body.max_completion_tokens).toBe(123)
          expect(request.headers.authorization).toBe('Bearer test-secret')
          if (protocol === 'openai-chat') {
            expect(body.stream_options).toMatchObject({ include_usage: true })
          } else {
            expect(body.stream_options).toBeUndefined()
          }
        }

        if (protocol === 'openai-responses') {
          const input = body.input as Array<Record<string, unknown>>
          expect(input).toContainEqual({ role: 'system', content: '只写口播正文' })
          expect(JSON.stringify(input)).toContain('写一句欢迎语')
          expect(body.instructions).toBeUndefined()
          expect(body.max_output_tokens).toBe(123)
          expect(request.headers.authorization).toBe('Bearer test-secret')
        }

        if (protocol === 'anthropic-messages') {
          expect(body.system).toEqual([{ type: 'text', text: '只写口播正文' }])
          expect(body.max_tokens).toBe(123)
          expect(result.finishReason).toBe('end_turn')
          expect(request.headers['x-api-key']).toBe('test-secret')
          expect(request.headers.authorization).toBeUndefined()
          expect(request.headers['anthropic-version']).toBeTruthy()
        }
      } finally {
        await server.close()
      }
    }
  })

  it('uses mutually exclusive Anthropic API-key and Bearer authentication', async () => {
    for (const authMode of ['api-key', 'bearer'] as const) {
      const server = await startSseServer((_request, response) =>
        writeSse(response, createAnthropicEvents()),
      )
      try {
        await generateCopywriting({
          llmConfig: createConfig(server.baseUrl, {
            protocol: 'anthropic-messages',
            anthropicAuthMode: authMode,
          }),
          copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
          prompt: '写一句欢迎语',
          abortSignal: new AbortController().signal,
        })
        const headers = server.requests[0].headers

        expect(headers['x-api-key']).toBe(authMode === 'api-key' ? 'test-secret' : undefined)
        expect(headers.authorization).toBe(authMode === 'bearer' ? 'Bearer test-secret' : undefined)
      } finally {
        await server.close()
      }
    }
  })

  it('omits Authorization for a keyless OpenAI-compatible request and uses its 4096 token default for Anthropic', async () => {
    const compatibleServer = await startSseServer((_request, response) =>
      writeSse(response, createOpenAiEvents()),
    )
    try {
      await generateCopywriting({
        llmConfig: createConfig(compatibleServer.baseUrl, {
          apiKey: '',
          maxOutputTokens: undefined,
        }),
        copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
        prompt: '写一句欢迎语',
        abortSignal: new AbortController().signal,
      })
      expect(compatibleServer.requests[0].headers.authorization).toBeUndefined()
    } finally {
      await compatibleServer.close()
    }

    const anthropicServer = await startSseServer((_request, response) =>
      writeSse(response, createAnthropicEvents()),
    )
    try {
      await generateCopywriting({
        llmConfig: createConfig(anthropicServer.baseUrl, {
          protocol: 'anthropic-messages',
          maxOutputTokens: undefined,
        }),
        copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
        prompt: '写一句欢迎语',
        abortSignal: new AbortController().signal,
      })
      expect(anthropicServer.requests[0].body.max_tokens).toBe(4096)
    } finally {
      await anthropicServer.close()
    }
  })

  it('places merged instructions in the user prompt instead of a protocol instruction field', async () => {
    const server = await startSseServer((_request, response) =>
      writeSse(response, createResponsesEvents()),
    )
    try {
      await generateCopywriting({
        llmConfig: createConfig(server.baseUrl, {
          protocol: 'openai-responses',
          instructionDelivery: 'user-message',
        }),
        copywritingConfig: { systemPromptMode: 'custom', customSystemPrompt: '口语化' },
        prompt: '写一句欢迎语',
        abortSignal: new AbortController().signal,
      })
      const body = server.requests[0].body
      const input = asObject((body.input as unknown[])[0])

      expect(body.instructions).toBeUndefined()
      expect(JSON.stringify(input)).toContain('口语化')
      expect(JSON.stringify(input)).toContain('写一句欢迎语')
    } finally {
      await server.close()
    }
  })
})
