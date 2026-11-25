import { getCustomHeaderIssue } from './config'
import { normalizeModelIds } from './provider-profiles'
import { getRequestUrlIssue } from './providers'
import type { LlmConfig } from './types'

export async function discoverProviderModels(config: LlmConfig, signal: AbortSignal) {
  if (
    !config.apiUrl?.trim() ||
    getRequestUrlIssue(config) ||
    getCustomHeaderIssue(config.customHeaders)
  ) {
    throw new Error('Invalid model catalog configuration')
  }
  const headers = new Headers()
  for (const { name, value } of config.customHeaders) headers.set(name.trim(), value)
  if (config.protocol === 'anthropic-messages') {
    headers.set('anthropic-version', '2023-06-01')
    if (config.apiKey && config.anthropicAuthMode === 'api-key')
      headers.set('x-api-key', config.apiKey)
  }
  if (config.apiKey && !headers.has('x-api-key'))
    headers.set('Authorization', `Bearer ${config.apiKey}`)

  const url = `${config.apiUrl.trim().replace(/\/+$/, '')}/models`
  const response = await fetch(url, { headers, signal, redirect: 'error', credentials: 'omit' })
  if (!response.ok) throw new Error('Model catalog request failed')
  const payload = await response.json()
  if (!Array.isArray(payload?.data)) throw new Error('Invalid model catalog response')
  return normalizeModelIds(payload.data.map((model: { id?: unknown } | null) => model?.id))
}
