import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { EdgeTTSVoice } from '~/electron/lib/edge-tts'

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
    const llmConfig = ref({
      modelName: '',
      apiUrl: '',
      apiKey: '',
    })
    const updateLLMConfig = (newConfig: typeof llmConfig.value) => {
      llmConfig.value = newConfig
    }

    // 视频素材管理
    const videoAssetsFolder = ref('')
    const videoExportFolder = ref('')

    // TwelveLabs 智能剪辑（可选）：留空则关闭，行为与未集成时完全一致
    const twelveLabsConfig = ref({
      apiKey: '',
      indexId: '',
    })
    const updateTwelveLabsConfig = (newConfig: typeof twelveLabsConfig.value) => {
      twelveLabsConfig.value = newConfig
    }

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

      videoAssetsFolder,
      videoExportFolder,

      twelveLabsConfig,
      updateTwelveLabsConfig,

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
      omit: ['genderList', 'speedList', 'autoBatch', 'renderStatus'],
    },
  },
)
