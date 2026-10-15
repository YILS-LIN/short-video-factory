export async function exportFramePng(params: {
  taskId: string
  frameIndex: number
  canvas: HTMLCanvasElement
}) {
  const { taskId, frameIndex, canvas } = params
  const dataUrl = canvas.toDataURL('image/png')
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')

  const written = await window.ipcRenderer.invoke('effect-renderer-write-frame', {
    taskId,
    frameIndex,
    pngBase64: base64,
  })
  if (written === false) {
    const error = new Error('字幕导出已取消')
    error.name = 'EffectRendererCancelledError'
    throw error
  }
}
