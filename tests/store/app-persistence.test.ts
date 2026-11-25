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
  it('migrates legacy BGM folders and persists explicit disabled/fixed modes', async () => {
    localStorage.setItem('app', JSON.stringify({ renderConfig: { bgmPath: '/music' } }))
    const first = createPersistedStore()
    expect(first.store.renderConfig.bgmMode).toBe('random')
    first.store.updateRenderConfig({
      ...first.store.renderConfig,
      bgmMode: 'fixed',
      bgmFile: '/music/fixed.wav',
      subtitleStyle: { ...first.store.renderConfig.subtitleStyle, color: '#FF0000' },
    })
    await nextTick()
    first.app.unmount()
    const second = createPersistedStore()
    expect(second.store.renderConfig.bgmMode).toBe('fixed')
    expect(second.store.renderConfig.bgmFile).toBe('/music/fixed.wav')
    expect(second.store.renderConfig.subtitleStyle.color).toBe('#FF0000')
    second.store.updateRenderConfig({ ...second.store.renderConfig, bgmMode: 'none' })
    await nextTick()
    second.app.unmount()
    const third = createPersistedStore()
    expect(third.store.renderConfig.bgmMode).toBe('none')
    expect(third.store.renderConfig.bgmPath).toBe('/music')
    third.app.unmount()
  })

  afterEach(() => {
    localStorage.clear()
  })

  it.each([
    [undefined, 'standard'],
    ['invalid', 'standard'],
    ['long', 'long'],
    ['whole', 'whole'],
  ])('normalizes persisted segment mode %s to %s', (segmentMode, expected) => {
    localStorage.setItem('app', JSON.stringify({ renderConfig: { segmentMode } }))
    const { app, store } = createPersistedStore()
    try {
      expect(store.renderConfig.segmentMode).toBe(expected)
    } finally {
      app.unmount()
    }
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
        protocol: 'openai-compatible',
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
        diversityEnabled: false,
        rewriteOnSimilarity: true,
      })
      expect(store.renderConfig).toMatchObject({
        subtitlesEnabled: true,
        segmentOrder: 'random',
        videoFillMode: 'contain',
        exportSubtitles: false,
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

  it('converts persisted OpenAI chat settings to compatible format across reloads', async () => {
    localStorage.setItem(
      'app',
      JSON.stringify({
        llmConfig: {
          protocol: 'openai-chat',
          apiUrl: 'https://example.com/v1',
          apiKey: 'legacy-key',
          modelName: 'legacy-model',
          temperature: 0.5,
          maxOutputTokens: 1000,
          customHeaders: [{ name: 'X-Trace', value: 'trace' }],
        },
      }),
    )

    for (let session = 0; session < 2; session++) {
      const { app, store } = createPersistedStore()
      try {
        expect(store.llmConfig).toMatchObject({
          protocol: 'openai-compatible',
          apiUrl: 'https://example.com/v1',
          apiKey: 'legacy-key',
          modelName: 'legacy-model',
          temperature: 0.5,
          maxOutputTokens: 1000,
          customHeaders: [{ name: 'X-Trace', value: 'trace' }],
        })
        expect(store.providerProfiles).toHaveLength(1)
        expect(store.providerProfiles[0]).toMatchObject({
          id: store.activeProviderId,
          models: ['legacy-model'],
        })
        await nextTick()
        expect(JSON.parse(localStorage.getItem('app') ?? '{}').llmConfig.protocol).toBe(
          'openai-compatible',
        )
      } finally {
        app.unmount()
      }
    }
  })

  it('keeps same-vendor profiles, model lists and active selection independent across reloads', async () => {
    const first = createPersistedStore()
    const openai = {
      ...first.store.llmConfig,
      apiUrl: 'https://api.openai.com/v1',
      protocol: 'openai-responses' as const,
    }
    first.store.saveProviderProfile({
      id: 'work',
      name: 'OpenAI · work',
      config: { ...openai, apiKey: 'work-key', modelName: 'gpt-5-mini' },
      models: ['gpt-5-mini'],
    })
    first.store.saveProviderProfile({
      id: 'personal',
      name: 'OpenAI · personal',
      config: { ...openai, apiKey: 'personal-key', modelName: 'gpt-5-mini' },
      models: ['gpt-5-mini', ' manual-model ', 'manual-model'],
    })
    expect(first.store.llmConfig.apiKey).toBe('')
    first.store.selectProviderProfile('work')
    expect(first.store.llmConfig.apiKey).toBe('work-key')
    first.store.selectProviderProfile('personal', 'manual-model')
    first.store.saveProviderProfile({
      ...first.store.providerProfiles[1],
      config: { ...first.store.providerProfiles[1].config, modelName: 'gpt-5-mini' },
    })
    await nextTick()
    first.app.unmount()

    const second = createPersistedStore()
    try {
      expect(second.store.providerProfiles.map(({ name }) => name)).toEqual([
        'OpenAI · work',
        'OpenAI · personal',
      ])
      expect(second.store.activeProviderId).toBe('personal')
      expect(second.store.llmConfig).toMatchObject({
        apiKey: 'personal-key',
        modelName: 'manual-model',
      })
      expect(second.store.providerProfiles[1].models).toEqual(['gpt-5-mini', 'manual-model'])
      expect(second.store.providerProfiles[1].config.modelName).toBe('gpt-5-mini')
      second.store.selectProviderProfile('personal')
      expect(second.store.llmConfig.modelName).toBe('gpt-5-mini')
      second.store.removeProviderProfile('personal')
      expect(second.store.activeProviderId).toBeNull()
      expect(second.store.llmConfig.apiKey).toBe('')
      second.store.removeProviderProfile('work')
      expect(second.store.activeProviderId).toBeNull()
      expect(second.store.llmConfig.apiKey).toBe('')
    } finally {
      second.app.unmount()
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
      subtitlesEnabled: false,
      exportSubtitles: true,
      segmentMode: 'whole',
      segmentOrder: 'filename',
      videoFillMode: 'cover',
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
    firstSession.store.batchConfig = { count: 25, onError: 'continue' }
    firstSession.store.autoBatch = true
    firstSession.store.updateRenderStatus(RenderStatus.Rendering)

    await nextTick()
    const storedState = JSON.parse(localStorage.getItem('app') ?? '{}')
    expect(storedState.llmConfig.apiKey).toBe('local-secret')
    expect(storedState.renderConfig.outputPath).toBe('C:/output folder')
    expect(storedState).not.toHaveProperty('autoBatch')
    expect(storedState).not.toHaveProperty('renderStatus')
    expect(storedState).not.toHaveProperty('batchProgress')
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
      expect(secondSession.store.renderConfig.subtitlesEnabled).toBe(false)
      expect(secondSession.store.renderConfig.exportSubtitles).toBe(true)
      expect(secondSession.store.renderConfig.segmentOrder).toBe('filename')
      expect(secondSession.store.renderConfig.videoFillMode).toBe('cover')
      expect(secondSession.store.language).toBe('English (United States)')
      expect(secondSession.store.gender).toBe('Female')
      expect(secondSession.store.voice?.ShortName).toBe('en-US-Test')
      expect(secondSession.store.speed).toBe(30)
      expect(secondSession.store.autoBatch).toBe(false)
      expect(secondSession.store.batchConfig).toEqual({ count: 25, onError: 'continue' })
      expect(secondSession.store.batchProgress).toBe(null)
      expect(secondSession.store.renderStatus).toBe(RenderStatus.None)
    } finally {
      secondSession.app.unmount()
    }
  })
})
