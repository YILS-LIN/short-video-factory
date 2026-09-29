import type { CopywritingConfig, CustomHeader, CustomHeaderIssue, LlmConfig } from './types'
import type { LlmConfigIssue } from './types'
import { getRequestUrlIssue } from './providers'

export const defaultLlmConfig = (): LlmConfig => ({
  protocol: 'openai-compatible',
  apiUrl: '',
  apiKey: '',
  modelName: '',
  timeoutSeconds: 120,
  anthropicAuthMode: 'api-key',
  instructionDelivery: 'standard',
  customHeaders: [],
})

export const defaultCopywritingConfig = (): CopywritingConfig => ({
  systemPromptMode: 'builtin',
  customSystemPrompt: '',
  diversityEnabled: false,
  rewriteOnSimilarity: true,
})

const protocols = new Set<LlmConfig['protocol']>([
  'openai-compatible',
  'openai-chat',
  'openai-responses',
  'anthropic-messages',
])

export const protectedHeaderNames = new Set([
  'accept',
  'anthropic-version',
  'authorization',
  'content-length',
  'content-type',
  'host',
  'user-agent',
  'x-api-key',
])

const headerNamePattern = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/
const headerValuePattern = /^[\t\x20-\x7E\x80-\xFF]*$/

export const isValidCustomHeaderName = (name: string) => headerNamePattern.test(name.trim())
export const isValidCustomHeaderValue = (value: string) => headerValuePattern.test(value)

const isHeader = (value: unknown): value is CustomHeader => {
  if (!value || typeof value !== 'object') return false
  const header = value as CustomHeader
  return (
    typeof header.name === 'string' && header.name.trim() !== '' && typeof header.value === 'string'
  )
}

export function normalizeLlmConfig(value: unknown): LlmConfig {
  const defaults = defaultLlmConfig()
  const config = value && typeof value === 'object' ? (value as Partial<LlmConfig>) : {}
  const isLegacy = !('protocol' in config)
  const headers = Array.isArray(config.customHeaders) ? config.customHeaders.filter(isHeader) : []
  const usedNames = new Set<string>()
  const customHeaders = headers.reduce<CustomHeader[]>((result, header) => {
    const name = header.name.trim()
    const normalizedName = name.toLowerCase()
    if (
      !isValidCustomHeaderName(name) ||
      !isValidCustomHeaderValue(header.value) ||
      protectedHeaderNames.has(normalizedName) ||
      usedNames.has(normalizedName)
    )
      return result
    usedNames.add(normalizedName)
    result.push({ name, value: header.value })
    return result
  }, [])

  return {
    ...defaults,
    protocol: protocols.has(config.protocol as LlmConfig['protocol'])
      ? (config.protocol as LlmConfig['protocol'])
      : isLegacy
        ? 'openai-chat'
        : defaults.protocol,
    apiUrl: typeof config.apiUrl === 'string' ? config.apiUrl.trim() : '',
    apiKey: typeof config.apiKey === 'string' ? config.apiKey : '',
    modelName: typeof config.modelName === 'string' ? config.modelName.trim() : '',
    timeoutSeconds:
      Number.isInteger(config.timeoutSeconds) && (config.timeoutSeconds ?? 0) > 0
        ? config.timeoutSeconds!
        : defaults.timeoutSeconds,
    maxOutputTokens:
      Number.isInteger(config.maxOutputTokens) && (config.maxOutputTokens ?? 0) > 0
        ? config.maxOutputTokens
        : undefined,
    temperature:
      typeof config.temperature === 'number' && Number.isFinite(config.temperature)
        ? config.temperature
        : undefined,
    topP: typeof config.topP === 'number' && Number.isFinite(config.topP) ? config.topP : undefined,
    anthropicAuthMode: config.anthropicAuthMode === 'bearer' ? 'bearer' : 'api-key',
    instructionDelivery:
      config.instructionDelivery === 'user-message' ? 'user-message' : 'standard',
    customHeaders,
  }
}

export function getCustomHeaderIssue(headers: unknown): CustomHeaderIssue | undefined {
  if (!Array.isArray(headers)) return headers == null ? undefined : 'invalid-name'
  const usedNames = new Set<string>()
  for (const value of headers) {
    if (!isHeader(value)) return 'invalid-name'
    const header: CustomHeader = value
    const name = header.name.trim()
    const normalizedName = name.toLowerCase()
    if (!isValidCustomHeaderName(name)) return 'invalid-name'
    if (!isValidCustomHeaderValue(header.value)) return 'invalid-value'
    if (protectedHeaderNames.has(normalizedName)) return 'protected-name'
    if (usedNames.has(normalizedName)) return 'duplicate-name'
    usedNames.add(normalizedName)
  }
  return undefined
}

export function getLlmConfigIssue(value: unknown): LlmConfigIssue | undefined {
  if (!value || typeof value !== 'object') return 'api-url-required'
  const config = value as Partial<LlmConfig>
  if (typeof config.apiUrl !== 'string' || !config.apiUrl.trim()) return 'api-url-required'
  if (typeof config.modelName !== 'string' || !config.modelName.trim()) return 'model-name-required'
  if (!protocols.has(config.protocol as LlmConfig['protocol'])) return 'invalid-protocol'

  const normalizedConfig = normalizeLlmConfig(config)
  const requestUrlIssue = getRequestUrlIssue(normalizedConfig)
  if (requestUrlIssue === 'invalid') return 'invalid-api-url'
  if (requestUrlIssue === 'full-endpoint') return 'full-endpoint-api-url'

  if (!Number.isInteger(config.timeoutSeconds) || (config.timeoutSeconds ?? 0) < 1)
    return 'invalid-timeout'

  const maxOutputTokens = config.maxOutputTokens as unknown
  if (
    maxOutputTokens !== undefined &&
    maxOutputTokens !== null &&
    maxOutputTokens !== '' &&
    (!Number.isInteger(maxOutputTokens) || (maxOutputTokens as number) < 1)
  )
    return 'invalid-max-output-tokens'

  const temperature = config.temperature as unknown
  if (
    temperature !== undefined &&
    temperature !== null &&
    temperature !== '' &&
    (typeof temperature !== 'number' ||
      !Number.isFinite(temperature) ||
      temperature < 0 ||
      temperature > 2)
  )
    return 'invalid-temperature'

  const topP = config.topP as unknown
  if (
    topP !== undefined &&
    topP !== null &&
    topP !== '' &&
    (typeof topP !== 'number' || !Number.isFinite(topP) || topP < 0 || topP > 1)
  )
    return 'invalid-top-p'

  return getCustomHeaderIssue(config.customHeaders)
}

export function normalizeCopywritingConfig(value: unknown): CopywritingConfig {
  const config = value && typeof value === 'object' ? (value as Partial<CopywritingConfig>) : {}
  return {
    systemPromptMode: ['builtin', 'custom', 'off'].includes(config.systemPromptMode ?? '')
      ? (config.systemPromptMode as CopywritingConfig['systemPromptMode'])
      : 'builtin',
    customSystemPrompt:
      typeof config.customSystemPrompt === 'string' ? config.customSystemPrompt : '',
    diversityEnabled: config.diversityEnabled === true,
    rewriteOnSimilarity: config.rewriteOnSimilarity !== false,
  }
}
