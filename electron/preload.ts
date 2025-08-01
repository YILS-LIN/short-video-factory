import { ipcRenderer, contextBridge } from 'electron'
import {
  QueryParams,
  InsertParams,
  UpdateParams,
  DeleteParams,
  BulkInsertOrUpdateParams,
} from './sqlite/types'
import { ListFilesFromFolderParams, SelectFolderParams } from './types'
import { edgeTtsSynthesizeCommonParams } from './tts/types'
import { RenderVideoParams } from './ffmpeg/types'

// --------- 向界面渲染进程暴露某些API ---------

contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  once(...args: Parameters<typeof ipcRenderer.once>) {
    const [channel, listener] = args
    return ipcRenderer.once(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

contextBridge.exposeInMainWorld('electron', {
  isWinMaxed: () => ipcRenderer.invoke('is-win-maxed'),
  winMin: () => ipcRenderer.send('win-min'),
  winMax: () => ipcRenderer.send('win-max'),
  winClose: () => ipcRenderer.send('win-close'),
  selectFolder: (params: SelectFolderParams) => ipcRenderer.invoke('select-folder', params),
  listFilesFromFolder: (params: ListFilesFromFolderParams) =>
    ipcRenderer.invoke('list-files-from-folder', params),
  edgeTtsGetVoiceList: () => ipcRenderer.invoke('edge-tts-get-voice-list'),
  edgeTtsSynthesizeToBase64: (params: edgeTtsSynthesizeCommonParams) =>
    ipcRenderer.invoke('edge-tts-synthesize-to-base64', params),
  edgeTtsSynthesizeToFile: (params: edgeTtsSynthesizeCommonParams) =>
    ipcRenderer.invoke('edge-tts-synthesize-to-file', params),
  renderVideo: (params: RenderVideoParams) => ipcRenderer.invoke('render-video', params),
})

contextBridge.exposeInMainWorld('sqlite', {
  query: (params: QueryParams) => ipcRenderer.invoke('sqlite-query', params),
  insert: (params: InsertParams) => ipcRenderer.invoke('sqlite-insert', params),
  update: (params: UpdateParams) => ipcRenderer.invoke('sqlite-update', params),
  delete: (params: DeleteParams) => ipcRenderer.invoke('sqlite-delete', params),
  bulkInsertOrUpdate: (params: BulkInsertOrUpdateParams) =>
    ipcRenderer.invoke('sqlite-bulk-insert-or-update', params),
})
