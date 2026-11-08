import { describe, expect, it } from 'vitest'
import { getMainWindowSize } from '../../electron/lib/window-size'

describe('main window size', () => {
  it('uses 90% of the work area width and 85% of its height plus the 60px top bar', () => {
    expect(getMainWindowSize({ width: 1920, height: 1080 })).toEqual({
      width: 1728,
      height: 978,
      minWidth: 800,
      minHeight: 710,
    })
  })

  it('keeps the window within the available work area on smaller displays', () => {
    expect(getMainWindowSize({ width: 1280, height: 700 })).toEqual({
      width: 1152,
      height: 700,
      minWidth: 800,
      minHeight: 700,
    })
  })

  it('uses the available display height as the minimum on compact screens', () => {
    expect(getMainWindowSize({ width: 900, height: 600 })).toEqual({
      width: 810,
      height: 600,
      minWidth: 800,
      minHeight: 600,
    })
  })
})
