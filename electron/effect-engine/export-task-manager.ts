import fs from 'node:fs'
import path from 'node:path'
import { ipcMain, type BrowserWindow } from 'electron'
import type {
  SubtitleRendererManifest,
  SubtitleRendererTask,
} from '../../src/effect-engine/shared/types'
import type { EffectTempTaskPaths } from './temp-file-manager'

interface ExportTaskContext {
  task: SubtitleRendererTask
  tempPaths: EffectTempTaskPaths
  totalFrames: number
}

const contextMap = new Map<string, ExportTaskContext>()

export class EffectRendererCancelledError extends Error {
  constructor(message: string = '字幕导出已取消') {
    super(message)
    this.name = 'EffectRendererCancelledError'
  }
}

export function registerEffectExportTaskContext(context: ExportTaskContext) {
  contextMap.set(context.task.taskId, context)
}

export function unregisterEffectExportTaskContext(taskId: string) {
  contextMap.delete(taskId)
}

export function setupEffectRendererFrameWriter() {
  ipcMain.removeHandler('effect-renderer-write-frame')
  ipcMain.handle(
    'effect-renderer-write-frame',
    async (_event, payload: { taskId: string; frameIndex: number; pngBase64: string }) => {
      const context = contextMap.get(payload.taskId)
      if (!context) {
        throw new Error(`未找到任务上下文: ${payload.taskId}`)
      }

      const fileName = context.task.output.pattern.replace(
        '%06d',
        String(payload.frameIndex).padStart(6, '0'),
      )
      const outputPath = path.join(context.tempPaths.framesDir, fileName)
      const buffer = Buffer.from(payload.pngBase64, 'base64')
      await fs.promises.writeFile(outputPath, buffer)
      return true
    },
  )
}

export async function executeEffectExportTask(params: {
  renderWindow: BrowserWindow
  context: ExportTaskContext
  onProgress?: (progress: number) => void
  abortSignal?: AbortSignal
}): Promise<SubtitleRendererManifest> {
  const { renderWindow, context, onProgress, abortSignal } = params
  const { task } = context

  return new Promise((resolve, reject) => {
    let done = false
    let startRetryTimer: NodeJS.Timeout | null = null
    let firstResponseTimer: NodeJS.Timeout | null = null

    const sendStart = () => {
      renderWindow.webContents.send('effect-renderer-export-start', { task })
    }

    const finish = (handler: () => void) => {
      if (done) {
        return
      }
      done = true
      cleanup()
      handler()
    }

    const onDone = (_event: unknown, payload: { taskId: string; frameCount: number }) => {
      if (payload?.taskId !== task.taskId) {
        return
      }
      if (firstResponseTimer) {
        clearTimeout(firstResponseTimer)
        firstResponseTimer = null
      }

      const manifest: SubtitleRendererManifest = {
        taskId: task.taskId,
        framesDir: context.tempPaths.framesDir,
        framePattern: task.output.pattern,
        frameCount: payload.frameCount,
        fps: task.video.fps,
        startNumber: task.output.startNumber,
        width: task.video.width,
        height: task.video.height,
      }
      fs.writeFileSync(context.tempPaths.manifestPath, JSON.stringify(manifest, null, 2), 'utf8')

      finish(() => resolve(manifest))
    }

    const onError = (_event: unknown, payload: { taskId: string; message: string }) => {
      if (payload?.taskId !== task.taskId) {
        return
      }
      if (firstResponseTimer) {
        clearTimeout(firstResponseTimer)
        firstResponseTimer = null
      }
      finish(() => reject(new Error(payload.message || '字幕导出失败')))
    }

    const onProgressMessage = (
      _event: unknown,
      payload: { taskId: string; frame: number; totalFrames: number; progress: number },
    ) => {
      if (payload?.taskId !== task.taskId) {
        return
      }
      if (firstResponseTimer) {
        clearTimeout(firstResponseTimer)
        firstResponseTimer = null
      }
      if (startRetryTimer) {
        clearInterval(startRetryTimer)
        startRetryTimer = null
      }
      onProgress?.(Math.max(0, Math.min(100, Math.round(payload.progress))))
    }

    const onAbort = () => {
      // 取消链路：主进程发取消信号 -> 隐藏窗口停止逐帧导出 -> 主进程返回 cancelled。
      renderWindow.webContents.send('effect-renderer-export-cancel', { taskId: task.taskId })
      finish(() => reject(new EffectRendererCancelledError()))
    }

    const cleanup = () => {
      if (startRetryTimer) {
        clearInterval(startRetryTimer)
      }
      if (firstResponseTimer) {
        clearTimeout(firstResponseTimer)
      }
      ipcMain.off('effect-renderer-export-done', onDone)
      ipcMain.off('effect-renderer-export-error', onError)
      ipcMain.off('effect-renderer-export-progress', onProgressMessage)
      abortSignal?.removeEventListener('abort', onAbort)
    }

    ipcMain.on('effect-renderer-export-done', onDone)
    ipcMain.on('effect-renderer-export-error', onError)
    ipcMain.on('effect-renderer-export-progress', onProgressMessage)
    abortSignal?.addEventListener('abort', onAbort, { once: true })

    sendStart()
    // 关键点：如果首个 START 因时序问题丢失，持续重发直到收到进度/完成/错误。
    startRetryTimer = setInterval(sendStart, 500)
    firstResponseTimer = setTimeout(() => {
      finish(() => reject(new Error('隐藏渲染窗口未响应导出任务')))
    }, 20000)
  })
}
