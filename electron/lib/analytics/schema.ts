import type { AnalyticsEventName, AnalyticsScalar } from '../../analytics-types'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const eventKeys: Record<AnalyticsEventName, readonly string[]> = {
  installation_first_seen: [],
  app_started: [],
  app_ready: [],
  app_active: [],
  activation_completed: [
    'operation_id',
    'trigger',
    'elapsed_since_first_seen_ms',
    'active_before_success_ms',
    'attempts_before_success',
    'failed_attempts_before_success',
    'time_to_value_bucket',
  ],
  repeat_generation_completed: ['operation_id', 'trigger'],
  video_generation_blocked: ['operation_id', 'trigger', 'batch_id', 'blocked_reason'],
  video_generation_started: [
    'operation_id',
    'trigger',
    'batch_id',
    'has_bgm',
    'has_subtitles',
    'resolution_bucket',
    'aspect_ratio',
  ],
  video_generation_succeeded: [
    'operation_id',
    'trigger',
    'batch_id',
    'duration_ms',
    'text_duration_ms',
    'tts_duration_ms',
    'media_duration_ms',
    'export_duration_ms',
    'text_source',
    'text_entered',
    'tts_entered',
    'media_entered',
    'export_entered',
    'llm_call_count',
    'input_tokens',
    'output_tokens',
    'llm_usage_complete',
    'tts_characters',
    'audio_duration_ms',
    'resolution_bucket',
    'aspect_ratio',
    'has_bgm',
    'has_subtitles',
    'has_effects',
    'provider_category',
    'protocol',
  ],
  video_generation_failed: [
    'operation_id',
    'trigger',
    'batch_id',
    'duration_ms',
    'text_duration_ms',
    'tts_duration_ms',
    'media_duration_ms',
    'export_duration_ms',
    'failed_stage',
    'error_code',
    'text_entered',
    'tts_entered',
    'media_entered',
    'export_entered',
    'llm_call_count',
    'input_tokens',
    'output_tokens',
    'llm_usage_complete',
    'tts_characters',
    'audio_duration_ms',
    'text_source',
    'provider_category',
    'protocol',
    'resolution_bucket',
    'aspect_ratio',
    'has_bgm',
    'has_subtitles',
  ],
  video_generation_cancelled: [
    'operation_id',
    'trigger',
    'batch_id',
    'duration_ms',
    'failed_stage',
    'text_entered',
    'tts_entered',
    'media_entered',
    'export_entered',
    'llm_call_count',
    'input_tokens',
    'output_tokens',
    'llm_usage_complete',
    'tts_characters',
    'audio_duration_ms',
    'text_source',
    'provider_category',
    'protocol',
    'resolution_bucket',
    'aspect_ratio',
  ],
  text_generation_finished: [
    'operation_id',
    'outcome',
    'duration_ms',
    'provider_category',
    'protocol',
    'llm_call_count',
    'input_tokens',
    'output_tokens',
    'llm_usage_complete',
    'text_length_bucket',
    'error_code',
  ],
  tts_preview_finished: [
    'operation_id',
    'outcome',
    'duration_ms',
    'tts_characters',
    'audio_duration_ms',
    'error_code',
  ],
  tts_generation_finished: [
    'operation_id',
    'outcome',
    'duration_ms',
    'tts_characters',
    'audio_duration_ms',
    'with_captions',
    'error_code',
  ],
  batch_started: ['batch_id'],
  batch_finished: [
    'batch_id',
    'completed_count',
    'failed_count',
    'cancelled_count',
    'duration_ms',
    'stop_reason',
  ],
  provider_test_finished: [
    'operation_id',
    'outcome',
    'protocol',
    'provider_category',
    'error_code',
    'duration_ms',
    'llm_call_count',
    'input_tokens',
    'output_tokens',
    'llm_usage_complete',
  ],
  update_check_finished: ['outcome', 'has_update', 'trigger', 'duration_ms'],
  media_import_finished: ['outcome', 'media_type', 'count_bucket'],
}

const allowedValues: Record<string, readonly string[]> = {
  trigger: ['manual', 'batch', 'pipeline'],
  time_to_value_bucket: ['<3m', '3–10m', '10–30m', '30–60m', '≥60m'],
  blocked_reason: [
    'output_name_missing',
    'output_path_missing',
    'output_size_invalid',
    'bgm_unavailable',
    'llm_config_invalid',
    'text_missing',
    'media_unavailable',
  ],
  resolution_bucket: ['720p', '1080p', '4k', 'custom'],
  aspect_ratio: ['portrait', 'landscape', 'square', 'custom'],
  text_source: ['generated', 'edited', 'reused', 'unknown'],
  failed_stage: ['preflight', 'text', 'tts', 'media', 'export'],
  error_code: [
    'configuration_missing',
    'network_timeout',
    'network_unreachable',
    'authentication_failed',
    'rate_limited',
    'provider_error',
    'invalid_response',
    'empty_output',
    'tts_invalid_audio',
    'media_unavailable',
    'permission_denied',
    'disk_full',
    'ffmpeg_failed',
    'unknown',
  ],
  outcome: ['success', 'failed', 'cancelled'],
  provider_category: ['openai', 'anthropic', 'compatible', 'custom', 'unknown'],
  protocol: ['openai-compatible', 'openai-chat', 'openai-responses', 'anthropic-messages'],
  text_length_bucket: ['<100', '100–499', '500–999', '1000–1999', '≥2000'],
  stop_reason: ['completed', 'user_cancelled', 'generation_failed', 'unknown'],
  media_type: ['video', 'image', 'audio', 'mixed', 'unknown'],
  count_bucket: ['0', '1', '2–5', '6–20', '21+'],
}

const booleanKeys = new Set([
  'has_bgm',
  'has_subtitles',
  'has_effects',
  'text_entered',
  'tts_entered',
  'media_entered',
  'export_entered',
  'llm_usage_complete',
  'with_captions',
  'has_update',
])

const numericKeys = new Set([
  'elapsed_since_first_seen_ms',
  'active_before_success_ms',
  'attempts_before_success',
  'failed_attempts_before_success',
  'duration_ms',
  'text_duration_ms',
  'tts_duration_ms',
  'media_duration_ms',
  'export_duration_ms',
  'llm_call_count',
  'input_tokens',
  'output_tokens',
  'tts_characters',
  'audio_duration_ms',
  'completed_count',
  'failed_count',
  'cancelled_count',
])

const freeStringKeys = new Set(['operation_id', 'batch_id'])

export function sanitizeAnalyticsData(
  event: AnalyticsEventName,
  input?: Record<string, unknown>,
): Record<string, AnalyticsScalar> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return {}
  const allowed = new Set(eventKeys[event])
  const output: Record<string, AnalyticsScalar> = {}

  for (const [key, value] of Object.entries(input)) {
    if (!allowed.has(key)) continue

    if (booleanKeys.has(key) && typeof value === 'boolean') {
      output[key] = value
      continue
    }

    const maxNumber =
      key === 'elapsed_since_first_seen_ms' || key === 'active_before_success_ms'
        ? 315_360_000_000
        : 2_592_000_000
    if (
      numericKeys.has(key) &&
      typeof value === 'number' &&
      Number.isSafeInteger(value) &&
      value >= 0 &&
      value <= maxNumber
    ) {
      output[key] = value
      continue
    }

    if (typeof value !== 'string' || value.length > 80) continue

    const enumValues = allowedValues[key]
    if (enumValues?.includes(value)) {
      output[key] = value
      continue
    }

    if (freeStringKeys.has(key) && UUID_PATTERN.test(value)) output[key] = value
  }

  return output
}

export function isAnalyticsEventName(value: unknown): value is AnalyticsEventName {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(eventKeys, value)
}
