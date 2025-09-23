import fs from 'node:fs'
import { spawn } from 'child_process'
import { ExecuteFFmpegResult, RenderVideoParams } from './types'
import { getTempTtsVoiceFilePath } from '../tts'
import path from 'node:path'
import { generateUniqueFileName } from '../lib/tools'

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
const isWindows = process.platform === 'win32'

function getFFmpegPath(): string {
  if (isWindows) {
    try {
      const ffmpegStaticPath = VITE_DEV_SERVER_URL
        ? require('ffmpeg-static')
        : (require('ffmpeg-static') as string).replace('app.asar', 'app.asar.unpacked')

      console.log('Windows FFmpeg 路径:', ffmpegStaticPath)

      if (!fs.existsSync(ffmpegStaticPath)) {
        throw new Error(`FFmpeg 二进制文件不存在: ${ffmpegStaticPath}`)
      }

      return ffmpegStaticPath
    } catch (error) {
      console.error('获取 ffmpeg-static 路径失败:', error)
      throw new Error('FFmpeg 未正确安装。请重新安装应用或手动安装 FFmpeg。')
    }
  } else if (process.platform === 'darwin') {
    // macOS: 首先检查打包的 FFmpeg，然后检查系统安装的 FFmpeg
    const bundledPaths = []
    
    if (VITE_DEV_SERVER_URL) {
      // 开发环境
      bundledPaths.push(
        path.join(process.env.APP_ROOT!, 'dist-native/ffmpeg/ffmpeg-darwin-universal'),
        path.join(process.env.APP_ROOT!, 'dist-native/ffmpeg/ffmpeg-darwin-arm64'),
        path.join(process.env.APP_ROOT!, 'dist-native/ffmpeg/ffmpeg-darwin-x64')
      )
    } else {
      // 生产环境
      const appPath = process.resourcesPath || path.join(__dirname, '..')
      bundledPaths.push(
        path.join(appPath, 'dist-native/ffmpeg/ffmpeg-darwin-universal'),
        path.join(appPath, 'dist-native/ffmpeg/ffmpeg-darwin-arm64'),
        path.join(appPath, 'dist-native/ffmpeg/ffmpeg-darwin-x64')
      )
    }

    // 检查打包的 FFmpeg
    for (const bundledPath of bundledPaths) {
      if (fs.existsSync(bundledPath)) {
        try {
          fs.accessSync(bundledPath, fs.constants.X_OK)
          console.log('找到打包的 FFmpeg:', bundledPath)
          return bundledPath
        } catch (error) {
          console.log('打包的 FFmpeg 无执行权限:', bundledPath)
        }
      }
    }

    // 如果没有找到打包的 FFmpeg，检查系统安装的 FFmpeg
    const systemPaths = [
      'ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg'
    ]

    for (const ffmpegPath of systemPaths) {
      try {
        if (ffmpegPath === 'ffmpeg') {
          // 检查 PATH 中是否有 ffmpeg
          require('child_process').execSync('which ffmpeg', { stdio: 'ignore' })
          console.log('找到系统 FFmpeg:', ffmpegPath)
          return ffmpegPath
        } else if (fs.existsSync(ffmpegPath)) {
          console.log('找到系统 FFmpeg:', ffmpegPath)
          return ffmpegPath
        }
      } catch (error) {
        // 继续尝试下一个路径
      }
    }

    throw new Error('未找到 FFmpeg。请安装 FFmpeg: brew install ffmpeg，或重新下载应用以获取内置的 FFmpeg。')
  } else {
    // Linux: 检查系统是否安装了 FFmpeg
    const possiblePaths = [
      'ffmpeg',
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg'
    ]

    for (const ffmpegPath of possiblePaths) {
      try {
        if (ffmpegPath === 'ffmpeg') {
          // 检查 PATH 中是否有 ffmpeg
          require('child_process').execSync('which ffmpeg', { stdio: 'ignore' })
          console.log('找到系统 FFmpeg:', ffmpegPath)
          return ffmpegPath
        } else if (fs.existsSync(ffmpegPath)) {
          console.log('找到 FFmpeg:', ffmpegPath)
          return ffmpegPath
        }
      } catch (error) {
        // 继续尝试下一个路径
      }
    }

    throw new Error('系统未安装 FFmpeg。请安装 FFmpeg: sudo apt install ffmpeg (Ubuntu)')
  }
}

const ffmpegPath: string = getFFmpegPath()

// 测试 FFmpeg 是否正常工作
export async function testFFmpeg(): Promise<{ success: boolean; version?: string; error?: string }> {
  try {
    const result = await executeFFmpeg(['-version'])
    const versionMatch = result.stderr.match(/ffmpeg version ([^\s]+)/)
    const version = versionMatch ? versionMatch[1] : 'unknown'

    console.log('FFmpeg 测试成功，版本:', version)
    return { success: true, version }
  } catch (error) {
    console.error('FFmpeg 测试失败:', error)
    return { success: false, error: (error as Error).message }
  }
}

export async function renderVideo(
  params: RenderVideoParams & {
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
): Promise<ExecuteFFmpegResult> {
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

    // 输出路径默认配置
    if (!fs.existsSync(path.dirname(params.outputPath))) {
      throw new Error(`输出路径不存在`)
    }
    const outputPath = generateUniqueFileName(params.outputPath)

    // 构建args指令
    const args = []

    // 添加所有视频输入
    videoFiles.forEach((file) => {
      args.push('-i', `${file}`)
    })

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

    // 在视频拼接后添加字幕
    filters.push(`[vout]subtitles=${subtitleFile.replace(/\:/g, '\\\\:')}[with_subs]`)

    // 音频处理：raw 静音 voice 放大音量，bgm 减小音量
    filters.push(`[${videoFiles.length}:a]volume=2[voice]`) // voice 音量放大
    audioFiles?.bgm && filters.push(`[${videoFiles.length + 1}:a]volume=0.5[bgm]`) // bgm 音量缩小

    // 混合音频
    if (audioFiles?.bgm) {
      filters.push(`[voice][bgm]amix=inputs=2:duration=longest[aout]`)
    } else {
      filters.push(`[voice]amix=inputs=1:duration=longest[aout]`)
    }

    // 设置 filter_complex
    args.push('-filter_complex', `${filters.join(';')}`)

    // 映射输出流
    args.push('-map', '[with_subs]', '-map', '[aout]')

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
    const result = await executeFFmpeg(args, { onProgress, abortSignal })

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
    throw error
  }
}

export async function executeFFmpeg(
  args: string[],
  options?: {
    cwd?: string
    onProgress?: (progress: number) => void
    abortSignal?: AbortSignal
  },
): Promise<ExecuteFFmpegResult> {
  // 验证 FFmpeg 可执行文件
  try {
    validateExecutables()
  } catch (error) {
    throw new Error(`FFmpeg 验证失败: ${(error as Error).message}`)
  }

  return new Promise((resolve, reject) => {
    const defaultOptions = {
      cwd: process.cwd(),
      env: process.env,
      ...options,
    }

    console.log('执行 FFmpeg 命令:', ffmpegPath)
    console.log('参数:', args.join(' '))

    const child = spawn(ffmpegPath, args, defaultOptions)

    let stdout = ''
    let stderr = ''
    let progress = 0

    child.stdout.on('data', (data) => {
      stdout += data.toString()
      // 处理进度信息
      progress = parseProgress(data.toString()) ?? 0
      options?.onProgress?.(progress >= 100 ? 99 : progress)
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
      // 实时输出进度信息
      options?.onProgress?.(progress >= 100 ? 99 : progress)
    })

    child.on('close', (code) => {
      if (code === 0) {
        options?.onProgress?.(100)
        resolve({ stdout, stderr, code })
      } else {
        reject(new Error(`FFmpeg exited with code ${code}: ${stderr}`))
      }
    })

    child.on('error', (error: Error) => {
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
  console.log('验证 FFmpeg 路径:', ffmpegPath)

  if (!fs.existsSync(ffmpegPath)) {
    const errorMsg = `FFmpeg 可执行文件不存在: ${ffmpegPath}`
    console.error(errorMsg)

    if (isWindows) {
      throw new Error(`${errorMsg}\n请重新安装应用或检查 ffmpeg-static 包是否正确安装。`)
    } else {
      throw new Error(`${errorMsg}\n请安装 FFmpeg:\n- macOS: brew install ffmpeg\n- Ubuntu: sudo apt install ffmpeg`)
    }
  }

  try {
    const stats = fs.statSync(ffmpegPath)
    console.log('FFmpeg 文件信息:', {
      size: stats.size,
      isFile: stats.isFile(),
      mode: stats.mode.toString(8)
    })

    // 检查执行权限
    fs.accessSync(ffmpegPath, fs.constants.F_OK)

    if (!isWindows) {
      fs.accessSync(ffmpegPath, fs.constants.X_OK)
    }

    console.log('FFmpeg 验证通过')
  } catch (error) {
    const errorMsg = `FFmpeg 文件权限错误: ${(error as Error).message}`
    console.error(errorMsg)
    throw new Error(errorMsg)
  }
}

function parseProgress(stderrLine: string) {
  // 解析时间信息：frame=  123 fps= 45 q=25.0 size=    1024kB time=00:00:05.00 bitrate=1677.7kbits/s speed=1.5x
  const timeMatch = stderrLine.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/)
  if (timeMatch) {
    const hours = parseInt(timeMatch[1])
    const minutes = parseInt(timeMatch[2])
    const seconds = parseFloat(timeMatch[3])
    return hours * 3600 + minutes * 60 + seconds
  }
  return null
}
