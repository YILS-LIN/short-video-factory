const { execSync } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')

const isWindows = process.platform === 'win32'

if (isWindows) {
  console.log('Windows detected, setting up ffmpeg-static...')
  try {
    // 检查 ffmpeg-static 是否已安装
    const ffmpegStaticPath = require.resolve('ffmpeg-static')
    console.log('ffmpeg-static 路径:', ffmpegStaticPath)

    if (fs.existsSync(ffmpegStaticPath)) {
      console.log('ffmpeg-static 已正确安装')

      // 检查文件大小，确保不是空文件
      const stats = fs.statSync(ffmpegStaticPath)
      console.log('ffmpeg-static 文件大小:', stats.size, 'bytes')

      if (stats.size < 1000000) { // 小于 1MB 可能有问题
        console.warn('警告: ffmpeg-static 文件大小异常，可能需要重新下载')
      }
    } else {
      throw new Error('ffmpeg-static 文件不存在')
    }

    // 尝试运行 ffmpeg-static 的安装脚本
    try {
      execSync('npm explore ffmpeg-static -- npm run install', {
        cwd: process.cwd(),
        stdio: 'inherit',
        timeout: 60000 // 60秒超时
      })
      console.log('ffmpeg-static 安装脚本执行成功')
    } catch (installError) {
      console.warn('ffmpeg-static 安装脚本执行失败，但文件已存在:', installError.message)
    }

  } catch (error) {
    console.error('ffmpeg-static 设置失败:', error.message)
    console.log('尝试手动安装 ffmpeg-static...')

    try {
      execSync('pnpm add ffmpeg-static --force', {
        cwd: process.cwd(),
        stdio: 'inherit',
      })
      console.log('手动安装 ffmpeg-static 成功')
    } catch (manualError) {
      console.error('手动安装也失败了:', manualError.message)
      console.log('请手动运行: pnpm add ffmpeg-static --force')
      // 不退出进程，让用户手动处理
    }
  }
} else {
  console.log('非 Windows 系统，跳过 ffmpeg-static 安装')
  console.log('请确保系统已安装 FFmpeg:')
  console.log('- macOS: brew install ffmpeg')
  console.log('- Ubuntu/Debian: sudo apt install ffmpeg')
  console.log('- CentOS/RHEL: sudo yum install ffmpeg')
}
