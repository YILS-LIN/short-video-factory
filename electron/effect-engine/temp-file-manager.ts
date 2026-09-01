import fs from 'node:fs'
import path from 'node:path'
import { getAppTempPath } from '../lib/tools'

export interface EffectTempTaskPaths {
  taskRootDir: string
  framesDir: string
  manifestPath: string
}

export function createEffectTaskTempPaths(taskId: string): EffectTempTaskPaths {
  const rootDir = path.join(getAppTempPath(), 'effect-render', taskId)
  const framesDir = path.join(rootDir, 'frames')
  const manifestPath = path.join(rootDir, 'manifest.json')

  fs.mkdirSync(framesDir, { recursive: true })

  return {
    taskRootDir: rootDir.replace(/\\/g, '/'),
    framesDir: framesDir.replace(/\\/g, '/'),
    manifestPath: manifestPath.replace(/\\/g, '/'),
  }
}

export function cleanupEffectTaskTempPaths(paths?: EffectTempTaskPaths | null) {
  if (!paths?.taskRootDir) {
    return
  }

  try {
    if (fs.existsSync(paths.taskRootDir)) {
      fs.rmSync(paths.taskRootDir, { recursive: true, force: true })
    }
  } catch (error) {
    console.warn('[EffectEngine] 清理临时目录失败:', error)
  }
}
