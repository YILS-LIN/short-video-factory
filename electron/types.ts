export interface OpenExternalParams {
  url: string
}

export interface SelectFolderParams {
  title?: string
  defaultPath?: string
}

export interface ListFilesFromFolderParams {
  folderPath: string
}

export interface ListFilesFromFolderRecord {
  name: string
  path: string
}

export interface StatEventParams {
  title: string
  screen?: string
  language?: string
  url?: string
  userAgent?: string
}
