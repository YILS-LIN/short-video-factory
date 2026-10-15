import fs from 'node:fs'
import path from 'node:path'
import { shell } from 'electron'

export async function openDirectory(folderPath: unknown): Promise<void> {
  if (typeof folderPath !== 'string' || !folderPath.trim() || !path.isAbsolute(folderPath)) {
    throw new Error('请提供有效的绝对目录路径')
  }
  const directory = path.normalize(folderPath)
  if (!(await fs.promises.stat(directory)).isDirectory()) {
    throw new Error(`路径不是文件夹: ${directory}`)
  }
  const error = await shell.openPath(directory)
  if (error) throw new Error(error)
}
