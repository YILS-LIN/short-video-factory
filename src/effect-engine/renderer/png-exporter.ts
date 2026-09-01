export async function exportFramePng(params: {
  taskId: string
  frameIndex: number
  canvas: HTMLCanvasElement
}) {
  const { taskId, frameIndex, canvas } = params
  const dataUrl = canvas.toDataURL('image/png')
  const base64 = dataUrl.replace(/^data:image\/png;base64,/, '')

  await window.ipcRenderer.invoke('effect-renderer-write-frame', {
    taskId,
    frameIndex,
    pngBase64: base64,
  })
}
