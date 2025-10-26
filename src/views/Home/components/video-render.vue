<template>
  <div class="h-0 flex-1 relative">
    <div class="absolute top-1/12 w-full flex justify-center cursor-default select-none">
      <v-chip v-if="appStore.renderStatus === RenderStatus.None">
        {{ t('render.status.idle') }}
      </v-chip>
      <v-chip v-if="appStore.renderStatus === RenderStatus.GenerateText" variant="elevated">
        {{ t('render.status.generatingText') }}
      </v-chip>
      <v-chip v-if="appStore.renderStatus === RenderStatus.SynthesizedSpeech" variant="elevated">
        {{ t('render.status.synthesizingSpeech') }}
      </v-chip>
      <v-chip v-if="appStore.renderStatus === RenderStatus.SegmentVideo" variant="elevated">
        {{ t('render.status.segmentingVideo') }}
      </v-chip>
      <v-chip v-if="appStore.renderStatus === RenderStatus.Rendering" variant="elevated">
        {{ t('render.status.rendering') }}
      </v-chip>
      <v-chip
        v-if="appStore.renderStatus === RenderStatus.Completed"
        variant="elevated"
        color="success"
      >
        {{ t('render.status.success') }}
      </v-chip>
      <v-chip v-if="appStore.renderStatus === RenderStatus.Failed" variant="elevated" color="error">
        {{ t('render.status.failed') }}
      </v-chip>
    </div>

    <v-sheet class="h-full p-2 pt-4 flex flex-col gap-6 items-center justify-center" border rounded>
      <div class="w-full h-[120px] flex gap-10 items-center justify-center">
        <div class="flex flex-col gap-4">
          <v-progress-circular
            color="indigo"
            v-model="renderProgress"
            :indeterminate="taskInProgress && appStore.renderStatus !== RenderStatus.Rendering"
            :size="96"
            :width="8"
          >
          </v-progress-circular>
        </div>
        <div class="flex flex-col gap-4">
          <v-btn
            v-if="!taskInProgress"
            size="x-large"
            color="deep-purple-accent-3"
            prepend-icon="mdi-rocket-launch"
            @click="emit('renderVideo')"
          >
            {{ t('render.startRender') }}
          </v-btn>
          <v-btn
            v-else
            size="x-large"
            color="red"
            prepend-icon="mdi-stop"
            @click="emit('cancelRender')"
          >
            {{ t('render.stopRender') }}
          </v-btn>
          <v-dialog v-model="configDialogShow" max-width="600" persistent>
            <template v-slot:activator="{ props: activatorProps }">
              <v-btn v-bind="activatorProps" :disabled="taskInProgress">
                {{ t('actions.config') }}
              </v-btn>
            </template>

            <v-card
              prepend-icon="mdi-text-box-edit-outline"
              :title="t('dialogs.renderConfigTitle')"
            >
              <v-card-text>
                <div class="w-full flex gap-2 mb-4 items-center">
                  <v-text-field
                    :label="t('render.output.width')"
                    v-model="config.outputSize.width"
                    hide-details
                  ></v-text-field>
                  <v-text-field
                    v-model="config.outputSize.height"
                    :label="t('render.output.height')"
                    hide-details
                    required
                  ></v-text-field>
                </div>
                <div class="w-full flex gap-2 mb-4 items-center">
                  <v-text-field
                    :label="t('render.output.fileName')"
                    v-model="config.outputFileName"
                    hide-details
                    required
                    clearable
                  ></v-text-field>
                  <v-text-field
                    class="w-[120px] flex-none"
                    v-model="config.outputFileExt"
                    :label="t('render.output.format')"
                    hide-details
                    readonly
                    required
                  ></v-text-field>
                </div>
                <div class="w-full flex gap-2 mb-4 items-center">
                  <v-text-field
                    :label="t('render.output.folder')"
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
                    {{ t('common.select') }}
                  </v-btn>
                </div>
                <div class="w-full flex gap-2 mb-2 items-center">
                  <v-text-field
                    :label="t('render.bgmFolderLabel')"
                    v-model="config.bgmPath"
                    hide-details
                    readonly
                    required
                    clearable
                  ></v-text-field>
                  <v-btn
                    class="!h-[46px]"
                    prepend-icon="mdi-folder-open"
                    @click="handleSelectBgmFolder"
                  >
                    {{ t('common.select') }}
                  </v-btn>
                </div>
              </v-card-text>
              <v-divider></v-divider>
              <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn :text="t('common.close')" variant="plain" @click="handleCloseDialog"></v-btn>
                <v-btn
                  color="primary"
                  :text="t('common.save')"
                  variant="tonal"
                  @click="handleSaveConfig"
                ></v-btn>
              </v-card-actions>
            </v-card>
          </v-dialog>
        </div>
      </div>

      <div class="w-full flex justify-center">
        <v-switch
          v-model="appStore.autoBatch"
          :label="t('render.autoBatch')"
          color="indigo"
          density="compact"
          hide-details
          :disabled="taskInProgress"
        ></v-switch>
      </div>
    </v-sheet>

    <div class="absolute bottom-2 w-full flex justify-center text-sm">
      <span class="text-gray-600 select-none">
        {{ t('footer.poweredBy') }}
        <a 
          :href="t('footer.poweredByLink')" 
          target="_blank" 
          class="text-indigo cursor-pointer hover:underline"
          @click.prevent="handleOpenHomePage"
        >
          {{ t('footer.poweredByName') }}
        </a>
      </span>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { ref, toRaw, nextTick, computed } from 'vue'
import { useTranslation } from 'i18next-vue'
import { RenderStatus, useAppStore } from '@/store'

const appStore = useAppStore()
const { t } = useTranslation()

const emit = defineEmits<{
  (e: 'renderVideo'): void
  (e: 'cancelRender'): void
}>()

const taskInProgress = computed(() => {
  return (
    appStore.renderStatus !== RenderStatus.None &&
    appStore.renderStatus !== RenderStatus.Completed &&
    appStore.renderStatus !== RenderStatus.Failed
  )
})

const renderProgress = ref(0)
window.ipcRenderer.on('render-video-progress', (_, progress: number) => {
  renderProgress.value = progress
})

// 配置合成选项
const config = ref(structuredClone(toRaw(appStore.renderConfig)))
const configDialogShow = ref(false)
const resetConfigDialog = () => {
  config.value = structuredClone(toRaw(appStore.renderConfig))
}
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
    title: t('dialogs.selectOutputFolderTitle'),
    defaultPath: config.value.outputPath,
  })
  console.log('用户选择视频导出文件夹，绝对路径：', folderPath)
  if (folderPath) {
    config.value.outputPath = folderPath
  }
}
const handleSelectBgmFolder = async () => {
  const folderPath = await window.electron.selectFolder({
    title: t('dialogs.selectBgmFolderTitle'),
    defaultPath: config.value.bgmPath,
  })
  console.log('用户选择背景音乐文件夹，绝对路径：', folderPath)
  if (folderPath) {
    config.value.bgmPath = folderPath
  }
}

const handleOpenHomePage = () => {
  window.electron.openExternal({ url: t('footer.poweredByLink') })
}
</script>

<style lang="scss" scoped>
//
</style>
