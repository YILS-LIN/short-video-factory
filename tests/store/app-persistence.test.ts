// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { afterEach, describe, expect, it } from 'vitest'
import { EdgeTTSGender } from '../../electron/lib/edge-tts'
import { RenderStatus, useAppStore } from '../../src/store/app'

const createPersistedStore = () => {
  const pinia = createPinia().use(piniaPluginPersistedstate)
  const app = createApp({ render: () => null })
  app.use(pinia)
  app.mount(document.createElement('div'))
  return { app, store: useAppStore(pinia) }
}

describe('app store persisted state', () => {
  afterEach(() => {
    localStorage.clear()
  })

  it('migrates legacy model settings and normalizes partial or invalid persisted data', async () => {
    localStorage.setItem(
      'app',
      JSON.stringify({
        llmConfig: {
          apiUrl: ' https://example.com/v1 ',
          apiKey: 'legacy-key',
          modelName: ' legacy-model ',
          stream: false,
          timeoutSeconds: -1,
          customHeaders: [
            { name: 'X-Valid', value: 'ok' },
            { name: 'Authorization', value: 'unsafe override' },
          ],
        },
        copywritingConfig: { systemPromptMode: 'invalid', customSystemPrompt: 2 },
        renderConfig: { outputPath: 'C:/render output' },
        autoBatch: true,
        renderStatus: RenderStatus.Completed,
      }),
    )

    const { app, store } = createPersistedStore()
    try {
      expect(store.llmConfig).toMatchObject({
        protocol: 'openai-chat',
        apiUrl: 'https://example.com/v1',
        apiKey: 'legacy-key',
        modelName: 'legacy-model',
        timeoutSeconds: 120,
        customHeaders: [{ name: 'X-Valid', value: 'ok' }],
      })
      expect('stream' in store.llmConfig).toBe(false)
      expect(store.copywritingConfig).toEqual({
        systemPromptMode: 'builtin',
        customSystemPrompt: '',
      })
      expect(store.renderConfig).toMatchObject({
        outputPath: 'C:/render output',
        outputSize: { width: 1080, height: 1920 },
        outputFileExt: '.mp4',
      })
      expect(store.autoBatch).toBe(false)
      expect(store.renderStatus).toBe(RenderStatus.None)
    } finally {
      app.unmount()
    }
  })

  it('persists saved configuration while excluding transient render state across reloads', async () => {
    const firstSession = createPersistedStore()
    firstSession.store.updateLLMConfig({
      protocol: 'anthropic-messages',
      apiUrl: 'https://api.example.com',
      apiKey: 'local-secret',
      modelName: 'claude-test',
      timeoutSeconds: 30,
      anthropicAuthMode: 'bearer',
      instructionDelivery: 'standard',
      customHeaders: [],
    })
    firstSession.store.updateCopywritingConfig({
      systemPromptMode: 'custom',
      customSystemPrompt: 'Use a warm voice',
    })
    firstSession.store.updateRenderConfig({
      bgmPath: 'C:/music',
      outputSize: { width: 720, height: 1280 },
      outputPath: 'C:/output folder',
      outputFileName: 'story',
      outputFileExt: '.mp4',
    })
    firstSession.store.language = 'English (United States)'
    firstSession.store.gender = 'Female'
    firstSession.store.voice = {
      Name: 'Microsoft Test Voice',
      ShortName: 'en-US-Test',
      FriendlyName: 'English (United States) - Test',
      Gender: EdgeTTSGender.FEMALE,
      Locale: 'en-US',
      Status: 'GA',
      VoiceTag: { ContentCategories: [], VoicePersonalities: [] },
      SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3',
    }
    firstSession.store.speed = 30
    firstSession.store.autoBatch = true
    firstSession.store.updateRenderStatus(RenderStatus.Rendering)

    await nextTick()
    const storedState = JSON.parse(localStorage.getItem('app') ?? '{}')
    expect(storedState.llmConfig.apiKey).toBe('local-secret')
    expect(storedState.renderConfig.outputPath).toBe('C:/output folder')
    expect(storedState).not.toHaveProperty('autoBatch')
    expect(storedState).not.toHaveProperty('renderStatus')
    firstSession.app.unmount()

    const secondSession = createPersistedStore()
    try {
      expect(secondSession.store.llmConfig).toMatchObject({
        protocol: 'anthropic-messages',
        apiKey: 'local-secret',
        modelName: 'claude-test',
      })
      expect(secondSession.store.copywritingConfig.customSystemPrompt).toBe('Use a warm voice')
      expect(secondSession.store.renderConfig.outputPath).toBe('C:/output folder')
      expect(secondSession.store.language).toBe('English (United States)')
      expect(secondSession.store.gender).toBe('Female')
      expect(secondSession.store.voice?.ShortName).toBe('en-US-Test')
      expect(secondSession.store.speed).toBe(30)
      expect(secondSession.store.autoBatch).toBe(false)
      expect(secondSession.store.renderStatus).toBe(RenderStatus.None)
    } finally {
      secondSession.app.unmount()
    }
  })
})
