export interface LLMConfig {
  modelName: string
  apiUrl: string
  apiKey: string
}

export interface LLMProviderPreset {
  id: string
  label: string
  modelName: string
  apiUrl: string
}

export const LLM_PROVIDER_PRESETS = [
  {
    id: 'atlascloud',
    label: 'Atlas Cloud',
    modelName: 'qwen/qwen3.5-flash',
    apiUrl: 'https://api.atlascloud.ai/v1',
  },
] as const satisfies readonly LLMProviderPreset[]

export const applyLLMProviderPreset = (
  config: LLMConfig,
  preset: Pick<LLMProviderPreset, 'modelName' | 'apiUrl'>,
): LLMConfig => ({
  ...config,
  modelName: preset.modelName,
  apiUrl: preset.apiUrl,
})
