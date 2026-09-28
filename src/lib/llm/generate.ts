import { streamText } from 'ai'
import { getLlmConfigIssue } from './config'
import { buildPrompt, cleanGeneratedText, getSystemPrompt } from './prompts.ts'
import { createLanguageModel } from './providers.ts'
import type { CopywritingConfig, GenerationResult, LlmConfig } from './types'

export interface GenerateCopywritingOptions {
  llmConfig: LlmConfig
  copywritingConfig: CopywritingConfig
  prompt: string
  abortSignal: AbortSignal
  onTextDelta?: (text: string) => void
}

const isAbortError = (error: unknown) => (error as { name?: string })?.name === 'AbortError'
const handledAbortReasons = new WeakSet<object>()

if (typeof globalThis.addEventListener === 'function') {
  globalThis.addEventListener('unhandledrejection', (event) => {
    // Chromium 108 can surface the fetch-body rejection for a cancelled SDK stream after it has
    // already emitted its abort part. Ignore only the exact reason from this request's controller.
    if (
      typeof event.reason === 'object' &&
      event.reason !== null &&
      handledAbortReasons.has(event.reason)
    )
      event.preventDefault()
  })
}

const getStatus = (text: string, finishReason: string | undefined): GenerationResult['status'] => {
  if (!text) return 'failed'
  if (finishReason === 'stop') return 'completed'
  if (finishReason === 'error') return 'failed'
  return 'truncated'
}

export async function generateCopywriting(
  options: GenerateCopywritingOptions,
): Promise<GenerationResult> {
  const { llmConfig, copywritingConfig, prompt, abortSignal, onTextDelta } = options
  const configIssue = getLlmConfigIssue(llmConfig)
  if (configIssue) throw new Error(`Invalid model configuration: ${configIssue}`)
  const instructions = getSystemPrompt(copywritingConfig)
  const input = buildPrompt(prompt, instructions, llmConfig.instructionDelivery)
  const model = createLanguageModel(llmConfig)
  const maxOutputTokens =
    llmConfig.maxOutputTokens ?? (llmConfig.protocol === 'anthropic-messages' ? 4096 : undefined)
  const requestController = new AbortController()
  let terminationReason: 'cancelled' | 'timeout' | undefined
  const terminate = (reason: 'cancelled' | 'timeout') => {
    if (terminationReason) return
    terminationReason = reason
    requestController.abort()
    const abortReason = requestController.signal.reason
    if (typeof abortReason === 'object' && abortReason !== null)
      handledAbortReasons.add(abortReason)
  }
  const handleAbort = () => terminate('cancelled')
  if (abortSignal.aborted) {
    handleAbort()
  } else {
    abortSignal.addEventListener('abort', handleAbort, { once: true })
  }
  const timeoutId = globalThis.setTimeout(() => {
    terminate('timeout')
  }, llmConfig.timeoutSeconds * 1000)
  const signal = requestController.signal
  let text = ''
  let finishReason: string | undefined
  let rawFinishReason: string | undefined

  try {
    const result = streamText({
      model,
      ...input,
      abortSignal: signal,
      maxRetries: 2,
      onError: () => undefined,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
    })
    for await (const part of result.stream) {
      if (part.type === 'text-delta') {
        text += part.text
        onTextDelta?.(part.text)
      }
      if (part.type === 'error') throw part.error
      if (part.type === 'abort') {
        if (terminationReason === 'timeout')
          throw new Error(`Request timed out after ${llmConfig.timeoutSeconds} seconds`)
        if (terminationReason === 'cancelled') {
          continue
        }
        throw new Error(part.reason || 'The model stream was aborted unexpectedly')
      }
      if (part.type === 'finish') {
        finishReason = part.finishReason
        rawFinishReason = part.rawFinishReason
      }
    }
    if (terminationReason === 'timeout')
      throw new Error(`Request timed out after ${llmConfig.timeoutSeconds} seconds`)
    if (terminationReason === 'cancelled')
      return { text: cleanGeneratedText(text), status: 'cancelled' }
    finishReason ??= await result.finishReason
    rawFinishReason ??= await result.rawFinishReason
    text = cleanGeneratedText(text)
    return {
      text,
      finishReason: rawFinishReason ?? finishReason,
      status: getStatus(text, finishReason),
    }
  } catch (error) {
    if (terminationReason === 'timeout') {
      throw new Error(`Request timed out after ${llmConfig.timeoutSeconds} seconds`)
    }
    if (
      terminationReason === 'cancelled' &&
      (isAbortError(error) || signal.aborted || abortSignal.aborted)
    ) {
      return { text: cleanGeneratedText(text), status: 'cancelled' }
    }
    throw error
  } finally {
    globalThis.clearTimeout(timeoutId)
    abortSignal.removeEventListener('abort', handleAbort)
  }
}
