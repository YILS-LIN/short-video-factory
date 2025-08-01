import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow, ipcMain, dialog, app } from 'electron'
import { sqBulkInsertOrUpdate, sqDelete, sqInsert, sqQuery, sqUpdate } from './sqlite'
import { ListFilesFromFolderParams, SelectFolderParams } from './types'
import { edgeTtsGetVoiceList, edgeTtsSynthesizeToBase64, edgeTtsSynthesizeToFile } from './tts'
import { renderVideo } from './ffmpeg'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 使用['ENV_NAME'] 避免 vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL
  ? path.join(process.env.APP_ROOT, 'public')
  : RENDERER_DIST

export default function initIPC(win: BrowserWindow) {
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
  ipcMain.handle('is-win-maxed', () => {
    return win?.isMaximized()
  })
  //最小化
  ipcMain.on('win-min', () => {
    win?.minimize()
  })
  //最大化
  ipcMain.on('win-max', () => {
    if (win?.isMaximized()) {
      win?.restore()
    } else {
      win?.maximize()
    }
  })
  //关闭程序
  ipcMain.on('win-close', () => {
    win?.close()
  })

  // 选择文件夹
  ipcMain.handle('select-folder', async (_event, params?: SelectFolderParams) => {
    const result = await dialog.showOpenDialog(win, {
      properties: ['openDirectory'],
      title: params?.title || '选择文件夹',
      defaultPath: params?.defaultPath || app.getPath('downloads'), // 默认打开 Downloads
    })
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

  // 语音合成并获取Base64
  ipcMain.handle('edge-tts-synthesize-to-base64', (_event, params) =>
    edgeTtsSynthesizeToBase64(params),
  )

  // 保存语音合成到文件
  ipcMain.handle('edge-tts-synthesize-to-file', (_event, params) => edgeTtsSynthesizeToFile(params))

  // 渲染视频
  ipcMain.handle('render-video', (_event, params) => renderVideo(params))
}
