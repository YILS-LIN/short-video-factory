<template>
  <div class="w-full">
    <v-sheet class="p-4" border rounded>
      <div
        class="h-[166px] grid grid-cols-[120px_minmax(0,1fr)] grid-rows-[1fr_auto] gap-x-4 gap-y-3"
      >
        <div class="col-start-1 row-start-1 h-full flex items-center justify-center">
          <v-progress-circular
            color="primary"
            v-model="renderProgress"
            :indeterminate="taskInProgress && appStore.renderStatus !== RenderStatus.Rendering"
            :size="96"
            :width="8"
          >
            <div class="flex flex-col items-center leading-tight select-none">
              <span class="text-xl font-bold text-slate-700">{{ progressCenterPrimary }}</span>
              <span v-if="progressCenterSecondary" class="text-xs text-medium-emphasis mt-1">
                {{ progressCenterSecondary }}
              </span>
            </div>
          </v-progress-circular>
        </div>
        <span
          class="col-start-1 row-start-2 text-xs text-medium-emphasis text-center leading-4 self-center select-none"
        >
          {{ renderStatusShortText }}
        </span>

        <div class="col-start-2 row-start-1 h-full flex items-center justify-center">
          <v-btn
            v-if="!taskInProgress"
            class="!h-24 !px-8 w-full"
            size="x-large"
            color="primary"
            @click="emit('renderVideo')"
          >
            <div class="inline-flex items-center gap-4">
              <v-icon size="28">mdi-rocket-launch</v-icon>
              <span class="text-xl">{{ t('features.render.config.startLabel') }}</span>
            </div>
          </v-btn>
          <v-btn
            v-else
            class="!h-24 !px-8 w-full"
            size="x-large"
            color="red"
            prepend-icon="mdi-stop"
            @click="emit('cancelRender')"
          >
            <span class="text-xl">{{
              t(
                appStore.batchProgress?.running
                  ? 'features.render.batch.stop'
                  : 'features.render.config.stopLabel',
              )
            }}</span>
          </v-btn>
        </div>

        <div class="col-start-2 row-start-2 w-full flex items-center justify-between gap-2">
          <v-btn
            class="!h-10 !px-2 !text-[12px] !normal-case !tracking-normal"
            variant="text"
            :title="appStore.renderConfig.outputPath"
            :disabled="!appStore.renderConfig.outputPath?.trim() || openingDirectory"
            :loading="openingDirectory"
            @click="handleOpenOutputDirectory"
          >
            {{ t('features.render.config.openOutputDirectory') }}
          </v-btn>
          <v-btn class="!h-10 !px-6" :disabled="taskInProgress" @click="configDialogShow = true">
            <v-icon class="mt-1" start size="small">mdi-cog</v-icon>
            {{ t('common.buttons.config') }}
          </v-btn>
        </div>
      </div>
    </v-sheet>

    <v-dialog v-model="configDialogShow" max-width="600" persistent>
      <v-card prepend-icon="mdi-text-box-edit-outline" :title="t('dialogs.renderConfig')">
        <v-card-text>
          <div class="w-full flex gap-2 mb-4 items-center">
            <v-text-field
              :label="t('features.render.config.output.width')"
              v-model="config.outputSize.width"
              hide-details
            ></v-text-field>
            <v-text-field
              v-model="config.outputSize.height"
              :label="t('features.render.config.output.height')"
              hide-details
              required
            ></v-text-field>
          </div>
          <div class="w-full flex gap-2 mb-4 items-center">
            <v-text-field
              :label="t('features.render.config.output.fileName')"
              v-model="config.outputFileName"
              hide-details
              required
              clearable
            ></v-text-field>
            <v-text-field
              class="w-[120px] flex-none"
              v-model="config.outputFileExt"
              :label="t('features.render.config.output.format')"
              hide-details
              readonly
              required
            ></v-text-field>
          </div>
          <div class="w-full flex gap-2 mb-4 items-center">
            <v-text-field
              :label="t('features.render.config.output.folder')"
              v-model="config.outputPath"
              hide-details
              readonly
              required
            ></v-text-field>
            <v-btn
              class="!h-[46px]"
              prepend-icon="mdi-folder-open"
              @click="handleSelectOutputFolder"
            >
              {{ t('common.buttons.select') }}
            </v-btn>
          </div>
          <div class="w-full flex gap-2 mb-2 items-center">
            <v-text-field
              :label="t('features.render.config.bgmFolderLabel')"
              v-model="config.bgmPath"
              hide-details
              readonly
              required
              clearable
            ></v-text-field>
            <v-btn class="!h-[46px]" prepend-icon="mdi-folder-open" @click="handleSelectBgmFolder">
              {{ t('common.buttons.select') }}
            </v-btn>
          </div>
        </v-card-text>
        <v-divider></v-divider>
        <v-card-actions>
          <v-spacer></v-spacer>
          <v-btn
            :text="t('common.buttons.close')"
            variant="plain"
            @click="handleCloseDialog"
          ></v-btn>
          <v-btn
            color="primary"
            :text="t('common.buttons.save')"
            variant="tonal"
            @click="handleSaveConfig"
          ></v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </div>
</template>

<script lang="ts" setup>
import { h, ref, nextTick, computed, watch, onUnmounted } from 'vue'
import { useTranslation } from 'i18next-vue'
import { RenderStatus, useAppStore } from '@/store'
import { useToast } from 'vue-toastification'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import { formatErrorForCopy } from '@/lib/error-copy'

const appStore = useAppStore()
const { t } = useTranslation()
const toast = useToast()
const openingDirectory = ref(false)
const handleOpenOutputDirectory = async () => {
  const folderPath = appStore.renderConfig.outputPath
  if (!folderPath?.trim() || openingDirectory.value) return
  openingDirectory.value = true
  try {
    await window.electron.openDirectory(folderPath)
  } catch (error) {
    const message = t('features.render.errors.openOutputDirectoryFailed')
    const detail = `${folderPath}\n${error instanceof Error ? error.message : String(error)}`
    toast.error({
      component: {
        render: () =>
          h(ActionToastEmbed, {
            message,
            detail,
            actionText: t('common.buttons.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(formatErrorForCopy(message, detail))
              toast.success(t('common.messages.success.copySuccess'))
            },
          }),
      },
    })
  } finally {
    openingDirectory.value = false
  }
}

const emit = defineEmits<{
  (e: 'renderVideo'): void
  (e: 'cancelRender'): void
}>()

const taskInProgress = computed(() => {
  return (
    appStore.batchProgress?.running ||
    (appStore.renderStatus !== RenderStatus.None &&
      appStore.renderStatus !== RenderStatus.Completed &&
      appStore.renderStatus !== RenderStatus.Failed)
  )
})

const renderProgress = ref(0)
const onRenderVideoProgress = (_: Electron.IpcRendererEvent, progress: number) => {
  renderProgress.value = Math.max(0, Math.min(100, progress))
}
window.ipcRenderer.on('render-video-progress', onRenderVideoProgress)

onUnmounted(() => {
  window.ipcRenderer.off('render-video-progress', onRenderVideoProgress)
})

watch(
  () => appStore.renderStatus,
  (status) => {
    if (status === RenderStatus.Completed) {
      renderProgress.value = 100
      return
    }
    if (status === RenderStatus.None || status === RenderStatus.GenerateText) {
      renderProgress.value = 0
    }
  },
)

const renderStatusShortText = computed(() => {
  if (appStore.batchProgress?.running && appStore.batchProgress.stopRequested)
    return t('features.render.batch.stopping')
  switch (appStore.renderStatus) {
    case RenderStatus.GenerateText:
      return t('features.render.statusShort.generatingText')
    case RenderStatus.SynthesizedSpeech:
      return t('features.render.statusShort.synthesizingSpeech')
    case RenderStatus.SegmentVideo:
      return t('features.render.statusShort.segmentingVideo')
    case RenderStatus.Rendering:
      return t('features.render.statusShort.rendering')
    case RenderStatus.Completed:
      return t('features.render.statusShort.success')
    case RenderStatus.Failed:
      return t('features.render.statusShort.failed')
    default:
      return t('features.render.statusShort.idle')
  }
})

const progressCenterPrimary = computed(() => {
  if (appStore.renderStatus === RenderStatus.Rendering) {
    return `${Math.round(renderProgress.value)}%`
  }
  if (appStore.renderStatus === RenderStatus.Completed) {
    return '100%'
  }
  if (appStore.renderStatus === RenderStatus.Failed) {
    return t('features.render.statusMini.failed')
  }
  if (appStore.renderStatus === RenderStatus.GenerateText) {
    return t('features.render.statusMini.generatingText')
  }
  if (appStore.renderStatus === RenderStatus.SynthesizedSpeech) {
    return t('features.render.statusMini.synthesizingSpeech')
  }
  if (appStore.renderStatus === RenderStatus.SegmentVideo) {
    return t('features.render.statusMini.segmentingVideo')
  }
  return t('features.render.statusMini.idle')
})

const progressCenterSecondary = computed(() => {
  if (appStore.renderStatus === RenderStatus.Rendering) {
    return t('features.render.statusMini.rendering')
  }
  if (appStore.renderStatus === RenderStatus.Completed) {
    return t('features.render.statusMini.success')
  }
  return ''
})

// 配置合成选项
// toRaw only unwraps the outer proxy; copy the nested size explicitly so hydrated
// or saved reactive configuration never reaches structuredClone.
const createConfigDraft = () => ({
  ...appStore.renderConfig,
  outputSize: { ...appStore.renderConfig.outputSize },
})
const config = ref(createConfigDraft())
const configDialogShow = ref(false)
const resetConfigDialog = () => {
  config.value = createConfigDraft()
}
watch(configDialogShow, (show) => {
  if (show) resetConfigDialog()
})
const handleCloseDialog = () => {
  configDialogShow.value = false
  nextTick(resetConfigDialog)
}
const handleSaveConfig = () => {
  appStore.updateRenderConfig(config.value)
  configDialogShow.value = false
}

// 选择文件夹
const handleSelectOutputFolder = async () => {
  const folderPath = await window.electron.selectFolder({
    title: t('dialogs.selectOutputFolder'),
    defaultPath: config.value.outputPath,
  })
  console.log('用户选择视频导出文件夹，绝对路径：', folderPath)
  if (folderPath) {
    config.value.outputPath = folderPath
  }
}
const handleSelectBgmFolder = async () => {
  const folderPath = await window.electron.selectFolder({
    title: t('dialogs.selectBgmFolder'),
    defaultPath: config.value.bgmPath,
  })
  console.log('用户选择背景音乐文件夹，绝对路径：', folderPath)
  if (folderPath) {
    config.value.bgmPath = folderPath
  }
}
</script>
