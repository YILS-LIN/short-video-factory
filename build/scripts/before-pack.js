const path = require('node:path')
const fs = require('node:fs')

const Arch = {
  0: 'ia32',
  1: 'x64',
  2: 'armv7l',
  3: 'arm64',
  4: 'universal',
}

function copyNativeFileSync(sourceDir, targetDir) {
  const sourcePath = path.join(__dirname, `../../native/${sourceDir}`)
  const targetPath = path.join(__dirname, `../../dist-native/${targetDir}`)
  if (!fs.existsSync(sourcePath)) {
    throw new Error(`Native binary not found at: ${sourcePath}`)
  }
  if (!fs.existsSync(path.join(__dirname, `../../dist-native`))) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true })
  }
  fs.copyFileSync(sourcePath, targetPath)
}

module.exports = function beforePack(context) {
  // console.log('[beforePack] context:', context)

  const platform = context.packager.platform.nodeName
  const arch = Arch[context.arch]

  // better-sqlite3
  copyNativeFileSync(
    `better-sqlite3/better-sqlite3-v9.6.0-electron-v110-${platform}-${arch}.node`,
    `better-sqlite3.node`,
  )
}
