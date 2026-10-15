// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import { exportFramePng } from '../../src/effect-engine/renderer/png-exporter'

describe('subtitle frame cancellation acknowledgement', () => {
  it.each([true, false])('handles write acknowledgement %s', async (written) => {
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { invoke: vi.fn().mockResolvedValue(written) },
    })
    const exporting = exportFramePng({
      taskId: 'task',
      frameIndex: 1,
      canvas: { toDataURL: () => 'data:image/png;base64,aGVsbG8=' } as HTMLCanvasElement,
    })
    if (written) await expect(exporting).resolves.toBeUndefined()
    else await expect(exporting).rejects.toMatchObject({ name: 'EffectRendererCancelledError' })
  })
})
