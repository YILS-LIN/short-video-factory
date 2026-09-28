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
    // 国际化区域设置
    const locale = ref('')
    const updateLocale = (newLocale: string) => {
      locale.value = newLocale
    }

    // 大模型文案生成
    const prompt = ref('')
    const llmConfig = ref<LlmConfig>(defaultLlmConfig())
    const copywritingConfig = ref(defaultCopywritingConfig())
    const copywritingStatus = ref<CopywritingStatus>('idle')
    const updateLLMConfig = (newConfig: LlmConfig) => {
      llmConfig.value = normalizeLlmConfig(newConfig)
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
      outputSize: { width: 1080, height: 1920 },
      outputPath: '',
      outputFileName: '',
      outputFileExt: '.mp4',
    })
    const autoBatch = ref(false)
    const renderStatus = ref(RenderStatus.None)
    const updateRenderConfig = (newConfig: typeof renderConfig.value) => {
      renderConfig.value = newConfig
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
      omit: ['genderList', 'speedList', 'autoBatch', 'renderStatus', 'copywritingStatus'],
      beforeHydrate: (context) => {
        // Pinia merges persisted state into default state before afterHydrate, so an old record
        // without protocol would otherwise inherit the new openai-compatible default. Seed the
        // migration target first; the subsequent nested patch keeps this protocol value.
        try {
          const serializedState = window.localStorage.getItem(context.store.$id)
          const persistedState = serializedState ? JSON.parse(serializedState) : undefined
          if (
            persistedState?.llmConfig &&
            typeof persistedState.llmConfig === 'object' &&
            !('protocol' in persistedState.llmConfig)
          ) {
            context.store.llmConfig.protocol = 'openai-chat'
          }
        } catch {
          // Let the persistence plugin retain its default state if legacy storage is malformed.
        }
      },
      afterHydrate: (context) => {
        context.store.updateLLMConfig(context.store.llmConfig)
        context.store.updateCopywritingConfig(context.store.copywritingConfig)
      },
    },
  },
)
