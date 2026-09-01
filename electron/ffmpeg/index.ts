import fs from 'node:fs'
import os from 'os'
import { spawn } from 'child_process'
import { ExecuteFFmpegResult, RenderVideoParams } from './types'
import { getTempTtsVoiceFilePath } from '../tts'
import path from 'node:path'
import { generateUniqueFileName } from '../lib/tools'
import {
  isEffectRenderCancelledError,
  renderSubtitleFramesToPngSequence,
} from '../effect-engine/subtitle-render-service'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const isWindows = process.platform === 'win32'

const ffmpegPath: string = VITE_DEV_SERVER_URL
  ? require('ffmpeg-static')
  : (require('ffmpeg-static') as string).replace('app.asar', 'app.asar.unpacked')

// async function test() {
//   try {
//     const result = await executeFFmpeg(['-version'])
//     console.log(result.stdout)
//   } catch (error) {
//     console.log(error)
//   }
// }
// test()

export async function renderVideo(
  params: RenderVideoParams & {
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
): Promise<ExecuteFFmpegResult> {
  let cleanupSubtitleFrames: (() => void) | undefined
  try {
    // 解构参数
    const { videoFiles, timeRanges, outputSize, outputDuration, onProgress, abortSignal } = params

    // 音频默认配置
    const audioFiles = params.audioFiles ?? {}
    audioFiles.voice = params.audioFiles?.voice ?? getTempTtsVoiceFilePath()

    // 字幕默认配置
    const subtitleFile =
      params.subtitleFile ??
      path
        .join(
          path.dirname(getTempTtsVoiceFilePath()),
          path.basename(getTempTtsVoiceFilePath(), '.mp3') + '.srt',
        )
        .replace(/\\/g, '/')

    const subtitleAsset =
      params.subtitleAsset ??
      (params.subtitleText?.trim()
        ? {
            srtText: params.subtitleText,
            source: 'tts' as const,
          }
        : undefined)
    let subtitleSequenceInputPath: string | undefined
    let subtitleInputIndex: number | undefined
    let subtitleRenderProgress = 0
    let ffmpegProgress = 0
    const emitProgress = () => {
      if (!subtitleAsset) {
        onProgress?.(ffmpegProgress)
        return
      }
      onProgress?.(Math.round(subtitleRenderProgress * 0.35 + ffmpegProgress * 0.65))
    }

    if (subtitleAsset) {
      const durationMs = Math.max(1, Math.floor(Number.parseFloat(outputDuration ?? '1') * 1000))
      const subtitleRender = await renderSubtitleFramesToPngSequence({
        subtitleAsset,
        outputSize,
        fps: 30,
        durationMs,
        style: params.subtitleStyle,
        abortSignal,
        onProgress: (progress) => {
          subtitleRenderProgress = progress
          emitProgress()
        },
      })
      cleanupSubtitleFrames = subtitleRender.cleanup
      subtitleSequenceInputPath = path
        .join(subtitleRender.manifest.framesDir, subtitleRender.manifest.framePattern)
        .replace(/\\/g, '/')
    }

    // 输出路径默认配置
    if (!fs.existsSync(path.dirname(params.outputPath))) {
      throw new Error(`输出路径不存在`)
    }
    const outputPath = generateUniqueFileName(params.outputPath)

    // 构建args指令
    const args: string[] = []

    // 添加所有视频输入
    videoFiles.forEach((file) => {
      args.push('-i', `${file}`)
    })

    // 添加字幕序列输入
    if (subtitleSequenceInputPath) {
      subtitleInputIndex = args.filter((item) => item === '-i').length
      args.push('-framerate', '30', '-start_number', '1', '-i', subtitleSequenceInputPath)
    }

    // 添加音频输入
    // 语音音轨
    args.push('-i', `${audioFiles.voice}`)

    // 背景音乐
    audioFiles?.bgm && args.push('-i', `${audioFiles.bgm}`)

    // 构建复杂滤镜
    const filters = []
    const videoStreams: string[] = []

    // 处理每个视频片段
    videoFiles.forEach((_, index) => {
      const [start, end] = timeRanges[index]
      const streamLabel = `v${index}`
      videoStreams.push(streamLabel)

      // 使用 trim、setpts、scale、pad 等操作处理视频
      filters.push(
        `[${index}:v]trim=start=${start}:end=${end},setpts=PTS-STARTPTS,scale=${outputSize.width}:${outputSize.height}:force_original_aspect_ratio=decrease,pad=${outputSize.width}:${outputSize.height}:(ow-iw)/2:(oh-ih)/2,fps=30,format=yuv420p,setsar=1[${streamLabel}]`,
      )
    })

    // 拼接视频
    filters.push(`[${videoStreams.join('][')}]concat=n=${videoFiles.length}:v=1:a=0[vconcat]`)

    // 重置时间基、帧率、色彩空间
    filters.push(`[vconcat]fps=30,format=yuv420p,setpts=PTS-STARTPTS[vout]`)

    // 字幕使用 Pixi 导出的透明 PNG 序列叠加，避免 FFmpeg/libass 换行差异。
    if (subtitleInputIndex !== undefined) {
      filters.push(
        `[vout][${subtitleInputIndex}:v]overlay=0:0:shortest=1:eof_action=pass[with_subs]`,
      )
    } else {
      filters.push(`[vout]subtitles=${subtitleFile.replace(/\:/g, '\\\\:')}[with_subs]`)
    }

    // 音频处理：使用响度归一化(loudnorm)确保音量均衡
    const voiceStreamIdx = videoFiles.length + (subtitleInputIndex === undefined ? 0 : 1)
    const bgmStreamIdx = audioFiles?.bgm ? voiceStreamIdx + 1 : null

    if (outputDuration) {
      // 先对音频trim到目标时长，避免loudnorm导致的截断
      const voiceLoudnorm = `loudnorm=I=-16:TP=-1.5:LRA=11`
      filters.push(`[${voiceStreamIdx}:a]${voiceLoudnorm}[voice_norm_raw]`)
      filters.push(
        `[voice_norm_raw]atrim=0:${outputDuration},asetpts=PTS-STARTPTS[voice_normalized]`,
      )

      if (bgmStreamIdx !== null) {
        const bgmLoudnorm = `loudnorm=I=-25:TP=-1.5:LRA=11`
        // 对BGM先归一化，然后trim到目标时长
        filters.push(`[${bgmStreamIdx}:a]${bgmLoudnorm}[bgm_norm_raw]`)
        filters.push(`[bgm_norm_raw]atrim=0:${outputDuration},asetpts=PTS-STARTPTS[bgm_trimmed]`)
        // 使用 duration=first 混合（以语音为准），并添加 dropout_transition=0
        filters.push(
          `[voice_normalized][bgm_trimmed]amix=inputs=2:duration=first:dropout_transition=0[final_audio]`,
        )
      } else {
        filters.push(`[voice_normalized]acopy[final_audio]`)
      }
    } else {
      const voiceLoudnorm = `loudnorm=I=-16:TP=-1.5:LRA=11`
      filters.push(`[${voiceStreamIdx}:a]${voiceLoudnorm}[voice_normalized]`)

      if (bgmStreamIdx !== null) {
        const bgmLoudnorm = `loudnorm=I=-25:TP=-1.5:LRA=11`
        filters.push(`[${bgmStreamIdx}:a]${bgmLoudnorm}[bgm_normalized]`)
        filters.push(
          `[voice_normalized][bgm_normalized]amix=inputs=2:duration=first:dropout_transition=0[final_audio]`,
        )
      } else {
        filters.push(`[voice_normalized]acopy[final_audio]`)
      }
    }

    // 设置 filter_complex
    args.push('-filter_complex', `${filters.join(';')}`)

    // 映射输出流
    args.push('-map', '[with_subs]', '-map', '[final_audio]')

    // 编码参数
    args.push(
      '-c:v',
      'libx264',
      '-preset',
      'medium',
      '-crf',
      '23',
      '-r',
      '30',
      '-c:a',
      'aac',
      '-b:a',
      '128k',
      '-fps_mode',
      'cfr',
      '-s',
      `${outputSize.width}x${outputSize.height}`,
      '-progress',
      'pipe:1',
      ...(outputDuration ? ['-t', outputDuration] : []),
      '-stats',
      outputPath,
    )

    // 打印命令
    // console.log('传入参数:', params)
    // console.log('执行命令:', args.join(' '))

    // 执行命令
    const durationSeconds = outputDuration ? Number.parseFloat(outputDuration) : undefined
    const result = await executeFFmpeg(args, {
      onProgress: (progress) => {
        ffmpegProgress = progress
        emitProgress()
      },
      abortSignal,
      durationSeconds,
    })

    // 移除临时文件
    if (fs.existsSync(audioFiles.voice)) {
      fs.unlinkSync(audioFiles.voice)
    }
    if (fs.existsSync(subtitleFile)) {
      fs.unlinkSync(subtitleFile)
    }

    // 返回结果
    return result
  } catch (error) {
    if (isEffectRenderCancelledError(error) || params.abortSignal?.aborted) {
      return {
        stdout: '',
        stderr: error instanceof Error ? error.message : String(error),
        code: 255,
      }
    }
    throw error
  } finally {
    cleanupSubtitleFrames?.()
  }
}

export async function executeFFmpeg(
  args: string[],
  options?: {
    cwd?: string
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
    durationSeconds?: number
  },
): Promise<ExecuteFFmpegResult> {
  isWindows && validateExecutables()

  return new Promise((resolve, reject) => {
    const defaultOptions = {
      cwd: process.cwd(),
      env: process.env,
      ...options,
    }

    const child = spawn(ffmpegPath, args, defaultOptions)

    let stdout = ''
    let stderr = ''
    let stdoutBuffer = ''
    let progress = 0

    const totalDuration = options?.durationSeconds
    const pushProgressBySeconds = (seconds: number) => {
      if (!totalDuration || !Number.isFinite(totalDuration) || totalDuration <= 0) {
        return
      }

      const percent = Math.max(0, Math.min(99, Math.floor((seconds / totalDuration) * 100)))
      if (percent > progress) {
        progress = percent
        options?.onProgress?.(progress)
      }
    }

    const parseProgressFromStdout = (output: string) => {
      stdoutBuffer += output
      const lines = stdoutBuffer.split(/\r?\n/)
      stdoutBuffer = lines.pop() || ''

      for (const line of lines) {
        const separator = line.indexOf('=')
        if (separator <= 0) {
          continue
        }

        const key = line.slice(0, separator)
        const value = line.slice(separator + 1)
        if (key === 'out_time_ms') {
          const outTimeMs = Number(value)
          if (Number.isFinite(outTimeMs) && outTimeMs >= 0) {
            pushProgressBySeconds(outTimeMs / 1000000)
          }
        }
      }
    }

    const parseProgressFromStderr = (output: string) => {
      const matches = output.matchAll(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/g)
      for (const match of matches) {
        const hours = Number.parseInt(match[1], 10)
        const minutes = Number.parseInt(match[2], 10)
        const seconds = Number.parseFloat(match[3])
        if ([hours, minutes, seconds].some((value) => Number.isNaN(value))) {
          continue
        }
        pushProgressBySeconds(hours * 3600 + minutes * 60 + seconds)
      }
    }

    child.stdout.on('data', (data) => {
      const chunk = data.toString()
      stdout += chunk
      parseProgressFromStdout(chunk)
    })

    child.stderr.on('data', (data) => {
      const chunk = data.toString()
      stderr += chunk
      parseProgressFromStderr(chunk)
    })

    child.on('close', (code) => {
      if (code === 0) {
        options?.onProgress?.(100)
        resolve({ stdout, stderr, code })
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
      }
    })

    child.on('error', (error) => {
      reject(new Error(`Failed to start FFmpeg: ${error.message}`))
    })

    // 提供取消功能
    if (options?.abortSignal) {
      options.abortSignal.addEventListener('abort', () => {
        child.kill('SIGTERM')
      })
    }
  })
}

function validateExecutables() {
  if (!fs.existsSync(ffmpegPath)) {
    throw new Error(`FFmpeg not found at: ${ffmpegPath}`)
  }

  try {
    fs.accessSync(ffmpegPath, fs.constants.X_OK)
  } catch (error) {
    // Windows 上可能没有 X_OK 权限标志
    if (os.platform() !== 'win32') {
      throw new Error('FFmpeg executables do not have execute permissions')
    }
  }
}
