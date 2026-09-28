import { generateCopywriting } from '../../src/lib/llm/generate'
import type { LlmConfig, LlmProtocol } from '../../src/lib/llm/types'

declare global {
  interface Window {
    llmElectronHarness: {
      electronVersion: string
      report: (result: { ok: boolean; details?: unknown; error?: string }) => void
    }
  }
}

const createConfig = (apiUrl: string, protocol: LlmProtocol): LlmConfig => ({
  protocol,
  apiUrl,
  apiKey: 'electron-test-key',
  modelName: 'electron-test-model',
  timeoutSeconds: 5,
  anthropicAuthMode: 'api-key',
  instructionDelivery: 'standard',
  customHeaders: [],
})

const run = async () => {
  const unhandledRejections: string[] = []
  const handledAbortRejections: string[] = []
  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason
    if (event.defaultPrevented) {
      handledAbortRejections.push(reason instanceof Error ? reason.message : String(reason))
      return
    }
    unhandledRejections.push(
      reason instanceof Error ? reason.stack || reason.message : String(reason),
    )
    event.preventDefault()
  })

  const flushUnhandledRejections = () => new Promise<void>((resolve) => setTimeout(resolve, 0))

  if (!window.fetch || !window.ReadableStream || !window.AbortController || !window.TextDecoder)
    throw new Error('A required renderer Web API is unavailable')

  const params = new URL(window.location.href).searchParams
  const baseUrl = params.get('baseUrl')
  if (!baseUrl) throw new Error('The local mock base URL was not provided')

  const directAbortController = new AbortController()
  const directResponse = await fetch(`${baseUrl}/cancel/direct`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
    signal: directAbortController.signal,
  })
  const directReader = directResponse.body?.getReader()
  if (!directReader) throw new Error('The renderer fetch response has no readable body')
  await directReader.read()
  directAbortController.abort()
  await directReader.read().catch(() => undefined)
  await flushUnhandledRejections()
  if (unhandledRejections.length > 0)
    throw new Error(
      `Renderer fetch abort emitted an unhandled rejection: ${unhandledRejections.join('\n')}`,
    )

  const cases: Array<{ protocol: LlmProtocol; expectedFinishReason: string }> = [
    { protocol: 'openai-compatible', expectedFinishReason: 'stop' },
    { protocol: 'openai-chat', expectedFinishReason: 'stop' },
    { protocol: 'openai-responses', expectedFinishReason: 'stop' },
    { protocol: 'anthropic-messages', expectedFinishReason: 'end_turn' },
  ]
  const results: Array<{ protocol: LlmProtocol; text: string; finishReason?: string }> = []

  for (const { protocol, expectedFinishReason } of cases) {
    const result = await generateCopywriting({
      llmConfig: createConfig(baseUrl, protocol),
      copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
      prompt: 'Write one short greeting.',
      abortSignal: new AbortController().signal,
    })
    if (result.status !== 'completed' || result.text !== 'Hello from Electron')
      throw new Error(`${protocol} returned an unexpected result: ${result.status}`)
    if (result.finishReason !== expectedFinishReason)
      throw new Error(`${protocol} returned finish reason ${result.finishReason}`)
    results.push({ protocol, text: result.text, finishReason: result.finishReason })
  }

  const cancelController = new AbortController()
  const cancelResult = await generateCopywriting({
    llmConfig: createConfig(`${baseUrl}/cancel`, 'openai-compatible'),
    copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
    prompt: 'Cancel after the first delta.',
    abortSignal: cancelController.signal,
    onTextDelta: () => window.setTimeout(() => cancelController.abort(), 0),
  })
  if (cancelResult.status !== 'cancelled' || cancelResult.text !== 'partial')
    throw new Error('Renderer cancellation did not preserve the first text delta')
  await flushUnhandledRejections()

  let timeoutError = ''
  try {
    await generateCopywriting({
      llmConfig: createConfig(`${baseUrl}/timeout`, 'openai-compatible'),
      copywritingConfig: { systemPromptMode: 'off', customSystemPrompt: '' },
      prompt: 'This request should time out.',
      abortSignal: new AbortController().signal,
    })
  } catch (error) {
    timeoutError = error instanceof Error ? error.message : String(error)
  }
  if (!timeoutError.includes('Request timed out after 5 seconds'))
    throw new Error(`Renderer timeout was not reported: ${timeoutError}`)
  await flushUnhandledRejections()
  if (unhandledRejections.length > 0)
    throw new Error(
      `Renderer emitted unhandled promise rejections: ${unhandledRejections.join('\n')}`,
    )
  if (handledAbortRejections.some((message) => message !== 'signal is aborted without reason'))
    throw new Error(
      `Unexpected abort rejection was suppressed: ${handledAbortRejections.join('\n')}`,
    )

  window.llmElectronHarness.report({
    ok: true,
    details: {
      electronVersion: window.llmElectronHarness.electronVersion,
      protocols: results,
      cancellation: cancelResult.status,
      timeout: timeoutError,
      handledAbortRejections,
      webApis: ['fetch', 'ReadableStream', 'AbortController', 'TextDecoder'],
    },
  })
}

void run().catch((error: unknown) => {
  window.llmElectronHarness.report({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  })
})
