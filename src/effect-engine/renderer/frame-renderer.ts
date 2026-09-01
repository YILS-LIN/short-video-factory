import { buildSubtitleLayout } from './subtitle-render-runtime'
import { parseSrtToCues } from '../shared/subtitle-srt'
import type { SubtitleRendererTask } from '../shared/types'
import { createPixiApp } from './pixi-stage-factory'
import { exportFramePng } from './png-exporter'
import { renderSubtitleFrame } from './subtitle-render-runtime'

export async function renderSubtitleFrames(
  task: SubtitleRendererTask,
  isCancelled?: () => boolean,
) {
  const { app, root } = await createPixiApp({ width: task.video.width, height: task.video.height })
  const canvas = app.canvas as HTMLCanvasElement
  const canvasHost = document.getElementById('effect-renderer-canvas-host')
  canvasHost?.replaceChildren(canvas)
  const measureCanvas = document.createElement('canvas')
  const context = measureCanvas.getContext('2d')
  if (!context) throw new Error('无法创建字幕测量画布')

  const cues = buildSubtitleLayout({
    cues: parseSrtToCues(task.subtitleAsset.srtText),
    style: task.style,
    videoWidth: task.video.width,
    measure: (text, fontSize) => {
      context.font = `${task.style.fontWeight} ${fontSize}px ${task.style.fontFamily}`
      return context.measureText(text).width
    },
  })
  const totalFrames = Math.max(1, Math.ceil((task.video.durationMs / 1000) * task.video.fps))

  try {
    for (let frameIndex = 1; frameIndex <= totalFrames; frameIndex += 1) {
      if (isCancelled?.()) throw new Error('字幕导出已取消')
      renderSubtitleFrame({
        root,
        cues,
        style: task.style,
        timeMs: Math.floor(((frameIndex - 1) / task.video.fps) * 1000),
        width: task.video.width,
        height: task.video.height,
      })
      app.render()
      await exportFramePng({ taskId: task.taskId, frameIndex, canvas })
      window.ipcRenderer.send('effect-renderer-export-progress', {
        taskId: task.taskId,
        frame: frameIndex,
        totalFrames,
        progress: Math.floor((frameIndex / totalFrames) * 100),
      })
    }
    window.ipcRenderer.send('effect-renderer-export-done', {
      taskId: task.taskId,
      frameCount: totalFrames,
    })
  } finally {
    app.destroy(true, { children: true })
    canvasHost?.replaceChildren()
  }
}
