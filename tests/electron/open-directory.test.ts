import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ openPath: vi.fn() }))
vi.mock('electron', () => ({ shell: { openPath: mocks.openPath } }))
import { openDirectory } from '../../electron/lib/open-directory'

describe('open output directory', () => {
  afterEach(() => {
    mocks.openPath.mockReset()
  })
  it('opens an existing directory with spaces and reports OS errors', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'output folder '))
    try {
      mocks.openPath.mockResolvedValue('')
      await expect(openDirectory(dir)).resolves.toBeUndefined()
      expect(mocks.openPath).toHaveBeenCalledWith(dir)
      mocks.openPath.mockResolvedValue('Access denied')
      await expect(openDirectory(dir)).rejects.toThrow('Access denied')
      const file = path.join(dir, 'video.mp4')
      fs.writeFileSync(file, 'video')
      mocks.openPath.mockClear()
      await expect(openDirectory(file)).rejects.toThrow('路径不是文件夹')
      await expect(openDirectory(path.join(dir, 'missing'))).rejects.toThrow()
      expect(mocks.openPath).not.toHaveBeenCalled()
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
  it.each(['', '   ', 'relative/path', null, 123])('rejects invalid paths %j', async (input) => {
    await expect(openDirectory(input)).rejects.toThrow('有效的绝对目录路径')
    expect(mocks.openPath).not.toHaveBeenCalled()
  })
})
