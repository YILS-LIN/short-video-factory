import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { EdgeTTSVoice } from '~/electron/lib/edge-tts'
import {
  defaultCopywritingConfig,
  defaultLlmConfig,
  normalizeCopywritingConfig,
  normalizeLlmConfig,
} from '@/lib/llm/config'
import type { CopywritingStatus, LlmConfig } from '@/lib/llm/types'
import {
  LEGACY_PROVIDER_ID,
  normalizeProviderProfile,
  normalizeProviderProfiles,
  type ProviderProfile,
} from '@/lib/llm/provider-profiles'
import { normalizeBatchConfig, type BatchRunState } from '@/lib/batch'
import { normalizeSubtitleStyle, normalizeVideoFillMode, type BgmMode } from '@/lib/render-config'
import { normalizeSegmentMode, normalizeSegmentOrder, type SegmentMode } from '@/lib/video-segments'

export enum RenderStatus {
  None,
  GenerateText,
  SynthesizedSpeech,
  SegmentVideo,
  Rendering,
  Completed,
  Failed,
}

export const useAppStore = defineStore(
  'app',
  () => {
    // 空字符串表示跟随系统，非空值表示手动选择的语言
    const locale = ref('')
    const updateLocale = (newLocale: string) => {
      locale.value = newLocale
    }

    // 大模型文案生成
    const prompt = ref('')
    const llmConfig = ref<LlmConfig>(defaultLlmConfig())
    const providerProfiles = ref<ProviderProfile[]>([])
    const activeProviderId = ref<string | null>(null)
    const copywritingConfig = ref(defaultCopywritingConfig())
    const copywritingStatus = ref<CopywritingStatus>('idle')
    const selectProviderProfile = (id: string, modelName?: string) => {
      const profile = providerProfiles.value.find((entry) => entry.id === id)
      if (!profile || (modelName !== undefined && !profile.models.includes(modelName))) return
      if (modelName !== undefined) profile.config.modelName = modelName
      activeProviderId.value = profile.id
      llmConfig.value = normalizeLlmConfig(profile.config)
    }
    const saveProviderProfile = (draft: ProviderProfile) => {
      const profile = normalizeProviderProfile(draft)
      const index = providerProfiles.value.findIndex((entry) => entry.id === profile.id)
      if (index === -1) providerProfiles.value.push(profile)
      else providerProfiles.value[index] = profile
    }
    const removeProviderProfile = (id: string) => {
      providerProfiles.value = providerProfiles.value.filter((profile) => profile.id !== id)
      if (activeProviderId.value !== id) return
      activeProviderId.value = null
      llmConfig.value = defaultLlmConfig()
    }
    const updateLLMConfig = (newConfig: LlmConfig) => {
      const config = normalizeLlmConfig(newConfig)
      const active = providerProfiles.value.find(({ id }) => id === activeProviderId.value)
      if (active) {
        saveProviderProfile({ ...active, config })
        selectProviderProfile(active.id)
      } else if (
        config.apiUrl ||
        config.apiKey ||
        config.modelName ||
        config.customHeaders.length
      ) {
        saveProviderProfile({ id: LEGACY_PROVIDER_ID, name: '', config, models: [] })
        selectProviderProfile(LEGACY_PROVIDER_ID)
      } else llmConfig.value = config
    }
    const hydrateProviderProfiles = () => {
      const before = JSON.stringify([
        providerProfiles.value,
        activeProviderId.value,
        llmConfig.value,
      ])
      providerProfiles.value = normalizeProviderProfiles(providerProfiles.value)
      const active = providerProfiles.value.find(({ id }) => id === activeProviderId.value)
      if (active) llmConfig.value = normalizeLlmConfig(llmConfig.value)
      else {
        activeProviderId.value = null
        llmConfig.value = defaultLlmConfig()
      }
      return (
        before !== JSON.stringify([providerProfiles.value, activeProviderId.value, llmConfig.value])
      )
    }
    const updateCopywritingConfig = (newConfig: typeof copywritingConfig.value) => {
      copywritingConfig.value = normalizeCopywritingConfig(newConfig)
    }
    const updateCopywritingStatus = (newStatus: CopywritingStatus) => {
      copywritingStatus.value = newStatus
    }

    // 视频素材管理
    const videoAssetsFolder = ref('')
    const videoExportFolder = ref('')

    // 语音合成
    const originalVoicesList = ref<EdgeTTSVoice[]>([])
    const languageList = computed(() => {
      return originalVoicesList.value
        .map((voice) => voice.FriendlyName.split(' - ').pop()?.split(' (').shift())
        .filter((language) => !!language)
        .filter((language, index, arr) => arr.indexOf(language) === index)
    })
    const genderList = ref([
      { label: '男性', value: 'Male' },
      { label: '女性', value: 'Female' },
      // { label: '中性', value: 'Neutral' },
    ])
    const speedList = ref([
      { label: '慢', value: -30 },
      { label: '中', value: 0 },
      { label: '快', value: 30 },
    ])
    const language = ref<string>()
    const gender = ref<string>()
    const voice = ref<EdgeTTSVoice | null>(null)
    const speed = ref(0)
    const tryListeningText = ref('Hello，欢迎使用短视频工厂！')

    // 合成配置
    const renderConfig = ref({
      bgmPath: '',
      bgmMode: 'none' as BgmMode,
      bgmFile: '',
      segmentMode: 'standard' as SegmentMode,
      segmentOrder: normalizeSegmentOrder(undefined),
      videoFillMode: normalizeVideoFillMode(undefined),
      subtitleStyle: normalizeSubtitleStyle(),
      outputSize: { width: 1080, height: 1920 },
      outputPath: '',
      outputFileName: '',
      outputFileExt: '.mp4',
      subtitlesEnabled: true,
      exportSubtitles: false,
    })
    const autoBatch = ref(false)
    const batchConfig = ref({ count: 10, onError: 'stop' as 'stop' | 'continue' })
    const batchProgress = ref<BatchRunState | null>(null)
    const renderStatus = ref(RenderStatus.None)
    const updateRenderConfig = (
      newConfig: Omit<
        typeof renderConfig.value,
        | 'subtitlesEnabled'
        | 'exportSubtitles'
        | 'bgmMode'
        | 'bgmFile'
        | 'subtitleStyle'
        | 'segmentMode'
        | 'segmentOrder'
        | 'videoFillMode'
      > &
        Partial<
          Pick<
            typeof renderConfig.value,
            | 'subtitlesEnabled'
            | 'exportSubtitles'
            | 'bgmMode'
            | 'bgmFile'
            | 'subtitleStyle'
            | 'segmentMode'
            | 'segmentOrder'
            | 'videoFillMode'
          >
        >,
    ) => {
      renderConfig.value = {
        ...newConfig,
        outputSize: { ...newConfig.outputSize },
        subtitlesEnabled: newConfig.subtitlesEnabled !== false,
        exportSubtitles: newConfig.exportSubtitles === true,
        bgmMode: newConfig.bgmMode ?? (newConfig.bgmPath ? 'random' : 'none'),
        bgmFile: newConfig.bgmFile ?? '',
        segmentMode: normalizeSegmentMode(newConfig.segmentMode),
        segmentOrder: normalizeSegmentOrder(newConfig.segmentOrder),
        videoFillMode: normalizeVideoFillMode(newConfig.videoFillMode),
        subtitleStyle: normalizeSubtitleStyle(newConfig.subtitleStyle),
      }
    }
    const updateRenderStatus = (newStatus: RenderStatus) => {
      renderStatus.value = newStatus
    }

    // 缩放倍率配置
    const zoomOptions = [0.5, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0]
    const zoomFactor = ref(1.0)
    const updateZoomFactor = (factor: number) => {
      zoomFactor.value = factor
    }

    return {
      locale,
      updateLocale,

      prompt,
      llmConfig,
      updateLLMConfig,
      providerProfiles,
      activeProviderId,
      saveProviderProfile,
      selectProviderProfile,
      removeProviderProfile,
      hydrateProviderProfiles,
      copywritingConfig,
      updateCopywritingConfig,
      copywritingStatus,
      updateCopywritingStatus,

      videoAssetsFolder,
      videoExportFolder,

      originalVoicesList,
      languageList,
      genderList,
      speedList,
      language,
      gender,
      voice,
      speed,
      tryListeningText,

      renderConfig,
      autoBatch,
      batchConfig,
      batchProgress,
      renderStatus,
      updateRenderConfig,
      updateRenderStatus,

      zoomOptions,
      zoomFactor,
      updateZoomFactor,
    }
  },
  {
    persist: {
      serializer: {
        serialize: JSON.stringify,
        deserialize: (raw) => {
          const state = JSON.parse(raw)
          // Migrate before Pinia merges defaults, otherwise missing mode becomes "none".
          if (state?.renderConfig && !state.renderConfig.bgmMode) {
            state.renderConfig.bgmMode = state.renderConfig.bgmPath ? 'random' : 'none'
          }
          if (state && !Array.isArray(state.providerProfiles)) {
            state.providerProfiles = []
            state.activeProviderId = null
            const config = normalizeLlmConfig(state.llmConfig)
            if (config.apiUrl || config.apiKey || config.modelName || config.customHeaders.length) {
              state.providerProfiles = [
                normalizeProviderProfile({ id: LEGACY_PROVIDER_ID, name: '', config, models: [] }),
              ]
              state.activeProviderId = LEGACY_PROVIDER_ID
            }
          }
          return state
        },
      },
      omit: [
        'genderList',
        'speedList',
        'autoBatch',
        'batchProgress',
        'renderStatus',
        'copywritingStatus',
      ],
      afterHydrate: (context) => {
        context.store.batchConfig = normalizeBatchConfig(context.store.batchConfig)
        context.store.updateRenderConfig(context.store.renderConfig)
        const migratedProviders = context.store.hydrateProviderProfiles()
        context.store.updateCopywritingConfig(context.store.copywritingConfig)
        if (migratedProviders || context.store.activeProviderId === LEGACY_PROVIDER_ID)
          context.store.$persist()
      },
    },
  },
)
