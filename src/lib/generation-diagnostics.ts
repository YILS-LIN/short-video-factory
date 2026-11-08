export interface GenerationLogContext {
  batchId?: string
  operationId?: string
  item?: number
  total?: number
}

export function redactDiagnosticText(text: string, limit = 2000): string {
  const clean = text
    .replace(/\b(Bearer|Basic)\s+[\w.+/=-]+/gi, '$1 [REDACTED]')
    .replace(/\bsk-[\w-]+/g, '[REDACTED]')
    .replace(
      /(["']?(?:api[-_]?key|authorization|token|password|secret)["']?\s*[:=]\s*)(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
      '$1[REDACTED]',
    )
    .replace(/https?:\/\/[^\s<>"']+/gi, '[URL]')
    .replace(/(?:[A-Za-z]:[\\/]|\/(?:Users|home|private|tmp|var|Volumes)\/)[^\s"'<>]*/g, '[PATH]')
    .replace(
      /("(?:prompt|messages|input|text|body|requestBody|responseBody)"\s*:\s*)(?:"(?:\\.|[^"\\])*"|\[[\s\S]*\]|\{[\s\S]*\})/gi,
      '$1"[REDACTED]"',
    )
    .replace(/((?:request|response)\s*(?:body|payload)\s*[:=])[^\n]*/gi, '$1 [REDACTED]')
  return clean.length > limit
    ? `${clean.slice(0, Math.floor(limit / 2))}\n[TRUNCATED]\n${clean.slice(-Math.floor(limit / 2))}`
    : clean
}

// Only extract diagnostic fields: never serialize request/response bodies or provider config.
export function diagnosticError(error: unknown, depth = 0): Record<string, unknown> {
  if (depth >= 3) return { message: '[CAUSE LIMIT]' }
  if (typeof error === 'string') return { message: redactDiagnosticText(error) }
  if (!error || typeof error !== 'object') return { message: String(error) }
  const value = error as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const key of [
    'name',
    'message',
    'code',
    'signal',
    'status',
    'statusCode',
    'errno',
    'syscall',
    'stack',
  ]) {
    const field = value[key]
    if (typeof field === 'string')
      result[key] = redactDiagnosticText(field, key === 'stack' ? 3000 : 2000)
    else if (typeof field === 'number') result[key] = field
  }
  if (value.cause !== undefined) result.cause = diagnosticError(value.cause, depth + 1)
  else if (value.error !== undefined) result.cause = diagnosticError(value.error, depth + 1)
  return Object.keys(result).length ? result : { message: 'Unknown error object' }
}

export function logGeneration(
  event: string,
  context: GenerationLogContext,
  details: Record<string, string | number | boolean | undefined> = {},
  error?: unknown,
  level: 'info' | 'warn' | 'error' = 'info',
): void {
  try {
    console[level]('[Generation]', {
      event,
      ...context,
      ...details,
      ...(error === undefined ? {} : { error: diagnosticError(error) }),
    })
  } catch {
    // Diagnostics must never change task execution, even for malformed error objects.
  }
}
