import { createAnthropic } from '@ai-sdk/anthropic'
import { createOpenAI } from '@ai-sdk/openai'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'
import type { LlmConfig, RequestUrlIssue } from './types'

const normalizeUrl = (url: unknown) =>
  typeof url === 'string' ? url.trim().replace(/\/+$/, '') : ''

const knownEndpointPaths = ['/chat/completions', '/responses', '/messages']

const getEndpointPath = (config: LlmConfig) => {
  if (config.protocol === 'anthropic-messages') return '/messages'
  if (config.protocol === 'openai-responses') return '/responses'
  return '/chat/completions'
}

export function getRequestUrlIssue(config: LlmConfig): RequestUrlIssue | undefined {
  const baseUrl = normalizeUrl(config.apiUrl)
  if (!baseUrl) return undefined

  let parsedUrl: URL
  try {
    parsedUrl = new URL(baseUrl)
  } catch {
    return 'invalid'
  }

  if (
    !['http:', 'https:'].includes(parsedUrl.protocol) ||
    parsedUrl.search ||
    parsedUrl.hash ||
    parsedUrl.username ||
    parsedUrl.password
  )
    return 'invalid'

  const path = parsedUrl.pathname.replace(/\/+$/, '').toLowerCase()
  if (knownEndpointPaths.some((endpoint) => path === endpoint || path.endsWith(endpoint)))
    return 'full-endpoint'

  return undefined
}

export function getRequestUrlHint(config: LlmConfig): string {
  const baseUrl = normalizeUrl(config.apiUrl)
  if (!baseUrl) return ''
  if (getRequestUrlIssue(config)) return ''
  return `${baseUrl}${getEndpointPath(config)}`
}

export function createLanguageModel(config: LlmConfig): LanguageModel {
  const baseURL = normalizeUrl(config.apiUrl)
  const headers = Object.fromEntries(
    config.customHeaders.map(({ name, value }) => [name.trim(), value]),
  )

  switch (config.protocol) {
    case 'openai-compatible':
      return createOpenAICompatible({
        name: 'openai-compatible',
        baseURL,
        apiKey: config.apiKey || undefined,
        headers,
      }).chatModel(config.modelName)
    case 'openai-chat': {
      const provider = createOpenAI({
        baseURL,
        apiKey: config.apiKey || undefined,
        headers,
      })
      return provider.chat(config.modelName)
    }
    case 'openai-responses': {
      const provider = createOpenAI({
        baseURL,
        apiKey: config.apiKey || undefined,
        headers,
      })
      return provider.responses(config.modelName)
    }
    case 'anthropic-messages': {
      const provider = createAnthropic({
        baseURL,
        apiKey: config.anthropicAuthMode === 'api-key' ? config.apiKey || undefined : undefined,
        authToken: config.anthropicAuthMode === 'bearer' ? config.apiKey || undefined : undefined,
        headers,
      })
      return provider(config.modelName)
    }
  }
}
