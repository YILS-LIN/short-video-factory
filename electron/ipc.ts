import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, dialog, app, shell } from 'electron'
import { sqBulkInsertOrUpdate, sqDelete, sqInsert, sqQuery, sqUpdate } from './sqlite'
import {
  ListFilesFromFolderParams,
  OpenExternalParams,
  SelectFolderParams,
  StatEventParams,
} from './types'
import { edgeTtsGetVoiceList, edgeTtsSynthesizeToBase64, edgeTtsSynthesizeToFile } from './tts'
import { renderVideo } from './ffmpeg'
import { sendStatEvent } from './lib/stat'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 使用['ENV_NAME'] 避免 vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

function canUsePath(folderPath?: string | null) {
  if (!folderPath) {
    return false
  }

  try {
    fs.accessSync(folderPath, fs.constants.R_OK)
    return true
  } catch {
    return false
  }
}

function tryGetElectronPath(name: Parameters<typeof app.getPath>[0]) {
  try {
    return app.getPath(name)
  } catch (error: any) {
    console.warn(`[select-folder] getPath(${name}) failed:`, error?.message ?? String(error))
    return null
  }
}

function resolveDefaultFolderPath(customPath?: string | null) {
  if (canUsePath(customPath)) {
    return customPath!
  }

  const fallbackPathKeys: Parameters<typeof app.getPath>[0][] = [
    'downloads',
    'desktop',
    'documents',
    'home',
  ]

  for (const key of fallbackPathKeys) {
    const folderPath = tryGetElectronPath(key)
    if (canUsePath(folderPath)) {
      return folderPath
    }
  }

  if (canUsePath(process.cwd())) {
    return process.cwd()
  }

  return null
}

export default function initIPC() {
  // sqlite 查询
  ipcMain.handle('sqlite-query', (_event, params) => sqQuery(params))
  // sqlite 插入
  ipcMain.handle('sqlite-insert', (_event, params) => sqInsert(params))
  // sqlite 更新
  ipcMain.handle('sqlite-update', (_event, params) => sqUpdate(params))
  // sqlite 删除
  ipcMain.handle('sqlite-delete', (_event, params) => sqDelete(params))
  // sqlite 批量插入或更新
  ipcMain.handle('sqlite-bulk-insert-or-update', (_event, params) => sqBulkInsertOrUpdate(params))

  // 是否最大化
  ipcMain.handle('is-win-maxed', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return win?.isMaximized()
  })
  //最小化
  ipcMain.on('win-min', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.minimize()
  })
  //最大化
  ipcMain.on('win-max', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (win?.isMaximized()) {
      win?.restore()
    } else {
      win?.maximize()
    }
  })
  //关闭程序
  ipcMain.on('win-close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    win?.close()
  })

  // 打开外部链接
  ipcMain.handle('open-external', (_event, params: OpenExternalParams) => {
    shell.openExternal(params.url)
  })

  // 选择文件夹
  ipcMain.handle('select-folder', async (event, params?: SelectFolderParams) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) {
      throw new Error('无法获取窗口')
    }

    const defaultPath = resolveDefaultFolderPath(params?.defaultPath)

    const dialogOptions: Electron.OpenDialogOptions = {
      properties: ['openDirectory'],
      title: params?.title || '选择文件夹',
    }

    if (defaultPath) {
      dialogOptions.defaultPath = defaultPath
    } else {
      console.warn('[select-folder] all fallback defaultPath attempts unavailable')
    }

    const result = await dialog.showOpenDialog(win, dialogOptions)
    if (!result.canceled && result.filePaths.length > 0) {
      return result.filePaths[0] // 返回绝对路径
    }
    return null
  })

  // 读取文件夹内所有文件
  ipcMain.handle('list-files-from-folder', async (_event, params: ListFilesFromFolderParams) => {
    const files = await fs.promises.readdir(params.folderPath, { withFileTypes: true })
    return files
      .filter((file) => file.isFile())
      .map((file) => ({
        name: file.name,
        path: path.join(params.folderPath, file.name).replace(/\\/g, '/'),
      }))
  })

  // 获取EdgeTTS语音列表
  ipcMain.handle('edge-tts-get-voice-list', () => edgeTtsGetVoiceList())

  // 统计事件上报
  ipcMain.handle('stat-track', (_event, params: StatEventParams) => sendStatEvent(params))

  // 语音合成并获取Base64
  ipcMain.handle('edge-tts-synthesize-to-base64', (_event, params) =>
    edgeTtsSynthesizeToBase64(params),
  )

  // 保存语音合成到文件
  ipcMain.handle('edge-tts-synthesize-to-file', (_event, params) => edgeTtsSynthesizeToFile(params))

  // 渲染视频
  ipcMain.handle('render-video', (_event, params) => {
    // 进度回调
    const onProgress = (progress: number) => {
      _event.sender.send('render-video-progress', progress)
    }

    // 创建 AbortController
    const controller = new AbortController()
    // 监听取消事件
    ipcMain.once('cancel-render-video', () => {
      controller.abort()
    })

    return renderVideo({ ...params, onProgress, abortSignal: controller.signal })
  })
}
