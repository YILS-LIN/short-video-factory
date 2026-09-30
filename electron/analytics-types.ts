export type AnalyticsEventName =
  | 'installation_first_seen'
  | 'app_started'
  | 'app_ready'
  | 'app_active'
  | 'activation_completed'
  | 'repeat_generation_completed'
  | 'video_generation_blocked'
  | 'video_generation_started'
  | 'video_generation_succeeded'
  | 'video_generation_failed'
  | 'video_generation_cancelled'
  | 'text_generation_finished'
  | 'tts_preview_finished'
  | 'tts_generation_finished'
  | 'batch_started'
  | 'batch_finished'
  | 'provider_test_finished'
  | 'update_check_finished'
  | 'media_import_finished'

export type AnalyticsScalar = string | number | boolean

export interface AnalyticsTrackParams {
  event: AnalyticsEventName
  data?: Record<string, AnalyticsScalar>
}

export interface AnalyticsContextParams {
  title: string
  locale: string
}

export interface GenerationUsageSummary {
  source: 'generated' | 'edited' | 'reused' | 'unknown'
  protocol?: 'openai-compatible' | 'openai-chat' | 'openai-responses' | 'anthropic-messages'
  providerCategory: 'openai' | 'anthropic' | 'compatible' | 'custom' | 'unknown'
  callCount: number
  inputTokens?: number
  outputTokens?: number
  usageComplete: boolean
}
