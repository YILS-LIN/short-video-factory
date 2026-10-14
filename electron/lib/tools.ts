import fs from 'node:fs'
import path from 'node:path'
import { app } from 'electron'

/**
 * 生成有序的唯一文件名，用于处理文件已存在的情况
 */
export function generateUniqueFileName(filePath: string, companionExtension?: string): string {
  const dir = path.dirname(filePath)
  const ext = path.extname(filePath)
  const baseName = path.basename(filePath, ext)
  let counter = 1
  let newPath = filePath

  while (
    fs.existsSync(newPath) ||
    (companionExtension &&
      fs.existsSync(path.join(dir, path.basename(newPath, ext) + companionExtension)))
  ) {
    newPath = path.join(dir, `${baseName}(${counter})${ext}`)
    counter++
  }
  return newPath
}

/**
 * 获取软件的临时文件存储路径
 */
export function getAppTempPath() {
  return path.join(app.getPath('temp'), app.name).replace(/\\/g, '/')
}
