import { describe, expect, it, vi } from 'vitest'
import {
  diagnosticError,
  logGeneration,
  redactDiagnosticText,
} from '../../src/lib/generation-diagnostics'

describe('generation diagnostics', () => {
  it('retains actionable errors and bounded causes without serializing request bodies', () => {
    const cause = Object.assign(new Error('connect ETIMEDOUT'), {
      code: 'ETIMEDOUT',
      cause: undefined as unknown,
    })
    const error = Object.assign(new Error('TTS failed'), {
      cause,
      statusCode: 503,
      requestBody: 'private script',
      responseBody: 'private response',
      apiKey: 'private key',
    })
    const result = diagnosticError(error)
    expect(result).toMatchObject({
      message: 'TTS failed',
      statusCode: 503,
      cause: { code: 'ETIMEDOUT' },
    })
    expect(JSON.stringify(result)).not.toContain('private')
    cause.cause = cause
    expect(JSON.stringify(diagnosticError(error))).toContain('[CAUSE LIMIT]')
  })

  it('redacts credentials, URLs, personal paths and JSON content', () => {
    const result = redactDiagnosticText(
      'Authorization: Bearer abcdef api_key="some-key" token=abcdef https://user:pass@host/api?key=secret /Users/alice/private/video.mp4 C:\\Users\\alice\\video.mp4 {"prompt":"private script","messages":[{"content":"private text"}]}',
    )
    for (const secret of [
      'abcdef',
      'some-key',
      'user:pass',
      'alice',
      'private script',
      'private text',
    ]) {
      expect(result).not.toContain(secret)
    }
    expect(result).toContain('[REDACTED]')
  })

  it('limits verbose FFmpeg output while retaining the beginning and final error', () => {
    const result = redactDiagnosticText(`FFmpeg started ${'x'.repeat(10000)} encoder failed`, 4000)
    expect(result.length).toBeLessThan(4050)
    expect(result).toContain('FFmpeg started')
    expect(result).toContain('[TRUNCATED]')
    expect(result).toContain('encoder failed')
  })

  it('writes structured records through the existing console-to-file transport', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logGeneration(
      'subtitle_export_warning',
      { batchId: 'batch', operationId: 'task', item: 2 },
      { stage: 'export' },
      new Error('EACCES'),
      'warn',
    )
    expect(warn).toHaveBeenCalledWith(
      '[Generation]',
      expect.objectContaining({
        event: 'subtitle_export_warning',
        batchId: 'batch',
        operationId: 'task',
        item: 2,
        error: expect.objectContaining({ message: 'EACCES' }),
      }),
    )
  })

  it('never throws if the transport or an error getter fails', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {
      throw new Error('transport failed')
    })
    expect(() => logGeneration('failed', {}, {}, new Error('failed'), 'error')).not.toThrow()
    const error = Object.defineProperty({}, 'message', {
      get() {
        throw new Error('bad getter')
      },
    })
    expect(() => logGeneration('failed', {}, {}, error, 'error')).not.toThrow()
  })
})
