import { normalizeLlmConfig } from './config'
import type { LlmConfig } from './types'

export interface ProviderProfile {
  id: string
  name: string
  config: LlmConfig
  models: string[]
}

export function normalizeModelIds(values: unknown): string[] {
  if (!Array.isArray(values)) return []
  return [
    ...new Set(
      values
        .filter((id): id is string => typeof id === 'string')
        .map((id) => id.trim())
        .filter(Boolean),
    ),
  ]
}

export function normalizeProviderProfile(profile: ProviderProfile): ProviderProfile {
  const config = normalizeLlmConfig(profile.config)
  const models = normalizeModelIds([...normalizeModelIds(profile.models), config.modelName])
  return {
    id: profile.id,
    name: typeof profile.name === 'string' ? profile.name.trim() : '',
    config: { ...config, modelName: config.modelName || models[0] || '' },
    models,
  }
}

export function normalizeProviderProfiles(value: unknown): ProviderProfile[] {
  if (!Array.isArray(value)) return []
  const ids = new Set<string>()
  return value.flatMap((profile) => {
    if (!profile || typeof profile.id !== 'string' || !profile.id || ids.has(profile.id)) return []
    ids.add(profile.id)
    return [normalizeProviderProfile(profile)]
  })
}
