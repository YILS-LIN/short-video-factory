<template>
  <div class="w-full h-full flex flex-col">
    <div class="w-full h-[40px] window-drag relative border-b">
      <div class="window-control-bar-no-drag-mask"></div>
    </div>

    <div class="w-full h-0 flex-1 flex box-border gap-2 py-2 px-3">
      <div class="w-1/3 h-full">
        <TextGenerate
          ref="TextGenerateInstance"
          :disabled="appStore.renderStatus === RenderStatus.GenerateText"
        />
      </div>
      <div class="w-1/3 h-full">
        <VideoManage
          ref="VideoManageInstance"
          :disabled="appStore.renderStatus === RenderStatus.SegmentVideo"
        />
      </div>
      <div class="w-1/3 h-full flex flex-col gap-3">
        <TtsControl
          ref="TtsControlInstance"
          :disabled="appStore.renderStatus === RenderStatus.SynthesizedSpeech"
        />
        <VideoRender @render-video="handleRenderVideo" @cancel-render="handleCancelRender" />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import TextGenerate from './components/TextGenerate.vue'
import VideoManage from './components/VideoManage.vue'
import TtsControl from './components/TtsControl.vue'
import VideoRender from './components/VideoRender.vue'

import { h, ref } from 'vue'
import { RenderStatus, useAppStore } from '@/store'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import type { ListFilesFromFolderRecord } from '~/electron/types'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import random from 'random'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()

// 渲染合成视频
const TextGenerateInstance = ref<InstanceType<typeof TextGenerate> | null>()
const VideoManageInstance = ref<InstanceType<typeof VideoManage> | null>()
const TtsControlInstance = ref<InstanceType<typeof TtsControl> | null>()
const handleRenderVideo = async () => {
  if (!appStore.renderConfig.outputFileName) {
    toast.warning(t('errors.outputFileNameRequired'))
    return
  }
  if (!appStore.renderConfig.outputPath) {
    toast.warning(t('errors.outputPathRequired'))
    return
  }
  if (!appStore.renderConfig.outputSize?.width || !appStore.renderConfig.outputSize?.height) {
    toast.warning(t('errors.outputSizeRequired'))
    return
  }

  let randomBgm: ListFilesFromFolderRecord | undefined = undefined
  if (appStore.renderConfig.bgmPath) {
    try {
      const bgmList = (
        await window.electron.listFilesFromFolder({
          folderPath: appStore.renderConfig.bgmPath.replace(/\\/g, '/'),
        })
      ).filter((asset) => asset.name.endsWith('.mp3'))
      if (bgmList.length > 0) {
        randomBgm = random.choice(bgmList)
      }
    } catch (error: any) {
      console.log('获取背景音乐列表失败', error)
      const errorMessage = error?.error?.message || error?.message || error
      toast.error({
        component: {
          // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
          render: () =>
            h(ActionToastEmbed, {
              message: t('errors.bgmListFailed'),
              detail: String(errorMessage),
              actionText: t('actions.copyErrorDetail'),
              onActionTirgger: () => {
                navigator.clipboard.writeText(
                  JSON.stringify({
                    message: t('errors.bgmListFailed'),
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

  try {
    // 获取文案
    appStore.updateRenderStatus(RenderStatus.GenerateText)
    const text =
      TextGenerateInstance.value?.getCurrentOutputText() ||
      (await TextGenerateInstance.value?.handleGenerate())!

    // TTS合成语音
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.GenerateText) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.SynthesizedSpeech)
    const ttsResult = await TtsControlInstance.value?.synthesizedSpeechToFile({
      text,
      withCaption: true,
    })
    if (ttsResult?.duration === undefined) {
      throw new Error(t('errors.ttsFailedCorrupt'))
    }
    if (ttsResult?.duration === 0) {
      throw new Error(t('errors.ttsZeroDuration'))
    }

    // 获取视频片段
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.SynthesizedSpeech) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.SegmentVideo)
    const videoSegments = VideoManageInstance.value?.getVideoSegments({
      duration: ttsResult.duration,
    })!
    await new Promise((resolve) => setTimeout(resolve, random.integer(1000, 3000)))

    // 合成视频
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.SegmentVideo) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.Rendering)
    await window.electron.renderVideo({
      ...videoSegments,
      audioFiles: {
        bgm: randomBgm?.path,
      },
      outputSize: {
        width: appStore.renderConfig.outputSize.width,
        height: appStore.renderConfig.outputSize.height,
      },
      outputDuration: String(ttsResult.duration),
      outputPath:
        appStore.renderConfig.outputPath.replace(/\\/g, '/') +
        '/' +
        appStore.renderConfig.outputFileName +
        appStore.renderConfig.outputFileExt,
    })

    toast.success(t('success.renderSuccess'))
    appStore.updateRenderStatus(RenderStatus.Completed)

    if (appStore.autoBatch) {
      toast.info(t('info.batchNext'))
      TextGenerateInstance.value?.clearOutputText()
      handleRenderVideo()
    }
  } catch (error: any) {
    console.error('视频合成失败:', error)
    if (appStore.renderStatus === RenderStatus.None) return
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
        render: () =>
          h(ActionToastEmbed, {
            message: t('errors.renderFailedPrefix'),
            detail: String(errorMessage),
            actionText: t('actions.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                JSON.stringify({
                  message: t('errors.renderFailedPrefix'),
                  detail: String(errorMessage),
                }),
              )
              toast.success(t('success.copySuccess'))
            },
          }),
      },
    })
    appStore.updateRenderStatus(RenderStatus.Failed)
  }
}
const handleCancelRender = () => {
  console.log('视频合成终止')
  switch (appStore.renderStatus) {
    case RenderStatus.GenerateText:
      TextGenerateInstance.value?.handleStopGenerate()
      break

    case RenderStatus.SynthesizedSpeech:
      break

    case RenderStatus.SegmentVideo:
      break

    case RenderStatus.Rendering:
      window.ipcRenderer.send('cancel-render-video')
      break

    default:
      break
  }
  appStore.updateRenderStatus(RenderStatus.None)
  toast.info(t('info.renderCanceled'))
}
</script>

<style lang="scss" scoped>
//
</style>
