<template>
  <div>
    <v-form :disabled="disabled">
      <v-sheet class="h-fit p-2" border rounded>
        <v-combobox
          v-model="appStore.language"
          density="comfortable"
          :label="t('tts.language')"
          :items="appStore.languageList"
          :no-data-text="t('common.noData')"
          @update:model-value="clearVoice"
        ></v-combobox>
        <v-select
          v-model="appStore.gender"
          density="comfortable"
          :label="t('tts.gender')"
          :items="genderItems"
          item-title="label"
          item-value="value"
          @update:model-value="clearVoice"
        ></v-select>
        <v-select
          v-model="appStore.voice"
          density="comfortable"
          :label="t('tts.voice')"
          :items="filteredVoicesList"
          item-title="FriendlyName"
          return-object
          :no-data-text="t('tts.selectLanguageGenderFirst')"
        ></v-select>
        <v-select
          v-model="appStore.speed"
          density="comfortable"
          :label="t('tts.speed')"
          :items="speedItems"
          item-title="label"
          item-value="value"
        ></v-select>
        <v-text-field
          v-model="appStore.tryListeningText"
          density="comfortable"
          :label="t('tts.tryText')"
        ></v-text-field>
        <v-btn
          class="mb-2"
          prepend-icon="mdi-volume-high"
          block
          :loading="tryListeningLoading"
          :disabled="disabled"
          @click="handleTryListening"
        >
          {{ t('tts.tryListen') }}
        </v-btn>
      </v-sheet>
    </v-form>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed, onMounted, h } from 'vue'
import { useAppStore } from '@/store'
import { useToast } from 'vue-toastification'
import { useTranslation } from 'i18next-vue'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()

defineProps<{
  disabled?: boolean
}>()

const configValid = () => {
  if (!appStore.voice) {
    toast.warning(t('tts.selectVoiceWarning'))
    return false
  }

  if (!appStore.tryListeningText) {
    toast.warning(t('tts.tryTextEmptyWarning'))
    return false
  }

  return true
}

const tryListeningLoading = ref(false)
const handleTryListening = async () => {
  if (!configValid()) return

  tryListeningLoading.value = true
  try {
    const speech = await window.electron.edgeTtsSynthesizeToBase64({
      text: appStore.tryListeningText,
      voice: appStore.voice!.ShortName,
      options: {
        rate: appStore.speed,
      },
    })
    const audio = new Audio(`data:audio/mp3;base64,${speech}`)
    audio.play()
    toast.info(t('tts.playTryAudio'))
  } catch (error: any) {
    console.log('试听语音合成失败', error)
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
        render: () =>
          h(ActionToastEmbed, {
            message: t('tts.trySynthesisFailedNetwork'),
            detail: String(errorMessage),
            actionText: t('actions.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                JSON.stringify({
                  message: t('tts.trySynthesisFailedNetwork'),
                  detail: String(errorMessage),
                }),
              )
              toast.success(t('success.copySuccess'))
            },
          }),
      },
    })
  } finally {
    tryListeningLoading.value = false
  }
}
const clearVoice = () => {
  appStore.voice = null
}

const filteredVoicesList = computed(() => {
  if (!appStore.language || !appStore.gender) return []
  return appStore.originalVoicesList.filter(
    (voice) => voice.FriendlyName.includes(appStore.language!) && voice.Gender === appStore.gender,
  )
})

const genderItems = computed(() => {
  return [
    { label: t('tts.genderMale'), value: 'Male' },
    { label: t('tts.genderFemale'), value: 'Female' },
  ]
})

const speedItems = computed(() => {
  return [
    { label: t('tts.speedSlow'), value: -30 },
    { label: t('tts.speedMedium'), value: 0 },
    { label: t('tts.speedFast'), value: 30 },
  ]
})

const fetchVoices = async () => {
  try {
    appStore.originalVoicesList = await window.electron.edgeTtsGetVoiceList()
    console.log('EdgeTTS语音列表更新：', appStore.originalVoicesList)
  } catch (error: any) {
    console.log('获取EdgeTTS语音列表失败', error)
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
        render: () =>
          h(ActionToastEmbed, {
            message: t('errors.edgeTtsListFailed'),
            detail: String(errorMessage),
            actionText: t('actions.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                JSON.stringify({
                  message: t('errors.edgeTtsListFailed'),
                  detail: String(errorMessage),
                }),
              )
              toast.success(t('success.copySuccess'))
            },
          }),
      },
    })
  }
}
onMounted(async () => {
  await fetchVoices()
  if (!appStore.originalVoicesList.find((voice) => voice.Name === appStore.voice?.Name)) {
    appStore.voice = null
  }
})

const synthesizedSpeechToFile = async (option: { text: string; withCaption?: boolean }) => {
  if (!configValid()) throw new Error(t('errors.ttsConfigInvalid'))

  try {
    const result = await window.electron.edgeTtsSynthesizeToFile({
      text: option.text,
      voice: appStore.voice!.ShortName,
      options: {
        rate: appStore.speed,
      },
      withCaption: option?.withCaption,
    })
    return result
  } catch (error) {
    console.log('语音合成失败', error)
    throw new Error(t('errors.ttsSynthesisFailed'))
  }
}

defineExpose({ synthesizedSpeechToFile })
</script>

<style lang="scss" scoped>
//
</style>
