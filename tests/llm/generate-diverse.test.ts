// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { defaultCopywritingConfig, defaultLlmConfig } from '../../src/lib/llm/config'
import { generateDiverseCopywriting } from '../../src/lib/llm/generate-diverse'
import { clearCopywritingHistory } from '../../src/store/copywriting-history'
import type { CopywritingConfig, LlmConfig } from '../../src/lib/llm/types'
import { startSseServer, writeSse } from './server'

const copywritingConfig = (): CopywritingConfig => ({
  ...defaultCopywritingConfig(),
  diversityEnabled: true,
})

const llmConfig = (apiUrl: string): LlmConfig => ({
  ...defaultLlmConfig(),
  apiUrl,
  modelName: 'test-model',
  timeoutSeconds: 5,
})

const textEvents = (text: string) => [
  {
    data: {
      id: 'chatcmpl-diversity',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: { content: text }, finish_reason: null }],
    },
  },
  {
    data: {
      id: 'chatcmpl-diversity',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    },
  },
  { data: '[DONE]' },
]

const emptyEvents = () => [
  {
    data: {
      id: 'chatcmpl-empty',
      object: 'chat.completion.chunk',
      choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
    },
  },
  { data: '[DONE]' },
]

afterEach(() => clearCopywritingHistory())

describe('diverse copywriting generation', () => {
  it('avoids history and retries a highly similar complete draft once with a new strategy', async () => {
    let requestCount = 0
    const server = await startSseServer((_request, response) => {
      requestCount += 1
      const text = requestCount === 3 ? '换个角度，给你一份不一样的口播内容。' : '你好'
      writeSse(response, textEvents(text))
    })
    try {
      const first = await generateDiverseCopywriting({
        llmConfig: llmConfig(server.baseUrl),
        copywritingConfig: copywritingConfig(),
        prompt: '写一句欢迎语',
        abortSignal: new AbortController().signal,
      })
      expect(first).toMatchObject({ text: '你好', status: 'completed' })

      const phases: string[] = []
      const second = await generateDiverseCopywriting({
        llmConfig: llmConfig(server.baseUrl),
        copywritingConfig: copywritingConfig(),
        prompt: '写一句欢迎语',
        abortSignal: new AbortController().signal,
        onPhase: (phase) => phases.push(phase),
      })

      expect(requestCount).toBe(3)
      expect(second).toMatchObject({
        text: '换个角度，给你一份不一样的口播内容。',
        status: 'completed',
        similarityWarning: false,
        rewriteFailed: false,
      })
      expect(phases).toContain('rewriting')
      expect(JSON.stringify(server.requests[0].body)).toContain('本次创作策略')
      expect(JSON.stringify(server.requests[2].body)).toContain('你好')
      expect(server.requests[1].body).not.toEqual(server.requests[2].body)
    } finally {
      await server.close()
    }
  })

  it('does not write history when diversity is disabled', async () => {
    const server = await startSseServer((_request, response) =>
      writeSse(response, textEvents('你好')),
    )
    try {
      const result = await generateDiverseCopywriting({
        llmConfig: llmConfig(server.baseUrl),
        copywritingConfig: { ...defaultCopywritingConfig(), diversityEnabled: false },
        prompt: '写一句欢迎语',
        abortSignal: new AbortController().signal,
      })
      expect(result).toMatchObject({ text: '你好', status: 'completed' })
      expect(JSON.stringify(server.requests[0].body)).not.toContain('本次创作策略')
    } finally {
      await server.close()
    }
  })

  it('honors cancellation during the similarity check and does not save the draft', async () => {
    let requestCount = 0
    const server = await startSseServer((_request, response) => {
      requestCount += 1
      writeSse(response, textEvents('你好'))
    })
    try {
      const controller = new AbortController()
      const cancelled = await generateDiverseCopywriting({
        llmConfig: llmConfig(server.baseUrl),
        copywritingConfig: copywritingConfig(),
        prompt: '写一句欢迎语',
        abortSignal: controller.signal,
        onPhase: (phase) => {
          if (phase === 'checking') controller.abort()
        },
      })
      expect(cancelled.status).toBe('cancelled')

      const next = await generateDiverseCopywriting({
        llmConfig: llmConfig(server.baseUrl),
        copywritingConfig: copywritingConfig(),
        prompt: '写一句欢迎语',
        abortSignal: new AbortController().signal,
      })
      expect(next).toMatchObject({ text: '你好', status: 'completed', similarityWarning: false })
      expect(requestCount).toBe(2)
    } finally {
      await server.close()
    }
  })

  it('keeps the complete first draft when the rewrite returns no usable text', async () => {
    let requestCount = 0
    const server = await startSseServer((_request, response) => {
      requestCount += 1
      writeSse(response, requestCount === 3 ? emptyEvents() : textEvents('你好'))
    })
    try {
      const options = {
        llmConfig: llmConfig(server.baseUrl),
        copywritingConfig: copywritingConfig(),
        prompt: '写一句欢迎语',
        abortSignal: new AbortController().signal,
      }
      await generateDiverseCopywriting(options)
      const result = await generateDiverseCopywriting(options)
      expect(requestCount).toBe(3)
      expect(result).toMatchObject({
        text: '你好',
        status: 'completed',
        similarityWarning: true,
        rewriteFailed: true,
      })
    } finally {
      await server.close()
    }
  })

  it('cancels a rewrite without treating the first draft as synthesizable completion', async () => {
    let requestCount = 0
    const server = await startSseServer((_request, response) => {
      requestCount += 1
      writeSse(response, textEvents('你好'))
    })
    try {
      const options = {
        llmConfig: llmConfig(server.baseUrl),
        copywritingConfig: copywritingConfig(),
        prompt: '写一句欢迎语',
        abortSignal: new AbortController().signal,
      }
      await generateDiverseCopywriting(options)
      const controller = new AbortController()
      const result = await generateDiverseCopywriting({
        ...options,
        abortSignal: controller.signal,
        onPhase: (phase) => {
          if (phase === 'rewriting') controller.abort()
        },
      })
      expect(requestCount).toBe(2)
      expect(result).toMatchObject({ text: '你好', status: 'cancelled' })
    } finally {
      await server.close()
    }
  })
})
