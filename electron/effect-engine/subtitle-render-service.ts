import fs from 'node:fs'
import path from 'node:path'
import {
  EffectRendererCancelledError,
  executeEffectExportTask,
  registerEffectExportTaskContext,
  unregisterEffectExportTaskContext,
} from './export-task-manager'
import { createEffectTaskTempPaths, cleanupEffectTaskTempPaths } from './temp-file-manager'
import { destroyEffectRenderWindow, ensureEffectRenderWindow } from './render-window-manager'
import { defaultSubtitleStyle } from '../../src/effect-engine/default-style'
import type {
  SubtitleAsset,
  SubtitleRendererManifest,
  SubtitleStyleConfig,
} from '../../src/effect-engine/shared/types'

function resolveStyle(style?: Partial<SubtitleStyleConfig>): SubtitleStyleConfig {
  const merged = { ...defaultSubtitleStyle, ...style }
  return {
    ...merged,
    offsetX: Math.max(-1200, Math.min(1200, Math.round(merged.offsetX))),
    offsetY: Math.max(-1200, Math.min(1200, Math.round(merged.offsetY))),
    safeAreaBottomRatio: Math.max(0, Math.min(0.5, merged.safeAreaBottomRatio)),
    maxWidthRatio: Math.max(0.2, Math.min(1, merged.maxWidthRatio)),
    maxLines: merged.maxLines === 1 ? 1 : 2,
    fontSize: Math.max(16, Math.min(220, Math.round(merged.fontSize))),
    minFontSize: Math.max(12, Math.min(merged.fontSize, Math.round(merged.minFontSize))),
    strokeWidth: Math.max(0, Math.min(12, merged.strokeWidth)),
  }
}

function createTaskId() {
  return `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export async function renderSubtitleFramesToPngSequence(params: {
  subtitleAsset: SubtitleAsset
  outputSize: { width: number; height: number }
  fps: number
  durationMs: number
  style?: Partial<SubtitleStyleConfig>
  onProgress?: (progress: number) => void
  abortSignal?: AbortSignal
}): Promise<{ manifest: SubtitleRendererManifest; cleanup: () => void }> {
  const taskId = createTaskId()
  const tempPaths = createEffectTaskTempPaths(taskId)

  const style = resolveStyle(params.style)

  const task = {
    taskId,
    output: {
      framesDir: tempPaths.framesDir,
      pattern: 'frame_%06d.png',
      startNumber: 1,
    },
    video: {
      width: params.outputSize.width,
      height: params.outputSize.height,
      fps: params.fps,
      durationMs: params.durationMs,
    },
    subtitleAsset: params.subtitleAsset,
    style,
  }

  registerEffectExportTaskContext({
    task,
    tempPaths,
    totalFrames: Math.max(1, Math.ceil((params.durationMs / 1000) * params.fps)),
  })

  try {
    const renderWindow = await ensureEffectRenderWindow()

    // 关键链路：通过隐藏渲染窗口逐帧导出透明 PNG，主进程只做调度和落盘管理。
    const manifest = await executeEffectExportTask({
      renderWindow,
      context: {
        task,
        tempPaths,
        totalFrames: Math.max(1, Math.ceil((params.durationMs / 1000) * params.fps)),
      },
      onProgress: params.onProgress,
      abortSignal: params.abortSignal,
    })

    return {
      manifest,
      cleanup: () => cleanupEffectTaskTempPaths(tempPaths),
    }
  } catch (error) {
    cleanupEffectTaskTempPaths(tempPaths)
    throw error
  } finally {
    unregisterEffectExportTaskContext(taskId)
    // 每次任务结束都销毁渲染窗口，避免长期占用 GPU/内存，并确保下一次任务干净重建。
    destroyEffectRenderWindow()
  }
}

export function isEffectRenderCancelledError(
  error: unknown,
): error is EffectRendererCancelledError {
  return error instanceof EffectRendererCancelledError
}

export function tryReadManifest(manifestPath: string): SubtitleRendererManifest | null {
  try {
    if (!fs.existsSync(manifestPath)) {
      return null
    }
    const content = fs.readFileSync(path.normalize(manifestPath), 'utf8')
    return JSON.parse(content) as SubtitleRendererManifest
  } catch {
    return null
  }
}
