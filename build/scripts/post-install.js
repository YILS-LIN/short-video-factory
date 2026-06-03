const { execSync } = require('node:child_process')
const ffmpeg = require('ffmpeg-static')
const fs = require('node:fs')

console.log('Downloading ffmpeg...')
execSync(
  `cross-env FFMPEG_BINARIES_URL=${process.env['npm_config_ffmpeg_binaries_url']} npm rebuild ffmpeg-static`,
)
console.log(`FFmpeg downloaded to path: ${ffmpeg}`)

const isWindows = process.platform === 'win32'
if (!isWindows) {
  console.log('Not Windows, need to set ffmpeg permissions.')
  fs.chmodSync(ffmpeg, 0o755)
  execSync(`chmod +x ${ffmpeg}`)
  console.log('FFmpeg permissions already set.')
}
