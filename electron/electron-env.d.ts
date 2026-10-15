/// <reference types="vite-plugin-electron/electron-env" />

declare namespace NodeJS {
  interface ProcessEnv {
    /**
     * 已构建的目录结构
     *
     * ```tree
     * ├─┬─┬ dist
     * │ │ └── index.html
     * │ │
     * │ ├─┬ dist-electron
     * │ │ ├── main.js
     * │ │ └── preload.js
     * │
     * ```
     */
    APP_ROOT: string
    /** /dist/ or /public/ */
    VITE_PUBLIC: string
  }
}

// 在渲染器进程中使用，在 `preload.ts` 中暴露方法
interface Window {
  ipcRenderer: Pick<import('electron').IpcRenderer, 'on' | 'once' | 'off' | 'send' | 'invoke'>
  i18n: {
    getLocalesPath: () => Promise<string>
    getLanguage: () => Promise<string>
    changeLanguage: (lng: string) => Promise<string>
  }
  electron: {
    platform: NodeJS.Platform
    isWinMaxed: () => Promise<boolean>
    winMin: () => void
    winMax: () => void
    winClose: () => void
    toggleWindowMaximize: () => void
    prepareWindowDrag: () => Promise<{
      bounds: import('electron').Rectangle
      wasMaximized: boolean
    } | null>
    getWindowBounds: () => Promise<import('electron').Rectangle | undefined>
    setWindowPosition: (x: number, y: number) => void
    setZoomFactor: (factor: number) => void
    openExternal: (params: import('./types').OpenExternalParams) => Promise<void>
    selectFolder: (params: import('./types').SelectFolderParams) => Promise<string>
    openDirectory: (folderPath: string) => Promise<void>
    listFilesFromFolder: (
      params: import('./types').ListFilesFromFolderParams,
    ) => Promise<import('./types').ListFilesFromFolderRecord[]>
    edgeTtsGetVoiceList: () => Promise<import('./lib/edge-tts').EdgeTTSVoice[]>
    edgeTtsSynthesizeToBase64: (
      params: import('./tts/types').EdgeTtsSynthesizeCommonParams,
    ) => Promise<string>
    edgeTtsSynthesizeToFile: (
      params: import('./tts/types').EdgeTtsSynthesizeToFileParams,
    ) => Promise<import('./tts/types').EdgeTtsSynthesizeToFileResult>
    renderVideo: (
      params: import('./ffmpeg/types').RenderVideoParams,
    ) => Promise<import('./ffmpeg/types').ExecuteFFmpegResult>
    analyticsTrack: (params: import('./analytics-types').AnalyticsTrackParams) => Promise<void>
    analyticsSetContext: (
      params: import('./analytics-types').AnalyticsContextParams,
    ) => Promise<void>
    analyticsMarkActive: (durationMs: number) => Promise<void>
    checkForUpdates: () => Promise<import('./updater').UpdateCheckResult>
    getMetadataState: () => Promise<import('./metadata/types').MetadataState>
    onMetadataStateChanged: (
      listener: (state: import('./metadata/types').MetadataState) => void,
    ) => () => void
    exportDiagnostics: () => Promise<string | null>
    log: (level: import('./logger').AppLogLevel, ...args: unknown[]) => void
  }
  sqlite: {
    query: (param: import('./sqlite/types').QueryParams) => Promise<any>
    insert: (param: import('./sqlite/types').InsertParams) => Promise<number>
    update: (param: import('./sqlite/types').UpdateParams) => Promise<number>
    delete: (param: import('./sqlite/types').DeleteParams) => Promise<void>
    bulkInsertOrUpdate: (param: import('./sqlite/types').BulkInsertOrUpdateParams) => Promise<void>
  }
}

declare const __APP_ANALYTICS_BUILD_INFO__: {
  productName: string
  appId: string
  packageName: string
  buildId: string
  distributionChannel: string
}

declare const __APP_METADATA_CONFIG__: import('./metadata/types').MetadataBuildConfig
declare const __APP_METADATA_ENVIRONMENT__: import('./metadata/types').MetadataEnvironment
declare const __APP_METADATA_RELEASE_CHANNEL__: import('./metadata/types').ReleaseChannel
