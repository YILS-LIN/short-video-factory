import { describe, expect, it } from 'vitest'
import { formatErrorForCopy } from '../../src/lib/error-copy'
import { getErrorDetail, redactSensitiveText } from '../../src/lib/llm/security'
import type { LlmConfig } from '../../src/lib/llm/types'

const config = {
  protocol: 'openai-compatible',
  apiUrl: 'https://example.com/v1',
  apiKey: 'sk-secret-token',
  modelName: 'test-model',
  timeoutSeconds: 5,
  anthropicAuthMode: 'api-key',
  instructionDelivery: 'standard',
  customHeaders: [{ name: 'X-Trace-Token', value: 'header-secret' }],
} satisfies LlmConfig

describe('LLM error redaction', () => {
  it('redacts configured credentials and common authorization fields', () => {
    const detail = getErrorDetail(
      new Error(
        'request failed: sk-secret-token Authorization: Bearer leaked-token x-api-key: header-secret?api_key=sk-secret-token',
      ),
      config,
    )

    expect(detail).not.toContain('sk-secret-token')
    expect(detail).not.toContain('header-secret')
    expect(detail).toMatch(/Authorization: Bearer \[REDACTED\]/)
    expect(detail).toMatch(/x-api-key: \[REDACTED\]/)
  })

  it('handles JSON quoting, URL-encoded configured secrets, and repeated processing', () => {
    const detail = redactSensitiveText(
      '{"error":"Authorization: Bearer leaked-json-token", "api_key":"json-key"} ' +
        'https://example.com/?access_token=url-secret&keep=1 encoded=encoded%2Fsecret',
      {
        apiKey: 'encoded/secret',
        customHeaders: [],
      },
    )
    const redacted = redactSensitiveText(detail, { apiKey: 'encoded/secret', customHeaders: [] })

    expect(detail).not.toContain('leaked-json-token')
    expect(detail).not.toContain('json-key')
    expect(detail).not.toContain('url-secret')
    expect(detail).not.toContain('encoded/secret')
    expect(detail).not.toContain('encoded%2Fsecret')
    expect(redacted).toBe(detail)
  })

  it('copies sanitized diagnostics with the existing version and timestamp structure', () => {
    const copied = formatErrorForCopy(
      'Connection failed',
      getErrorDetail(new Error('sk-secret-token'), config),
    )
    const payload = JSON.parse(copied.replace(/^```json\n|\n```$/g, '')) as {
      message: string
      detail: string
      appVersion: string
      timestamp: string
    }

    expect(payload).toMatchObject({
      message: 'Connection failed',
      detail: '[REDACTED]',
      appVersion: 'test',
    })
    expect(Number.isNaN(Date.parse(payload.timestamp))).toBe(false)
  })

  it('keeps useful diagnostics without copying cause or response objects', () => {
    const error = Object.assign(new Error('Provider returned status 429'), {
      cause: new Error('Authorization: Bearer nested-secret'),
      response: { body: 'nested-secret' },
      request: { headers: { authorization: 'Bearer nested-secret' } },
    })
    const detail = getErrorDetail(error, { ...config, apiKey: 'nested-secret' })

    expect(detail).toBe('Provider returned status 429')
    expect(detail).not.toContain('nested-secret')
  })
})
