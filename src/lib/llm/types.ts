export type LlmProtocol =
  | 'openai-compatible'
  | 'openai-chat'
  | 'openai-responses'
  | 'anthropic-messages'

export type AnthropicAuthMode = 'api-key' | 'bearer'
export type InstructionDelivery = 'standard' | 'user-message'
export type SystemPromptMode = 'builtin' | 'custom' | 'off'
export type RequestUrlIssue = 'invalid' | 'full-endpoint'
export type CustomHeaderIssue =
  | 'invalid-name'
  | 'invalid-value'
  | 'protected-name'
  | 'duplicate-name'
export type LlmConfigIssue =
  | 'api-url-required'
  | 'model-name-required'
  | 'invalid-api-url'
  | 'full-endpoint-api-url'
  | 'invalid-protocol'
  | 'invalid-timeout'
  | 'invalid-max-output-tokens'
  | 'invalid-temperature'
  | 'invalid-top-p'
  | CustomHeaderIssue

export type CopywritingStatus =
  | 'idle'
  | 'generating'
  | 'completed'
  | 'cancelled'
  | 'failed'
  | 'truncated'
  | 'edited'

export interface CustomHeader {
  name: string
  value: string
}

export interface LlmConfig {
  protocol: LlmProtocol
  apiUrl: string
  apiKey: string
  modelName: string
  timeoutSeconds: number
  maxOutputTokens?: number
  temperature?: number
  topP?: number
  anthropicAuthMode: AnthropicAuthMode
  instructionDelivery: InstructionDelivery
  customHeaders: CustomHeader[]
}

export interface CopywritingConfig {
  systemPromptMode: SystemPromptMode
  customSystemPrompt: string
  diversityEnabled?: boolean
  rewriteOnSimilarity?: boolean
}

export interface GenerationResult {
  text: string
  status: Extract<CopywritingStatus, 'completed' | 'cancelled' | 'failed' | 'truncated'>
  finishReason?: string
  similarityWarning?: boolean
  rewriteFailed?: boolean
}
