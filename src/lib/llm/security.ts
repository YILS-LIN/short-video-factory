import type { LlmConfig } from './types'

const redactedValue = '[REDACTED]'

const replaceAll = (text: string, value: string, replacement: string) =>
  value ? text.split(value).join(replacement) : text

const getSensitiveValueVariants = (value: string) => {
  const variants = new Set([value])
  try {
    const encoded = encodeURIComponent(value)
    variants.add(encoded)
    variants.add(encoded.replace(/%[\da-f]{2}/gi, (escape) => escape.toUpperCase()))
    variants.add(encoded.replace(/%[\da-f]{2}/gi, (escape) => escape.toLowerCase()))
  } catch {
    // Keep the original value if it contains a malformed surrogate pair.
  }
  return [...variants]
}

export function redactSensitiveText(
  text: string,
  config?: Pick<LlmConfig, 'apiKey' | 'customHeaders'>,
) {
  const sensitiveValues = [
    config?.apiKey,
    ...(config?.customHeaders ?? []).map((header) => header.value),
  ]
    .filter((value): value is string => Boolean(value))
    .flatMap(getSensitiveValueVariants)
    .sort((left, right) => right.length - left.length)

  const redactedText = text
    .replace(
      /((?:"?(?:authorization|proxy-authorization)"?)\s*[:=]\s*"?\s*bearer\s+)(?!\[REDACTED\])[^"'\\\s,;}\]]+/gi,
      `$1${redactedValue}`,
    )
    .replace(
      /((?:"?(?:authorization|proxy-authorization)"?)\s*[:=]\s*"?\s*)(?!bearer\b)(?!\[REDACTED\])[^"'\\\s,;}\]]+/gi,
      `$1${redactedValue}`,
    )
    .replace(
      /((?:"?(?:x-api-key|api[-_ ]?key|access[-_ ]?token|auth[-_ ]?token|token)"?)\s*[:=]\s*"?)(?!\[REDACTED\])[^"'\\\s,;}\]]+/gi,
      `$1${redactedValue}`,
    )
    .replace(
      /([?&](?:api[-_]?key|access[-_]?token|auth[-_]?token|token|key)=)[^&#\s"'\\]+/gi,
      `$1${redactedValue}`,
    )

  return sensitiveValues.reduce(
    (result, value) => replaceAll(result, value, redactedValue),
    redactedText,
  )
}

export function getErrorDetail(
  error: unknown,
  config?: Pick<LlmConfig, 'apiKey' | 'customHeaders'>,
) {
  const message =
    error instanceof Error
      ? error.message || error.name
      : typeof error === 'object' && error !== null && 'message' in error
        ? String((error as { message?: unknown }).message)
        : String(error)
  return redactSensitiveText(message, config)
}
