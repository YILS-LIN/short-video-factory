import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  handlers: new Map<string, (...args: any[]) => unknown>(),
  listeners: new Map<string, (...args: any[]) => void>(),
  edgeTtsSynthesizeToFile: vi.fn(),
  renderVideo: vi.fn(),
  ipcOff: vi.fn(),
}))

vi.mock('electron', () => ({
  BrowserWindow: { fromWebContents: vi.fn() },
  app: { getVersion: vi.fn(() => 'test') },
  dialog: { showOpenDialog: vi.fn() },
  ipcMain: {
    handle: (channel: string, handler: (...args: any[]) => unknown) =>
      mocks.handlers.set(channel, handler),
    on: (channel: string, listener: (...args: any[]) => void) =>
      mocks.listeners.set(channel, listener),
    off: (...args: unknown[]) => mocks.ipcOff(...args),
    removeHandler: vi.fn(),
  },
  shell: { openExternal: vi.fn() },
}))
vi.mock('../../electron/sqlite', () => ({
  sqBulkInsertOrUpdate: vi.fn(),
  sqDelete: vi.fn(),
  sqInsert: vi.fn(),
  sqQuery: vi.fn(),
  sqUpdate: vi.fn(),
}))
vi.mock('../../electron/tts', () => ({
  edgeTtsGetVoiceList: vi.fn(),
  edgeTtsSynthesizeToBase64: vi.fn(),
  edgeTtsSynthesizeToFile: (...args: unknown[]) => mocks.edgeTtsSynthesizeToFile(...args),
}))
vi.mock('../../electron/ffmpeg', () => ({
  renderVideo: (...args: unknown[]) => mocks.renderVideo(...args),
}))
vi.mock('../../electron/lib/stat', () => ({ sendStatEvent: vi.fn() }))
vi.mock('../../electron/diagnostics', () => ({ exportDiagnostics: vi.fn() }))
vi.mock('../../electron/logger', () => ({ AppLogLevel: {}, writeRendererLog: vi.fn() }))
vi.mock('../../electron/updater', () => ({ checkForUpdates: vi.fn() }))
vi.mock('../../electron/effect-engine/export-task-manager', () => ({
  setupEffectRendererFrameWriter: vi.fn(),
}))

import initIPC from '../../electron/ipc'

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('TTS IPC cancellation routing', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.listeners.clear()
    initIPC()
  })

  it('aborts only the matching synthesis request from the same renderer', async () => {
    const deferred = createDeferred<{ duration: number }>()
    mocks.edgeTtsSynthesizeToFile.mockImplementation(
      (_params: unknown & { abortSignal: AbortSignal }) => deferred.promise,
    )
    const synthesize = mocks.handlers.get('edge-tts-synthesize-to-file')!
    const cancel = mocks.listeners.get('cancel-edge-tts-synthesis')!
    const rendererA = { id: 11, send: vi.fn() }
    const rendererB = { id: 22, send: vi.fn() }
    const pending = synthesize(
      { sender: rendererA },
      { text: 'hello', voice: 'en-US-Test', options: {}, requestId: 'request-a' },
    ) as Promise<{ duration: number }>

    const passedParams = mocks.edgeTtsSynthesizeToFile.mock.calls[0][0] as {
      requestId: string
      abortSignal: AbortSignal
    }
    expect(passedParams.requestId).toBe('request-a')
    expect(passedParams.abortSignal.aborted).toBe(false)

    cancel({ sender: rendererB }, 'request-a')
    cancel({ sender: rendererA }, 'different-request')
    expect(passedParams.abortSignal.aborted).toBe(false)

    cancel({ sender: rendererA }, 'request-a')
    expect(passedParams.abortSignal.aborted).toBe(true)

    deferred.resolve({ duration: 2 })
    await expect(pending).resolves.toEqual({ duration: 2 })
    cancel({ sender: rendererA }, 'request-a')
    expect(passedParams.abortSignal.aborted).toBe(true)
  })

  it('keeps legacy requests without request ids callable', async () => {
    mocks.edgeTtsSynthesizeToFile.mockResolvedValue({ duration: 1 })
    const synthesize = mocks.handlers.get('edge-tts-synthesize-to-file')!

    await expect(
      synthesize(
        { sender: { id: 3, send: vi.fn() } },
        { text: 'hello', voice: 'en-US-Test', options: {} },
      ),
    ).resolves.toEqual({ duration: 1 })
    expect(mocks.edgeTtsSynthesizeToFile).toHaveBeenCalledWith({
      text: 'hello',
      voice: 'en-US-Test',
      options: {},
    })
  })
})

describe('render and file-list IPC boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.handlers.clear()
    mocks.listeners.clear()
    initIPC()
  })

  it('routes render progress and cancellation to the owning renderer and removes listeners', async () => {
    const deferred = createDeferred<{ stdout: string; stderr: string; code: number }>()
    mocks.renderVideo.mockImplementation(() => deferred.promise)
    const render = mocks.handlers.get('render-video')!
    const rendererA = { id: 31, send: vi.fn() }
    const rendererB = { id: 32, send: vi.fn() }
    const pending = render(
      { sender: rendererA },
      { videoFiles: ['video.mp4'], timeRanges: [['0', '1']] },
    ) as Promise<{ code: number }>

    const renderParams = mocks.renderVideo.mock.calls[0][0] as {
      abortSignal: AbortSignal
      onProgress: (progress: number) => void
    }
    const cancel = mocks.listeners.get('cancel-render-video')!
    expect(renderParams.abortSignal.aborted).toBe(false)
    renderParams.onProgress(42)
    expect(rendererA.send).toHaveBeenCalledWith('render-video-progress', 42)
    expect(rendererB.send).not.toHaveBeenCalled()

    cancel({ sender: rendererB })
    expect(renderParams.abortSignal.aborted).toBe(false)
    cancel({ sender: rendererA })
    expect(renderParams.abortSignal.aborted).toBe(true)

    deferred.resolve({ stdout: '', stderr: 'cancelled', code: 255 })
    await expect(pending).resolves.toMatchObject({ code: 255 })
    expect(mocks.ipcOff).toHaveBeenCalledWith('cancel-render-video', cancel)
  })

  it('returns only files from the selected folder and propagates missing-folder errors', async () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'short-video-ipc-files-'))
    const nestedDir = path.join(tempDir, 'nested')
    fs.mkdirSync(nestedDir)
    fs.writeFileSync(path.join(tempDir, 'scene one.mp4'), 'video')
    fs.writeFileSync(path.join(nestedDir, 'ignored.mp4'), 'nested')
    const listFiles = mocks.handlers.get('list-files-from-folder')!

    try {
      await expect(listFiles({}, { folderPath: tempDir })).resolves.toEqual([
        {
          name: 'scene one.mp4',
          path: path.join(tempDir, 'scene one.mp4').replace(/\\/g, '/'),
        },
      ])

      await expect(
        listFiles({}, { folderPath: path.join(tempDir, 'missing') }),
      ).rejects.toMatchObject({ code: 'ENOENT' })
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true })
    }
  })
})
