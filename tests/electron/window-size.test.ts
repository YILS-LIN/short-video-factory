import { describe, expect, it } from 'vitest'
import { getMainWindowSize } from '../../electron/lib/window-size'

describe('main window size', () => {
  it('adds room for the new 60px top bar while retaining proportional sizing', () => {
    expect(getMainWindowSize({ width: 1920, height: 1080 })).toEqual({
      width: 1536,
      height: 924,
      minWidth: 800,
      minHeight: 710,
    })
  })

  it('keeps the window within the available work area on smaller displays', () => {
    expect(getMainWindowSize({ width: 1280, height: 700 })).toEqual({
      width: 1024,
      height: 700,
      minWidth: 800,
      minHeight: 700,
    })
  })

  it('uses the available display height as the minimum on compact screens', () => {
    expect(getMainWindowSize({ width: 900, height: 600 })).toEqual({
      width: 720,
      height: 600,
      minWidth: 800,
      minHeight: 600,
    })
  })
})
