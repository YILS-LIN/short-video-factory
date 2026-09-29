import { getSystemPrompt, buildPrompt } from './prompts'
import { generateCopywriting, type GenerateCopywritingOptions } from './generate'
import { creativeStrategies, buildDiversityInstructions } from './diversity'
import { assessSimilarity } from './similarity'
import type { CopywritingConfig, GenerationResult, LlmConfig } from './types'
import {
  getCopywritingHistory,
  getCopywritingTaskId,
  saveCopywritingHistory,
  takeNextCreativeStrategy,
} from '@/store/copywriting-history'

export type GenerationPhase = 'drafting' | 'checking' | 'rewriting'

export interface GenerateDiverseCopywritingOptions
  extends Omit<GenerateCopywritingOptions, 'llmConfig' | 'copywritingConfig'> {
  llmConfig: LlmConfig
  copywritingConfig: CopywritingConfig
  onPhase?: (phase: GenerationPhase) => void
}

const asReferences = (entries: ReturnType<typeof getCopywritingHistory>) =>
  entries.map(({ id, text, complete }) => ({ id, text, complete }))

const buildDiverseRequest = (
  options: GenerateDiverseCopywritingOptions,
  taskId: string,
  strategyId?: string,
  previousDraft?: string,
) => {
  const strategy = creativeStrategies.find(({ id }) => id === strategyId)
  if (!strategy) throw new Error('Creative strategy was not found')
  const history = getCopywritingHistory(taskId)
  const baseInstructions = getSystemPrompt(options.copywritingConfig)
  const diversityInstructions = buildDiversityInstructions(
    strategy,
    history.map(({ text, strategyId: usedStrategy }) => ({ text, strategyId: usedStrategy })),
    previousDraft,
  )
  const input = buildPrompt(
    options.prompt,
    [baseInstructions, diversityInstructions].filter(Boolean).join('\n\n'),
    options.llmConfig.instructionDelivery,
  )
  return { input, history, strategy }
}

export async function generateDiverseCopywriting(
  options: GenerateDiverseCopywritingOptions,
): Promise<GenerationResult> {
  const { llmConfig, copywritingConfig, prompt, abortSignal, onTextDelta, onPhase } = options
  if (!copywritingConfig.diversityEnabled)
    return generateCopywriting({ llmConfig, copywritingConfig, prompt, abortSignal, onTextDelta })
  if (abortSignal.aborted) return { text: '', status: 'cancelled' }

  const baseInstructions = getSystemPrompt(copywritingConfig)
  const taskId = getCopywritingTaskId({
    request: prompt,
    systemPromptMode: copywritingConfig.systemPromptMode,
    systemPrompt: baseInstructions,
  })
  const firstStrategy = takeNextCreativeStrategy(taskId, creativeStrategies)
  const firstRequest = buildDiverseRequest(options, taskId, firstStrategy.id)
  const firstController = new AbortController()
  let timedOut = false
  const relayAbort = () => firstController.abort()
  if (abortSignal.aborted) relayAbort()
  else abortSignal.addEventListener('abort', relayAbort, { once: true })
  const timeoutId = globalThis.setTimeout(() => {
    timedOut = true
    firstController.abort()
  }, llmConfig.timeoutSeconds * 1000)
  const startTime = Date.now()

  try {
    onPhase?.('drafting')
    const first = await generateCopywriting({
      llmConfig,
      copywritingConfig,
      prompt: firstRequest.input.prompt,
      preparedInput: firstRequest.input,
      abortSignal: firstController.signal,
      onTextDelta,
    })

    if (first.status !== 'completed') {
      if (timedOut) throw new Error(`Request timed out after ${llmConfig.timeoutSeconds} seconds`)
      return first
    }
    if (abortSignal.aborted) return { ...first, status: 'cancelled' }

    onPhase?.('checking')
    if (abortSignal.aborted) return { ...first, status: 'cancelled' }
    const references = asReferences(firstRequest.history)
    const firstAssessment = assessSimilarity(first.text, references)
    let selected = first
    let selectedStrategyId = firstStrategy.id
    let similarityWarning = firstAssessment.highlySimilar
    let rewriteFailed = false

    if (firstAssessment.highlySimilar && copywritingConfig.rewriteOnSimilarity) {
      const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
      const remainingSeconds = llmConfig.timeoutSeconds - elapsedSeconds
      if (!abortSignal.aborted && remainingSeconds >= 1) {
        let rewriteStrategy = takeNextCreativeStrategy(taskId, creativeStrategies)
        if (rewriteStrategy.id === firstStrategy.id)
          rewriteStrategy = takeNextCreativeStrategy(taskId, creativeStrategies)
        const rewriteRequest = buildDiverseRequest(options, taskId, rewriteStrategy.id, first.text)
        onPhase?.('rewriting')
        try {
          const rewrite = await generateCopywriting({
            llmConfig: { ...llmConfig, timeoutSeconds: remainingSeconds },
            copywritingConfig,
            prompt: rewriteRequest.input.prompt,
            preparedInput: rewriteRequest.input,
            abortSignal: firstController.signal,
          })
          if (abortSignal.aborted || firstController.signal.aborted) {
            if (timedOut) {
              saveCopywritingHistory(taskId, first.text, firstStrategy.id)
              return {
                ...first,
                similarityWarning: true,
                rewriteFailed: true,
              }
            }
            return { ...first, status: 'cancelled' }
          }
          if (rewrite.status === 'completed') {
            const rewriteAssessment = assessSimilarity(rewrite.text, references)
            if (rewriteAssessment.score < firstAssessment.score) {
              selected = rewrite
              selectedStrategyId = rewriteStrategy.id
            }
            similarityWarning = assessSimilarity(selected.text, references).highlySimilar
          } else {
            similarityWarning = true
            rewriteFailed = true
          }
        } catch {
          if (abortSignal.aborted) return { ...first, status: 'cancelled' }
          similarityWarning = true
          rewriteFailed = true
          const elapsed = Date.now() - startTime
          if (timedOut || elapsed >= llmConfig.timeoutSeconds * 1000) {
            saveCopywritingHistory(taskId, first.text, firstStrategy.id)
            return { ...first, similarityWarning: true, rewriteFailed: true }
          }
        }
      } else rewriteFailed = true
    }

    if (abortSignal.aborted) return { ...first, status: 'cancelled' }
    saveCopywritingHistory(taskId, selected.text, selectedStrategyId)
    return { ...selected, similarityWarning, rewriteFailed }
  } finally {
    globalThis.clearTimeout(timeoutId)
    abortSignal.removeEventListener('abort', relayAbort)
  }
}
