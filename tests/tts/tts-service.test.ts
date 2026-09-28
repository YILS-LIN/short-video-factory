import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  getBufferHasMp3FrameHeader: vi.fn(),
  parseBuffer: vi.fn(),
  synthesize: vi.fn(),
  tempDir: '',
}))

vi.mock('electron', () => ({ app: { on: vi.fn() } }))
vi.mock('music-metadata', () => ({ parseBuffer: mocks.parseBuffer }))
vi.mock('../../electron/lib/tools', () => ({ getAppTempPath: () => mocks.tempDir }))
vi.mock('../../electron/lib/edge-tts', () => ({
  EdgeTTS: class {
    synthesize(...args: unknown[]) {
      return mocks.synthesize(...args)
    }
  },
  hasMp3FrameHeader: (buffer: Buffer) => mocks.getBufferHasMp3FrameHeader(buffer),
}))

import { edgeTtsSynthesizeToFile, getTempTtsVoiceFilePath } from '../../electron/tts'

const createSynthesisResult = (audioBuffer: Buffer, options?: { failWrite?: boolean }) => ({
  getBuffer: () => audioBuffer,
  getCaptionSrtString: () => '1\n00:00:00,000 --> 00:00:02,000\ncaption\n',
  toFile: vi.fn(async (filePath: string) => {
    fs.writeFileSync(filePath, audioBuffer)
    if (options?.failWrite) throw new Error('Disk write failed')
  }),
})

describe('EdgeTTS file synthesis', () => {
  let tempDir: string

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'short-video-tts-test-'))
    mocks.tempDir = tempDir
    mocks.getBufferHasMp3FrameHeader.mockReset()
    mocks.getBufferHasMp3FrameHeader.mockReturnValue(true)
    mocks.parseBuffer.mockReset()
    mocks.parseBuffer.mockResolvedValue({ format: { duration: 2 } })
    mocks.synthesize.mockReset()
    mocks.synthesize.mockResolvedValue(createSynthesisResult(Buffer.alloc(1024)))
  })

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true })
  })

  it('writes validated MP3 and subtitle outputs and returns the parsed duration', async () => {
    const result = await edgeTtsSynthesizeToFile({
      text: 'Hello',
      voice: 'en-US-Test',
      options: { rate: 5 },
      withCaption: true,
    })

    const voicePath = getTempTtsVoiceFilePath()
    const subtitlePath = voicePath.replace(/\.mp3$/i, '.srt')
    expect(mocks.synthesize).toHaveBeenCalledWith('Hello', 'en-US-Test', { rate: 5 }, undefined)
    expect(result).toEqual({
      duration: 2,
      srtText: '1\n00:00:00,000 --> 00:00:02,000\ncaption\n',
    })
    expect(fs.readFileSync(voicePath)).toHaveLength(1024)
    expect(fs.readFileSync(subtitlePath, 'utf8')).toContain('caption')
  })

  it('uses the CBR duration fallback if metadata parsing fails', async () => {
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    mocks.parseBuffer.mockRejectedValue(new Error('metadata parse failed'))
    mocks.synthesize.mockResolvedValue(createSynthesisResult(Buffer.alloc(6000)))

    const result = await edgeTtsSynthesizeToFile({
      text: 'Hello',
      voice: 'en-US-Test',
      options: {},
    })

    expect(result.duration).toBe(1)
    expect(consoleWarn).toHaveBeenCalledWith(
      '[EdgeTTS] duration-cbr-fallback-used',
      expect.objectContaining({ duration: 1 }),
    )
  })

  it('rejects an invalid MP3 response before writing output', async () => {
    mocks.getBufferHasMp3FrameHeader.mockReturnValue(false)
    const synthesisResult = createSynthesisResult(Buffer.alloc(1024))
    mocks.synthesize.mockResolvedValue(synthesisResult)

    await expect(
      edgeTtsSynthesizeToFile({ text: 'Hello', voice: 'en-US-Test', options: {} }),
    ).rejects.toThrow('不包含有效 MP3 帧')
    expect(fs.existsSync(getTempTtsVoiceFilePath())).toBe(false)
    expect(synthesisResult.toFile).not.toHaveBeenCalled()
  })

  it('removes a partial audio file if writing the result fails', async () => {
    mocks.synthesize.mockResolvedValue(
      createSynthesisResult(Buffer.alloc(1024), { failWrite: true }),
    )

    await expect(
      edgeTtsSynthesizeToFile({
        text: 'Hello',
        voice: 'en-US-Test',
        options: {},
        withCaption: true,
      }),
    ).rejects.toThrow('Disk write failed')

    expect(fs.existsSync(getTempTtsVoiceFilePath())).toBe(false)
    expect(fs.existsSync(getTempTtsVoiceFilePath().replace(/\.mp3$/i, '.srt'))).toBe(false)
  })

  it('passes cancellation through and does not write output after the request is aborted', async () => {
    const controller = new AbortController()
    mocks.synthesize.mockImplementation(
      (_text: string, _voice: string, _options: unknown, signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              const error = new Error('cancelled')
              error.name = 'AbortError'
              reject(error)
            },
            { once: true },
          )
        }),
    )
    const synthesis = edgeTtsSynthesizeToFile({
      text: 'Hello',
      voice: 'en-US-Test',
      options: {},
      abortSignal: controller.signal,
    })

    await vi.waitFor(() => expect(mocks.synthesize).toHaveBeenCalledTimes(1))
    controller.abort()

    await expect(synthesis).rejects.toMatchObject({ name: 'AbortError' })
    expect(fs.existsSync(getTempTtsVoiceFilePath())).toBe(false)
  })

  it('removes audio already written if cancellation arrives before synthesis finalizes', async () => {
    const controller = new AbortController()
    let finishWrite!: () => void
    const writeGate = new Promise<void>((resolve) => {
      finishWrite = resolve
    })
    const result = createSynthesisResult(Buffer.alloc(1024))
    result.toFile = vi.fn(async (filePath: string) => {
      fs.writeFileSync(filePath, Buffer.alloc(1024))
      await writeGate
    })
    mocks.synthesize.mockResolvedValue(result)

    const synthesis = edgeTtsSynthesizeToFile({
      text: 'Hello',
      voice: 'en-US-Test',
      options: {},
      withCaption: true,
      abortSignal: controller.signal,
    })
    await vi.waitFor(() => expect(result.toFile).toHaveBeenCalledTimes(1))
    controller.abort()
    finishWrite()

    await expect(synthesis).rejects.toMatchObject({ name: 'AbortError' })
    expect(fs.existsSync(getTempTtsVoiceFilePath())).toBe(false)
    expect(fs.existsSync(getTempTtsVoiceFilePath().replace(/\.mp3$/i, '.srt'))).toBe(false)
  })
})
