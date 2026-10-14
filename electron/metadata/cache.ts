import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { MetadataCacheRecord } from './types'

export interface MetadataCache {
  read(): Promise<unknown | null>
  write(record: MetadataCacheRecord): Promise<void>
}

export class FileMetadataCache implements MetadataCache {
  constructor(private readonly filePath: string) {}

  async read(): Promise<unknown | null> {
    try {
      return JSON.parse(await readFile(this.filePath, 'utf8')) as unknown
    } catch (error) {
      if (isMissingFile(error)) return null
      throw error
    }
  }

  async write(record: MetadataCacheRecord): Promise<void> {
    const directory = path.dirname(this.filePath)
    const temporaryPath = `${this.filePath}.${process.pid}.${Date.now()}.tmp`
    await mkdir(directory, { recursive: true })
    try {
      await writeFile(temporaryPath, JSON.stringify(record), { encoding: 'utf8', mode: 0o600 })
      await rename(temporaryPath, this.filePath)
    } catch (error) {
      const { rm } = await import('node:fs/promises')
      await rm(temporaryPath, { force: true }).catch(() => {})
      throw error
    }
  }
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
}
