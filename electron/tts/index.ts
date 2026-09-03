import fs from 'node:fs'
import path from 'node:path'
import { EdgeTTS, hasMp3FrameHeader } from '../lib/edge-tts'
import { parseBuffer } from 'music-metadata'
import {
  EdgeTtsSynthesizeCommonParams,
  EdgeTtsSynthesizeToFileParams,
  EdgeTtsSynthesizeToFileResult,
} from './types'
import { getAppTempPath } from '../lib/tools'
import { app } from 'electron'

const edgeTts = new EdgeTTS()
const setupTime = new Date().getTime()
const EDGE_TTS_CBR_BITS_PER_SECOND = 48_000

function getCbrDuration(buffer: Buffer): number | undefined {
  if (buffer.length === 0 || !hasMp3FrameHeader(buffer)) return undefined

  const duration = (buffer.length * 8) / EDGE_TTS_CBR_BITS_PER_SECOND
  return Number.isFinite(duration) && duration > 0 ? duration : undefined
}

export function getTempTtsVoiceFilePath() {
  return path.join(getAppTempPath(), `temp-tts-voice-${setupTime}.mp3`).replace(/\\/g, '/')
}

export function clearCurrentTtsFiles() {
  const voicePath = getTempTtsVoiceFilePath()
  if (fs.existsSync(voicePath)) {
    fs.unlinkSync(voicePath)
  }
  const srtPath = path.join(path.dirname(voicePath), path.basename(voicePath, '.mp3') + '.srt')
  if (fs.existsSync(srtPath)) {
    fs.unlinkSync(srtPath)
  }
}

app.on('before-quit', () => {
  clearCurrentTtsFiles()
})

export function edgeTtsGetVoiceList() {
  return edgeTts.getVoices()
}

export async function edgeTtsSynthesizeToBase64(params: EdgeTtsSynthesizeCommonParams) {
  const { text, voice, options } = params
  const result = await edgeTts.synthesize(text, voice, options)
  return result.toBase64()
}

export async function edgeTtsSynthesizeToFile(
  params: EdgeTtsSynthesizeToFileParams,
): Promise<EdgeTtsSynthesizeToFileResult> {
  const { text, voice, options, withCaption } = params
  const result = await edgeTts.synthesize(text, voice, options)
  const audioBuffer = result.getBuffer()

  if (audioBuffer.length === 0) {
    throw new Error(`EdgeTTS 未收到 audio 数据：voice=${voice}, textLength=${text.length}`)
  }
  if (!hasMp3FrameHeader(audioBuffer)) {
    throw new Error(
      `EdgeTTS 收到 audio 但 Buffer 不包含有效 MP3 帧：voice=${voice}, textLength=${text.length}, audioBytes=${audioBuffer.length}`,
    )
  }

  // EdgeTTS 固定返回 48 kbps CBR MP3; metadata parser failures should not discard valid audio.
  let duration = 0
  let metadataError: string | undefined
  try {
    const metadata = await parseBuffer(audioBuffer, { mimeType: 'audio/mpeg' })
    duration = metadata.format?.duration ?? 0
  } catch (error) {
    metadataError = error instanceof Error ? error.message : String(error)
  }

  if (!Number.isFinite(duration) || duration <= 0) {
    const fallbackDuration = getCbrDuration(audioBuffer)
    if (fallbackDuration) {
      duration = fallbackDuration
      console.warn('[EdgeTTS] duration-cbr-fallback-used', {
        voice,
        textLength: text.length,
        audioBytes: audioBuffer.length,
        duration,
        metadataError: metadataError ?? 'metadata duration was non-positive',
      })
    } else {
      throw new Error(
        `EdgeTTS MP3 元数据解析失败且 CBR fallback 失败：voice=${voice}, textLength=${text.length}, audioBytes=${audioBuffer.length}, metadataError=${metadataError ?? 'metadata duration was non-positive'}`,
      )
    }
  }

  let outputPath = params.outputPath ?? getTempTtsVoiceFilePath()
  if (fs.existsSync(outputPath)) {
    fs.unlinkSync(outputPath)
  }
  if (!fs.existsSync(path.dirname(outputPath))) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true })
  }
  await result.toFile(outputPath)

  const srtText = withCaption ? result.getCaptionSrtString() : undefined

  if (srtText) {
    const srtString = srtText
    const srtPath = path.join(path.dirname(outputPath), path.basename(outputPath, '.mp3') + '.srt')
    if (fs.existsSync(srtPath)) {
      fs.unlinkSync(srtPath)
    }
    fs.writeFileSync(srtPath, srtString)
  }

  return {
    duration,
    srtText,
  }
}
