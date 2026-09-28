import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => {
  const handlers = new Map<string, (...args: any[]) => unknown>()
  const listeners = new Map<string, Set<(...args: any[]) => void>>()
  return {
    ipcMain: {
      handlers,
      listeners,
      removeHandler(channel: string) {
        handlers.delete(channel)
      },
      handle(channel: string, handler: (...args: any[]) => unknown) {
        handlers.set(channel, handler)
      },
      on(channel: string, listener: (...args: any[]) => void) {
        const channelListeners = listeners.get(channel) ?? new Set()
        channelListeners.add(listener)
        listeners.set(channel, channelListeners)
      },
      off(channel: string, listener: (...args: any[]) => void) {
        listeners.get(channel)?.delete(listener)
      },
      emit(channel: string, ...args: unknown[]) {
        for (const listener of listeners.get(channel) ?? []) listener(...args)
      },
      listenerCount(channel: string) {
        return listeners.get(channel)?.size ?? 0
      },
    },
  }
})

vi.mock('electron', () => ({ ipcMain: mocks.ipcMain }))

import { defaultSubtitleStyle } from '../../src/effect-engine/default-style'
import {
  executeEffectExportTask,
  registerEffectExportTaskContext,
  setupEffectRendererFrameWriter,
} from '../../electron/effect-engine/export-task-manager'

const createContext = (tempDir: string, taskId = 'task-test') => {
  const framesDir = path.join(tempDir, 'frames')
  const tempPaths = {
    taskRootDir: tempDir,
    framesDir,
    manifestPath: path.join(tempDir, 'manifest.json'),
  }
  const task = {
    taskId,
    output: { framesDir, pattern: 'frame_%06d.png', startNumber: 1 },
    video: { width: 720, height: 1280, fps: 30, durationMs: 2000 },
    subtitleAsset: {
      srtText: '1\n00:00:00,000 --> 00:00:02,000\nhello',
      source: 'manual' as const,
    },
    style: defaultSubtitleStyle,
  }
  return { task, tempPaths, totalFrames: 60 }
}

const createRenderWindow = () => ({ webContents: { send: vi.fn() } })

describe('effect renderer IPC lifecycle', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'short-video-effect-ipc-'))
    fs.mkdirSync(path.join(tempDir, 'frames'))
    mocks.ipcMain.handlers.clear()
    mocks.ipcMain.listeners.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('writes exported frames for registered tasks and rejects stale task ids', async () => {
    const context = createContext(tempDir)
    registerEffectExportTaskContext(context)
    setupEffectRendererFrameWriter()
    const writeFrame = mocks.ipcMain.handlers.get('effect-renderer-write-frame')!
    const pngData = Buffer.from('fake-png-frame')

    await expect(
      writeFrame(
        {},
        {
          taskId: context.task.taskId,
          frameIndex: 7,
          pngBase64: pngData.toString('base64'),
        },
      ),
    ).resolves.toBe(true)
    expect(fs.readFileSync(path.join(tempDir, 'frames', 'frame_000007.png'))).toEqual(pngData)
    await expect(
      writeFrame({}, { taskId: 'stale-task', frameIndex: 8, pngBase64: '' }),
    ).rejects.toThrow('未找到任务上下文: stale-task')
  })

  it('filters task progress, writes the completion manifest, and removes listeners and timers', async () => {
    vi.useFakeTimers()
    const context = createContext(tempDir)
    const renderWindow = createRenderWindow()
    const onProgress = vi.fn()
    const pending = executeEffectExportTask({
      renderWindow: renderWindow as never,
      context,
      onProgress,
    })

    expect(renderWindow.webContents.send).toHaveBeenCalledWith('effect-renderer-export-start', {
      task: context.task,
    })
    mocks.ipcMain.emit(
      'effect-renderer-export-progress',
      {},
      {
        taskId: 'another-task',
        frame: 2,
        totalFrames: 60,
        progress: 50,
      },
    )
    expect(onProgress).not.toHaveBeenCalled()
    mocks.ipcMain.emit(
      'effect-renderer-export-progress',
      {},
      {
        taskId: context.task.taskId,
        frame: 60,
        totalFrames: 60,
        progress: 140,
      },
    )
    expect(onProgress).toHaveBeenCalledWith(100)

    mocks.ipcMain.emit(
      'effect-renderer-export-done',
      {},
      {
        taskId: context.task.taskId,
        frameCount: 60,
      },
    )
    await expect(pending).resolves.toMatchObject({
      taskId: context.task.taskId,
      frameCount: 60,
      width: 720,
      height: 1280,
    })
    expect(JSON.parse(fs.readFileSync(context.tempPaths.manifestPath, 'utf8'))).toMatchObject({
      taskId: context.task.taskId,
      framePattern: 'frame_%06d.png',
    })
    for (const channel of [
      'effect-renderer-export-done',
      'effect-renderer-export-error',
      'effect-renderer-export-progress',
    ]) {
      expect(mocks.ipcMain.listenerCount(channel)).toBe(0)
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('signals cancellation to the render window and removes all pending IPC listeners', async () => {
    vi.useFakeTimers()
    const context = createContext(tempDir)
    const renderWindow = createRenderWindow()
    const controller = new AbortController()
    const pending = executeEffectExportTask({
      renderWindow: renderWindow as never,
      context,
      abortSignal: controller.signal,
    })

    controller.abort()
    await expect(pending).rejects.toMatchObject({ name: 'EffectRendererCancelledError' })
    expect(renderWindow.webContents.send).toHaveBeenCalledWith('effect-renderer-export-cancel', {
      taskId: context.task.taskId,
    })
    for (const channel of [
      'effect-renderer-export-done',
      'effect-renderer-export-error',
      'effect-renderer-export-progress',
    ]) {
      expect(mocks.ipcMain.listenerCount(channel)).toBe(0)
    }
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not send an export task if its signal was already aborted', async () => {
    vi.useFakeTimers()
    const context = createContext(tempDir)
    const renderWindow = createRenderWindow()
    const controller = new AbortController()
    controller.abort()

    await expect(
      executeEffectExportTask({
        renderWindow: renderWindow as never,
        context,
        abortSignal: controller.signal,
      }),
    ).rejects.toMatchObject({ name: 'EffectRendererCancelledError' })
    expect(renderWindow.webContents.send).not.toHaveBeenCalled()
    expect(mocks.ipcMain.listenerCount('effect-renderer-export-done')).toBe(0)
    expect(vi.getTimerCount()).toBe(0)
  })
})
