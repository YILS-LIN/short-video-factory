<template>
  <div class="w-full h-full flex flex-col">
    <div
      class="w-full h-[40px] relative border-b"
      :class="isMac ? 'title-bar' : 'window-drag'"
      @mousedown="handleTitleBarMouseDown"
      @dblclick="handleTitleBarDoubleClick"
    >
      <div class="window-control-bar-no-drag-mask" @mousedown.stop @dblclick.stop></div>
    </div>

    <div class="w-full box-border pt-2 px-3">
      <TopBar class="window-control-bar-no-drag" />
    </div>

    <div class="w-full h-0 flex-1 flex box-border gap-2 pt-1 pb-3 px-3">
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
      <div class="w-1/3 h-full min-w-0 min-h-0 flex flex-col gap-3">
        <div class="h-0 flex-1 min-h-0">
          <TtsControl
            ref="TtsControlInstance"
            :disabled="appStore.renderStatus === RenderStatus.SynthesizedSpeech"
          />
        </div>
        <SubtitleOptions class="shrink-0" />
        <VideoRender
          class="shrink-0"
          @render-video="handleRenderVideo"
          @cancel-render="handleCancelRender"
        />
      </div>
    </div>
  </div>
</template>

<script lang="ts" setup>
import TextGenerate from './components/TextGenerate.vue'
import VideoManage from './components/VideoManage.vue'
import TtsControl from './components/TtsControl.vue'
import VideoRender from './components/VideoRender.vue'
import SubtitleOptions from './components/SubtitleOptions.vue'
import TopBar from './components/TopBar.vue'

import { h, onBeforeUnmount, ref } from 'vue'
import { RenderStatus, useAppStore } from '@/store'
import { useTranslation } from 'i18next-vue'
import { useToast } from 'vue-toastification'
import type { ListFilesFromFolderRecord } from '~/electron/types'
import type { GenerationUsageSummary } from '~/electron/analytics-types'
import ActionToastEmbed from '@/components/ActionToastEmbed.vue'
import random from 'random'
import { formatErrorForCopy } from '@/lib/error-copy'
import { createAnalyticsOperationId, trackAnalytics } from '@/lib/analytics'

const toast = useToast()
const appStore = useAppStore()
const { t } = useTranslation()
const isMac = window.electron.platform === 'darwin'

let dragState: {
  startMouseX: number
  startMouseY: number
  startClientX: number
  startWindowX: number
  startWindowY: number
  dragging: boolean
  preparing: boolean
} | null = null

const clearTitleBarDragListeners = () => {
  window.removeEventListener('mousemove', handleTitleBarMouseMove)
  window.removeEventListener('mouseup', handleTitleBarMouseUp)
}

const handleTitleBarMouseMove = async (event: MouseEvent) => {
  if (!isMac || !dragState) return

  const deltaX = event.screenX - dragState.startMouseX
  const deltaY = event.screenY - dragState.startMouseY
  if (!dragState.dragging && Math.hypot(deltaX, deltaY) < 2) return

  if (!dragState.dragging) {
    if (dragState.preparing) return
    dragState.preparing = true

    const dragInfo = await window.electron.prepareWindowDrag()
    if (!dragState || !dragInfo) return

    let initialX = dragInfo.bounds.x
    let initialY = dragInfo.bounds.y
    if (dragInfo.wasMaximized) {
      const pointerRatio = dragState.startClientX / window.innerWidth
      initialX = event.screenX - dragInfo.bounds.width * pointerRatio
      initialY = Math.max(0, event.screenY - 20)
      window.electron.setWindowPosition(initialX, initialY)
    }

    dragState.startMouseX = event.screenX
    dragState.startMouseY = event.screenY
    dragState.startWindowX = initialX
    dragState.startWindowY = initialY
  }

  dragState.dragging = true
  window.electron.setWindowPosition(
    dragState.startWindowX + event.screenX - dragState.startMouseX,
    dragState.startWindowY + event.screenY - dragState.startMouseY,
  )
}

const handleTitleBarMouseUp = () => {
  dragState = null
  clearTitleBarDragListeners()
}

const handleTitleBarMouseDown = async (event: MouseEvent) => {
  if (!isMac) return
  if (event.button !== 0 || event.detail > 1) return

  const bounds = await window.electron.getWindowBounds()
  if (!bounds) return

  dragState = {
    startMouseX: event.screenX,
    startMouseY: event.screenY,
    startClientX: event.clientX,
    startWindowX: bounds.x,
    startWindowY: bounds.y,
    dragging: false,
    preparing: false,
  }
  clearTitleBarDragListeners()
  window.addEventListener('mousemove', handleTitleBarMouseMove)
  window.addEventListener('mouseup', handleTitleBarMouseUp)
}

const handleTitleBarDoubleClick = () => {
  if (!isMac) return
  dragState = null
  clearTitleBarDragListeners()
  window.electron.toggleWindowMaximize()
}

onBeforeUnmount(() => {
  clearTitleBarDragListeners()
})

// 渲染合成视频
const TextGenerateInstance = ref<InstanceType<typeof TextGenerate> | null>()
const VideoManageInstance = ref<InstanceType<typeof VideoManage> | null>()
const TtsControlInstance = ref<InstanceType<typeof TtsControl> | null>()
let activeTtsSynthesisController: AbortController | null = null
type GenerationStage = 'text' | 'tts' | 'media' | 'export'
type GenerationOutcome = 'succeeded' | 'failed' | 'cancelled'

interface BatchContext {
  id: string
  startedAt: number
  completedCount: number
  failedCount: number
  cancelledCount: number
  finished: boolean
}

interface GenerationTask {
  id: string
  trigger: 'manual' | 'batch'
  batch: BatchContext | null
  startedAt: number
  stageStartedAt: number
  stage: GenerationStage
  finished: boolean
  metrics: Record<string, string | number | boolean>
  usage?: GenerationUsageSummary
  finish?: (outcome: GenerationOutcome, error?: unknown) => void
}

let activeGeneration: GenerationTask | null = null
const recentlyBlockedAt = new Map<string, number>()

const getResolutionBucket = (width: number, height: number) => {
  const maxDimension = Math.max(width, height)
  if (maxDimension >= 2160) return '4k'
  if (maxDimension >= 1080) return '1080p'
  if (maxDimension >= 720) return '720p'
  return 'custom'
}

const getAspectRatio = (width: number, height: number) => {
  const ratio = width / height
  if (Math.abs(ratio - 1) < 0.05) return 'square'
  if (ratio > 1) return ratio > 2 ? 'custom' : 'landscape'
  return ratio < 0.4 ? 'custom' : 'portrait'
}

const classifyError = (error: unknown): string => {
  const value = error as { name?: string; message?: string; code?: string }
  const text = `${value?.name ?? ''} ${value?.code ?? ''} ${value?.message ?? ''}`.toLowerCase()
  if (value?.name === 'AbortError') return 'unknown'
  if (/timed out|timeout|etimedout/.test(text)) return 'network_timeout'
  if (/enotfound|econnrefused|networkerror|failed to fetch/.test(text)) return 'network_unreachable'
  if (/401|403|unauthorized|forbidden/.test(text)) return 'authentication_failed'
  if (/429|rate.?limit/.test(text)) return 'rate_limited'
  if (/permission|eacces|eperm/.test(text)) return 'permission_denied'
  if (/enospc|disk.?full/.test(text)) return 'disk_full'
  if (/ffmpeg|exited with code/.test(text)) return 'ffmpeg_failed'
  if (/invalid.*audio|audio.*invalid/.test(text)) return 'tts_invalid_audio'
  return 'unknown'
}

const finalizeBatch = (batch: BatchContext, stopReason: string) => {
  if (batch.finished) return
  batch.finished = true
  trackAnalytics('batch_finished', {
    batch_id: batch.id,
    completed_count: batch.completedCount,
    failed_count: batch.failedCount,
    cancelled_count: batch.cancelledCount,
    duration_ms: Math.max(0, Math.floor(performance.now() - batch.startedAt)),
    stop_reason: stopReason,
  })
}

const handleRenderVideo = async (batchContext?: BatchContext) => {
  const subtitlesEnabled = appStore.renderConfig.subtitlesEnabled !== false
  const exportSubtitles = appStore.renderConfig.exportSubtitles === true
  const operationId = createAnalyticsOperationId()
  const trigger = batchContext ? 'batch' : appStore.autoBatch ? 'batch' : 'manual'
  const blocked = (reason: string) => {
    const now = Date.now()
    if (now - (recentlyBlockedAt.get(reason) ?? 0) >= 30_000) {
      recentlyBlockedAt.set(reason, now)
      trackAnalytics('video_generation_blocked', {
        operation_id: operationId,
        trigger,
        blocked_reason: reason,
        ...(batchContext ? { batch_id: batchContext.id } : {}),
      })
    }
    if (batchContext) {
      batchContext.failedCount += 1
      finalizeBatch(batchContext, 'generation_failed')
    }
  }

  if (!appStore.renderConfig.outputFileName) {
    blocked('output_name_missing')
    toast.warning(t('features.render.errors.outputFileNameRequired'))
    return
  }
  if (!appStore.renderConfig.outputPath) {
    blocked('output_path_missing')
    toast.warning(t('features.render.errors.outputPathRequired'))
    return
  }
  if (!appStore.renderConfig.outputSize?.width || !appStore.renderConfig.outputSize?.height) {
    blocked('output_size_invalid')
    toast.warning(t('features.render.errors.outputSizeRequired'))
    return
  }
  if (
    typeof appStore.copywritingStatus === 'string' &&
    !['completed', 'edited'].includes(appStore.copywritingStatus) &&
    typeof appStore.prompt === 'string' &&
    !appStore.prompt.trim()
  ) {
    blocked('text_missing')
    toast.warning(t('features.llm.errors.promptRequired'))
    return
  }

  let randomBgm: ListFilesFromFolderRecord | undefined = undefined
  if (appStore.renderConfig.bgmPath) {
    try {
      const bgmList = (
        await window.electron.listFilesFromFolder({
          folderPath: appStore.renderConfig.bgmPath.replace(/\\/g, '/'),
        })
      ).filter((asset) => asset.name.toLowerCase().endsWith('.mp3'))
      if (bgmList.length > 0) {
        randomBgm = random.choice(bgmList)
      }
      console.debug('背景音乐素材读取完成', {
        mp3Count: bgmList.length,
        selected: randomBgm?.name,
      })
    } catch (error: any) {
      blocked('bgm_unavailable')
      console.warn('获取背景音乐列表失败', error)
      const errorMessage = error?.error?.message || error?.message || error
      toast.error({
        component: {
          // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
          render: () =>
            h(ActionToastEmbed, {
              message: t('features.render.errors.bgmListFailed'),
              detail: String(errorMessage),
              actionText: t('common.buttons.copyErrorDetail'),
              onActionTirgger: () => {
                navigator.clipboard.writeText(
                  formatErrorForCopy(
                    t('features.render.errors.bgmListFailed'),
                    String(errorMessage),
                  ),
                )
                toast.success(t('common.messages.success.copySuccess'))
              },
            }),
        },
      })
      return
    }
  }

  const batch =
    batchContext ??
    (appStore.autoBatch
      ? {
          id: createAnalyticsOperationId(),
          startedAt: performance.now(),
          completedCount: 0,
          failedCount: 0,
          cancelledCount: 0,
          finished: false,
        }
      : null)
  if (batch && !batchContext) trackAnalytics('batch_started', { batch_id: batch.id })

  const task: GenerationTask = {
    id: operationId,
    trigger: batch ? 'batch' : 'manual',
    batch,
    startedAt: performance.now(),
    stageStartedAt: performance.now(),
    stage: 'text',
    finished: false,
    metrics: {
      text_entered: false,
      tts_entered: false,
      media_entered: false,
      export_entered: false,
      has_bgm: Boolean(randomBgm),
      has_subtitles: subtitlesEnabled,
      resolution_bucket: getResolutionBucket(
        appStore.renderConfig.outputSize.width,
        appStore.renderConfig.outputSize.height,
      ),
      aspect_ratio: getAspectRatio(
        appStore.renderConfig.outputSize.width,
        appStore.renderConfig.outputSize.height,
      ),
      has_effects: false,
    },
  }

  const closeStage = () => {
    const duration = Math.max(0, Math.floor(performance.now() - task.stageStartedAt))
    const key = `${task.stage}_duration_ms`
    task.metrics[key] = Number(task.metrics[key] ?? 0) + duration
  }
  const enterStage = (stage: GenerationStage) => {
    closeStage()
    task.stage = stage
    task.stageStartedAt = performance.now()
    task.metrics[`${stage}_entered`] = true
  }
  const finishTask = (outcome: GenerationOutcome, error?: unknown) => {
    if (task.finished) return
    closeStage()
    task.finished = true
    const eventName = `video_generation_${outcome}` as const
    const data: Record<string, string | number | boolean> = {
      operation_id: task.id,
      trigger: task.trigger,
      ...(task.batch ? { batch_id: task.batch.id } : {}),
      duration_ms: Math.max(0, Math.floor(performance.now() - task.startedAt)),
      ...task.metrics,
    }
    if (outcome === 'failed' || outcome === 'cancelled') {
      data.failed_stage = task.stage
    }
    if (outcome === 'failed') data.error_code = classifyError(error)
    if (task.usage) {
      data.text_source = task.usage.source
      data.llm_call_count = task.usage.callCount
      data.llm_usage_complete = task.usage.usageComplete
      data.provider_category = task.usage.providerCategory
      if (task.usage.protocol) data.protocol = task.usage.protocol
      if (task.usage.inputTokens !== undefined) data.input_tokens = task.usage.inputTokens
      if (task.usage.outputTokens !== undefined) data.output_tokens = task.usage.outputTokens
    }

    trackAnalytics(eventName, data)
    if (task.batch) {
      if (outcome === 'succeeded') task.batch.completedCount += 1
      else if (outcome === 'failed') task.batch.failedCount += 1
      else task.batch.cancelledCount += 1
    }
    if (activeGeneration === task) activeGeneration = null
  }
  task.finish = finishTask

  try {
    trackAnalytics('video_generation_started', {
      operation_id: task.id,
      trigger: task.trigger,
      ...(batch ? { batch_id: batch.id } : {}),
      has_bgm: Boolean(randomBgm),
      has_subtitles: subtitlesEnabled,
      resolution_bucket: task.metrics.resolution_bucket as string,
      aspect_ratio: task.metrics.aspect_ratio as string,
    })
    activeGeneration = task

    // 获取文案
    appStore.updateRenderStatus(RenderStatus.GenerateText)
    task.metrics.text_entered = true
    const text = await TextGenerateInstance.value?.getTextForSynthesis()
    if (task.finished || appStore.renderStatus !== RenderStatus.GenerateText) return
    if (!text) throw new Error('Generated text was empty')
    task.usage = TextGenerateInstance.value?.getGenerationAnalytics?.()
    task.metrics.text_source = task.usage?.source ?? 'unknown'
    task.metrics.llm_call_count = task.usage?.callCount ?? 0
    task.metrics.llm_usage_complete = task.usage?.usageComplete ?? false
    if (task.usage?.inputTokens !== undefined) task.metrics.input_tokens = task.usage.inputTokens
    if (task.usage?.outputTokens !== undefined) task.metrics.output_tokens = task.usage.outputTokens

    // TTS合成语音
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.GenerateText) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.SynthesizedSpeech)
    enterStage('tts')
    task.metrics.tts_characters = text.length
    const ttsController = new AbortController()
    activeTtsSynthesisController = ttsController
    let ttsResult
    try {
      ttsResult = await TtsControlInstance.value?.synthesizedSpeechToFile({
        text,
        withCaption: true,
        abortSignal: ttsController.signal,
      })
    } finally {
      if (activeTtsSynthesisController === ttsController) activeTtsSynthesisController = null
    }
    if (ttsResult?.duration === undefined) {
      throw new Error(t('features.tts.errors.fileCorrupt'))
    }
    if (ttsResult?.duration === 0) {
      throw new Error(t('features.tts.errors.zeroDuration'))
    }
    task.metrics.audio_duration_ms = Math.floor(ttsResult.duration * 1000)
    task.metrics.has_subtitles = subtitlesEnabled && Boolean(ttsResult.srtText)

    // 获取视频片段
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.SynthesizedSpeech) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.SegmentVideo)
    enterStage('media')
    const videoSegments = await VideoManageInstance.value?.getVideoSegments({
      duration: ttsResult.duration,
    })!
    await new Promise((resolve) => setTimeout(resolve, random.integer(1000, 3000)))

    // 合成视频
    // @ts-ignore
    if (appStore.renderStatus !== RenderStatus.SegmentVideo) {
      return
    }
    appStore.updateRenderStatus(RenderStatus.Rendering)
    enterStage('export')
    const renderResult = await window.electron.renderVideo({
      ...videoSegments,
      audioFiles: {
        bgm: randomBgm?.path,
      },
      subtitleText: ttsResult.srtText,
      subtitlesEnabled,
      exportSubtitles,
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

    // 取消会让主进程返回 code 255；不能将它当作完成并继续自动批处理。
    if (task.finished || appStore.renderStatus !== RenderStatus.Rendering) return
    if (renderResult.code !== 0) {
      throw new Error(renderResult.stderr || `FFmpeg exited with code ${renderResult.code}`)
    }

    if (renderResult.subtitleExportError) {
      const message = t('features.render.errors.subtitleExportFailed')
      const detail = `${renderResult.outputPath ?? ''}\n${renderResult.subtitleExportError}`
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
    } else {
      toast.success(t('features.render.success.succeeded'))
    }
    finishTask('succeeded')
    appStore.updateRenderStatus(RenderStatus.Completed)

    if (batch && renderResult.subtitleExportError) {
      finalizeBatch(batch, 'subtitle_export_failed')
    } else if (batch && appStore.autoBatch) {
      toast.info(t('features.render.info.batchNext'))
      TextGenerateInstance.value?.clearOutputText()
      void handleRenderVideo(batch)
    } else if (batch) {
      finalizeBatch(batch, 'completed')
    }
  } catch (error: any) {
    if (task.finished) return
    console.error('视频合成失败:', error)
    finishTask('failed', error)
    if (batch) finalizeBatch(batch, 'generation_failed')
    const errorMessage = error?.error?.message || error?.message || error
    toast.error({
      component: {
        // 使用vnode方式创建自定义错误弹窗实例，以获得良好的类型提示
        render: () =>
          h(ActionToastEmbed, {
            message: t('features.render.errors.failed'),
            detail: String(errorMessage),
            actionText: t('common.buttons.copyErrorDetail'),
            onActionTirgger: () => {
              navigator.clipboard.writeText(
                formatErrorForCopy(t('features.render.errors.failed'), String(errorMessage)),
              )
              toast.success(t('common.messages.success.copySuccess'))
            },
          }),
      },
    })
    appStore.updateRenderStatus(RenderStatus.Failed)
  }
}
const handleCancelRender = () => {
  console.log('视频合成终止')
  const task = activeGeneration
  switch (appStore.renderStatus) {
    case RenderStatus.GenerateText:
      TextGenerateInstance.value?.handleStopGenerate()
      break

    case RenderStatus.SynthesizedSpeech:
      activeTtsSynthesisController?.abort()
      break

    case RenderStatus.SegmentVideo:
      break

    case RenderStatus.Rendering:
      window.ipcRenderer.send('cancel-render-video')
      break

    default:
      break
  }
  if (task) {
    task.finish?.('cancelled')
    if (task.batch) finalizeBatch(task.batch, 'user_cancelled')
  }
  appStore.updateRenderStatus(RenderStatus.None)
  toast.info(t('features.render.info.canceled'))
}
</script>

<style lang="scss" scoped>
.title-bar {
  user-select: none;
}
</style>
