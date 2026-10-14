import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {} }))
import { generateUniqueFileName } from '../../electron/lib/tools'

describe('paired video and subtitle naming', () => {
  it('avoids collisions with either file and keeps matching base names', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'subtitle-naming-'))
    try {
      fs.writeFileSync(path.join(dir, 'video.srt'), 'existing')
      fs.writeFileSync(path.join(dir, 'video(1).mp4'), 'existing')
      expect(generateUniqueFileName(path.join(dir, 'video.mp4'), '.srt')).toBe(
        path.join(dir, 'video(2).mp4'),
      )
      expect(generateUniqueFileName(path.join(dir, 'video.mp4'))).toBe(path.join(dir, 'video.mp4'))
    } finally {
      fs.rmSync(dir, { recursive: true, force: true })
    }
  })
})
