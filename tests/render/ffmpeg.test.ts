import { EventEmitter } from 'node:events'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  spawn: vi.fn(),
  ttsVoicePath: '',
}))

vi.mock('child_process', () => ({ spawn: mocks.spawn }))
vi.mock('../../electron/tts', () => ({
  getTempTtsVoiceFilePath: () => mocks.ttsVoicePath,
}))
vi.mock('../../electron/lib/tools', () => ({
  generateUniqueFileName: (filePath: string) => filePath,
}))
vi.mock('../../electron/effect-engine/subtitle-render-service', () => ({
  isEffectRenderCancelledError: (error: unknown) =>
    error instanceof Error && error.name === 'EffectRendererCancelledError',
  renderSubtitleFramesToPngSequence: vi.fn(),
}))

import { executeFFmpeg, renderVideo } from '../../electron/ffmpeg'

const createChildProcess = () => {
  const child = Object.assign(new EventEmitter(), {
    kill: vi.fn(),
    stderr: new EventEmitter(),
    stdout: new EventEmitter(),
  })
  mocks.spawn.mockReturnValue(child)
  return child
}

describe('FFmpeg execution and render inputs', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'short-video-ffmpeg-test-'))
    mocks.ttsVoicePath = path.join(tempDir, 'generated voice.mp3')
    mocks.spawn.mockReset()
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('keeps paths with spaces as intact FFmpeg argv values and preserves caller-owned inputs', async () => {
    const videoPath = path.join(tempDir, 'video assets', 'scene one.mp4')
    const voicePath = path.join(tempDir, 'voice input.mp3')
    const bgmPath = path.join(tempDir, 'music assets', 'background track.mp3')
    const subtitlePath = path.join(tempDir, 'subtitle assets', 'caption file.srt')
    for (const filePath of [videoPath, voicePath, bgmPath, subtitlePath]) {
      fs.mkdirSync(path.dirname(filePath), { recursive: true })
      fs.writeFileSync(filePath, 'input')
    }
    const outputPath = path.join(tempDir, 'render output', 'my video.mp4')
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
    const child = createChildProcess()

    const render = renderVideo({
      videoFiles: [videoPath],
      timeRanges: [['1.000', '9.000']],
      audioFiles: { voice: voicePath, bgm: bgmPath },
      subtitleFile: subtitlePath,
      outputSize: { width: 720, height: 1280 },
      outputDuration: '8',
      outputPath,
    })

    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1))
    const args = mocks.spawn.mock.calls[0][1] as string[]
    const inputPaths = args.flatMap((arg, index) => (arg === '-i' ? [args[index + 1]] : []))
    expect(inputPaths).toEqual([videoPath, voicePath, bgmPath])
    expect(args.at(-1)).toBe(outputPath)
    expect(args[args.indexOf('-s') + 1]).toBe('720x1280')
    expect(args[args.indexOf('-filter_complex') + 1]).toContain(subtitlePath.replace(/:/g, '\\\\:'))

    child.emit('close', 0)
    await expect(render).resolves.toMatchObject({ code: 0 })
    for (const filePath of [videoPath, voicePath, bgmPath, subtitlePath]) {
      expect(fs.existsSync(filePath), `expected caller input to remain: ${filePath}`).toBe(true)
    }
  })

  it('removes generated voice and subtitle files when the render fails', async () => {
    const voicePath = mocks.ttsVoicePath
    const subtitlePath = voicePath.replace(/\.mp3$/i, '.srt')
    fs.writeFileSync(voicePath, 'generated audio')
    fs.writeFileSync(subtitlePath, 'generated captions')
    fs.mkdirSync(path.join(tempDir, 'output'), { recursive: true })
    const child = createChildProcess()

    const render = renderVideo({
      videoFiles: [path.join(tempDir, 'scene.mp4')],
      timeRanges: [['0', '4']],
      outputSize: { width: 1080, height: 1920 },
      outputDuration: '4',
      outputPath: path.join(tempDir, 'output', 'failed.mp4'),
    })

    await vi.waitFor(() => expect(mocks.spawn).toHaveBeenCalledTimes(1))
    child.emit('close', 1)
    await expect(render).rejects.toThrow('FFmpeg exited with code 1')
    expect(fs.existsSync(voicePath)).toBe(false)
    expect(fs.existsSync(subtitlePath)).toBe(false)
  })

  it('terminates FFmpeg on cancellation and removes the abort listener after exit', async () => {
    const child = createChildProcess()
    const controller = new AbortController()
    const removeEventListener = vi.spyOn(controller.signal, 'removeEventListener')
    const execution = executeFFmpeg(['-i', 'input.mp4', 'output.mp4'], {
      abortSignal: controller.signal,
    })

    controller.abort()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    child.emit('close', 255)
    await expect(execution).rejects.toThrow('FFmpeg exited with code 255')
    expect(removeEventListener).toHaveBeenCalledWith('abort', expect.any(Function))
  })

  it('does not spawn FFmpeg for a signal that was already aborted', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      executeFFmpeg(['-i', 'input.mp4', 'output.mp4'], { abortSignal: controller.signal }),
    ).rejects.toThrow()
    expect(mocks.spawn).not.toHaveBeenCalled()
  })

  it('reports monotonically increasing progress and completes at 100 percent', async () => {
    const child = createChildProcess()
    const onProgress = vi.fn()
    const execution = executeFFmpeg(['-i', 'input.mp4', 'output.mp4'], {
      durationSeconds: 10,
      onProgress,
    })

    child.stdout.emit('data', Buffer.from('out_time_ms=5000000\n'))
    child.stdout.emit('data', Buffer.from('out_time_ms=3000000\n'))
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([50])
    child.emit('close', 0)

    await expect(execution).resolves.toMatchObject({ code: 0 })
    expect(onProgress.mock.calls.map(([progress]) => progress)).toEqual([50, 100])
  })
})
