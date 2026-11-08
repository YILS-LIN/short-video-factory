import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  append: vi.fn(),
  directory: vi.fn(),
  showItemInFolder: vi.fn(),
}))

vi.mock('electron', () => ({
  app: {
    getPath: () => '/diagnostics',
    getName: () => 'test',
    getVersion: () => '1.0',
    getLocale: () => 'en',
    getGPUFeatureStatus: () => ({}),
    isPackaged: false,
  },
  screen: { getAllDisplays: () => [] },
  dialog: {
    showSaveDialog: async () => ({ canceled: false, filePath: '/diagnostics/export.zip' }),
  },
  shell: { showItemInFolder: mocks.showItemInFolder },
}))
vi.mock('systeminformation', () => ({
  default: { graphics: async () => ({ controllers: [], displays: [] }) },
}))
vi.mock('../../electron/logger', () => ({ getLogDirectory: () => '/diagnostics/logs' }))
vi.mock('node:fs', () => ({
  default: { existsSync: () => true, createWriteStream: () => new EventEmitter() },
}))
vi.mock('archiver', () => ({
  default: () => {
    let output: EventEmitter
    return {
      on: vi.fn(),
      pipe: (stream: EventEmitter) => {
        output = stream
      },
      append: mocks.append,
      directory: mocks.directory,
      finalize: async () => {
        output.emit('close')
      },
    }
  },
}))

import { exportDiagnostics } from '../../electron/diagnostics'

describe('diagnostic log export', () => {
  it('includes the shared application log directory used by generation records', async () => {
    const progress = vi.fn()
    expect(await exportDiagnostics(null, progress)).toBe('/diagnostics/export.zip')
    expect(mocks.directory).toHaveBeenCalledWith('/diagnostics/logs', 'logs')
    expect(mocks.append).toHaveBeenCalledWith(expect.any(String), { name: 'system-info.json' })
    expect(progress.mock.calls).toEqual([['collecting'], ['archiving']])
  })
})
