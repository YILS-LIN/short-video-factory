#!/usr/bin/env node
/**
 * 1. 设置环境变量 FFMPEG_BINARIES_URL
 * 2. 分别 rebuild x64 / arm64 两个架构
 * 3. 用 lipo 合并为通用二进制
 */
const { execSync } = require('child_process')
const path = require('path')

// 1. 环境变量
const FFMPEG_BINARIES_URL = process.env['npm_config_ffmpeg_binaries_url']

// 2. 工具函数：执行命令并带彩色输出
function run(cmd, opts = {}) {
  console.log(`\n→ ${cmd}`)
  try {
    execSync(cmd, { stdio: 'inherit', shell: true, ...opts })
  } catch (e) {
    console.error(`❌ 命令失败: ${cmd}`)
    process.exit(1)
  }
}

// 3. 开始干活
const archs = ['x64', 'arm64']
const ffmpegStaticDir = path.join(__dirname, '..', '..', 'node_modules', 'ffmpeg-static')

// 移除原来的二进制文件
run('rm -f ffmpeg', { cwd: ffmpegStaticDir })

// 获取两种架构的二进制文件
archs.forEach((arch) => {
  run(
    `pnpm cross-env FFMPEG_BINARIES_URL=${FFMPEG_BINARIES_URL} npm_config_arch=${arch} npm run install`,
    {
      cwd: ffmpegStaticDir,
    },
  )
  run(`mv ${ffmpegStaticDir}/ffmpeg ${ffmpegStaticDir}/ffmpeg-${arch}`)
})

// 合并
run('lipo -create ffmpeg-arm64 ffmpeg-x64 -output ffmpeg', { cwd: ffmpegStaticDir })

// 赋权
run('chmod 0755 ffmpeg', { cwd: ffmpegStaticDir })

console.log('\n✅ 通用 ffmpeg 已生成:', path.join(ffmpegStaticDir, 'ffmpeg'))
