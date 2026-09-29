import { describe, expect, it } from 'vitest'
import {
  defaultLlmConfig,
  getCustomHeaderIssue,
  getLlmConfigIssue,
  normalizeCopywritingConfig,
  normalizeLlmConfig,
} from '../../src/lib/llm/config'
import { buildPrompt, getSystemPrompt } from '../../src/lib/llm/prompts'
import { getRequestUrlHint, getRequestUrlIssue } from '../../src/lib/llm/providers'
import type { LlmConfig } from '../../src/lib/llm/types'

const createConfig = (apiUrl: string, overrides: Partial<LlmConfig> = {}): LlmConfig => ({
  ...defaultLlmConfig(),
  apiUrl,
  apiKey: 'test-secret',
  modelName: 'test-model',
  ...overrides,
})

describe('LLM configuration', () => {
  it('migrates legacy settings and filters unsafe custom headers', () => {
    const config = normalizeLlmConfig({
      apiUrl: ' https://example.com/v1 ',
      apiKey: 'secret',
      modelName: 'model',
      stream: false,
      timeoutSeconds: 0,
      maxOutputTokens: -1,
      customHeaders: [
        { name: ' X-Trace ', value: 'trace' },
        { name: 'x-trace', value: 'duplicate' },
        { name: 'Authorization', value: 'override' },
        { name: 'bad header', value: 'invalid' },
        { name: 'X-Injected', value: 'safe\r\nAuthorization: leaked' },
      ],
    })

    expect(config.protocol).toBe('openai-chat')
    expect(config.apiUrl).toBe('https://example.com/v1')
    expect(config.timeoutSeconds).toBe(defaultLlmConfig().timeoutSeconds)
    expect(config.maxOutputTokens).toBeUndefined()
    expect('stream' in config).toBe(false)
    expect(config.customHeaders).toEqual([{ name: 'X-Trace', value: 'trace' }])
  })

  it('preserves valid new protocol settings and normalizes null clearable values', () => {
    const config = normalizeLlmConfig({
      protocol: 'openai-responses',
      apiUrl: null,
      apiKey: null,
      modelName: null,
      timeoutSeconds: 15,
      maxOutputTokens: null,
      customHeaders: [],
    })

    expect(config.protocol).toBe('openai-responses')
    expect(config.apiUrl).toBe('')
    expect(config.apiKey).toBe('')
    expect(config.modelName).toBe('')
    expect(config.timeoutSeconds).toBe(15)
    expect(config.maxOutputTokens).toBeUndefined()
  })

  it('validates URL protocols, known complete endpoints, query/hash, and credentials', () => {
    const cases = [
      ['openai-compatible', '/chat/completions'],
      ['openai-chat', '/chat/completions'],
      ['openai-responses', '/responses'],
      ['anthropic-messages', '/messages'],
    ] as const

    for (const [protocol, endpoint] of cases) {
      const config = createConfig(`https://example.com/v1${endpoint}`, { protocol })
      expect(getRequestUrlIssue(config)).toBe('full-endpoint')
      expect(getRequestUrlHint(config)).toBe('')
    }

    expect(
      getRequestUrlIssue(
        createConfig('https://example.com/v1/responses', { protocol: 'openai-chat' }),
      ),
    ).toBe('full-endpoint')
    expect(getRequestUrlIssue(createConfig('localhost:11434'))).toBe('invalid')
    expect(getRequestUrlIssue(createConfig('https://user:password@example.com/v1'))).toBe('invalid')
    expect(getRequestUrlHint(createConfig('https://user:password@example.com/v1'))).toBe('')
    expect(getRequestUrlIssue(createConfig('https://example.com/v1?key=secret'))).toBe('invalid')
    expect(getRequestUrlIssue(createConfig('https://example.com/v1#fragment'))).toBe('invalid')
    expect(getRequestUrlIssue(createConfig('http://localhost:11434/v1'))).toBeUndefined()
    expect(getRequestUrlHint(createConfig('http://localhost:11434/v1'))).toBe(
      'http://localhost:11434/v1/chat/completions',
    )
  })

  it('validates custom header names, values, protected names, and duplicates', () => {
    expect(getCustomHeaderIssue([{ name: 'bad header', value: 'x' }])).toBe('invalid-name')
    expect(getCustomHeaderIssue([{ name: 'Authorization', value: 'x' }])).toBe('protected-name')
    expect(getCustomHeaderIssue([{ name: 'X-Trace', value: 'one\r\ntwo' }])).toBe('invalid-value')
    expect(
      getCustomHeaderIssue([
        { name: 'X-Trace', value: 'one' },
        { name: 'x-trace', value: 'two' },
      ]),
    ).toBe('duplicate-name')
    expect(getCustomHeaderIssue([{ name: 'X-Trace', value: 'trace' }])).toBeUndefined()
  })

  it('reports user-input configuration issues instead of silently normalizing them', () => {
    const config = createConfig('https://example.com/v1')
    expect(getLlmConfigIssue({ ...config, timeoutSeconds: 0 })).toBe('invalid-timeout')
    expect(getLlmConfigIssue({ ...config, maxOutputTokens: 1.5 })).toBe('invalid-max-output-tokens')
    expect(getLlmConfigIssue({ ...config, maxOutputTokens: null })).toBeUndefined()
    expect(getLlmConfigIssue({ ...config, modelName: null })).toBe('model-name-required')
    expect(getLlmConfigIssue({ ...config, protocol: 'invalid' })).toBe('invalid-protocol')
    expect(getLlmConfigIssue({ ...config, apiUrl: null })).toBe('api-url-required')
    expect(getLlmConfigIssue(config)).toBeUndefined()
  })

  it('keeps optional sampling settings empty by default and validates their ranges', () => {
    expect(defaultLlmConfig().temperature).toBeUndefined()
    expect(defaultLlmConfig().topP).toBeUndefined()
    expect(getLlmConfigIssue(createConfig('https://example.com/v1', { temperature: 0 }))).toBe(
      undefined,
    )
    expect(getLlmConfigIssue(createConfig('https://example.com/v1', { topP: 1 }))).toBeUndefined()
    expect(getLlmConfigIssue(createConfig('https://example.com/v1', { temperature: 2.1 }))).toBe(
      'invalid-temperature',
    )
    expect(getLlmConfigIssue(createConfig('https://example.com/v1', { topP: 0 }))).toBeUndefined()
    expect(getLlmConfigIssue(createConfig('https://example.com/v1', { topP: 1.1 }))).toBe(
      'invalid-top-p',
    )
    expect(normalizeLlmConfig({ ...defaultLlmConfig(), temperature: 0, topP: 0.8 })).toMatchObject({
      temperature: 0,
      topP: 0.8,
    })
  })

  it('normalizes prompt modes and keeps standard and merged delivery semantics', () => {
    expect(normalizeCopywritingConfig({ systemPromptMode: 'invalid' })).toEqual({
      systemPromptMode: 'builtin',
      customSystemPrompt: '',
      diversityEnabled: false,
      rewriteOnSimilarity: true,
    })
    expect(getSystemPrompt({ systemPromptMode: 'off', customSystemPrompt: '' })).toBeUndefined()
    expect(getSystemPrompt({ systemPromptMode: 'custom', customSystemPrompt: '  rules  ' })).toBe(
      'rules',
    )
    expect(buildPrompt('request', 'rules', 'standard')).toEqual({
      prompt: 'request',
      instructions: 'rules',
    })
    expect(buildPrompt('request', 'rules', 'user-message')).toEqual({
      prompt: 'rules\n\n用户创作需求：\nrequest',
    })
  })
})
