import type { SubtitleRendererTask } from '../shared/types'
import { renderSubtitleFrames } from './frame-renderer'

let currentTaskId: string | null = null
let cancelledTaskIds = new Set<string>()
let bootstrapped = false
let activeStartTaskId: string | null = null

function isCancelled(taskId: string): boolean {
  return cancelledTaskIds.has(taskId)
}

export function bootstrapEffectRenderer() {
  if (bootstrapped) {
    return
  }
  bootstrapped = true

  window.ipcRenderer.on('effect-renderer-export-init', (_event, payload: { taskId: string }) => {
    currentTaskId = payload.taskId
    window.ipcRenderer.send('effect-renderer-export-ready', payload)
  })

  window.ipcRenderer.on('effect-renderer-export-cancel', (_event, payload: { taskId: string }) => {
    cancelledTaskIds.add(payload.taskId)
  })

  window.ipcRenderer.on(
    'effect-renderer-export-start',
    async (_event, payload: { task: SubtitleRendererTask }) => {
      const task = payload.task

      // 主进程可能为了防止消息丢失而重发 START，这里对同一个进行中的 task 做幂等保护。
      if (activeStartTaskId === task.taskId) {
        return
      }

      currentTaskId = task.taskId
      cancelledTaskIds.delete(task.taskId)
      activeStartTaskId = task.taskId

      try {
        await renderSubtitleFramesWithCancel(task)
      } catch (error) {
        window.ipcRenderer.send('effect-renderer-export-error', {
          taskId: task.taskId,
          message: error instanceof Error ? error.message : String(error),
        })
      } finally {
        if (activeStartTaskId === task.taskId) {
          activeStartTaskId = null
        }
      }
    },
  )
}

async function renderSubtitleFramesWithCancel(task: SubtitleRendererTask) {
  try {
    if (isCancelled(task.taskId)) {
      throw new Error('字幕导出已取消')
    }
    await renderSubtitleFrames(task, () => isCancelled(task.taskId))
  } finally {
    cancelledTaskIds.delete(task.taskId)
    if (currentTaskId === task.taskId) {
      currentTaskId = null
    }
  }
}
