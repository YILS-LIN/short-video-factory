import { describe, expect, it, vi } from 'vitest'
import { generateSecMsGecV2 } from '../../electron/lib/edge-tts-gec'
import { Constants, DRM } from '../../electron/lib/edge-tts'

const capturedToken =
  '492D7694A183A45E-56E821F95D4579C5B7C7E33DC7303FF379EC36D510213555BBBB9EB17EF15876'
const timestamp = 1791888000
const generate = (time: number) => generateSecMsGecV2(time, Constants.TRUSTED_CLIENT_TOKEN)

describe('Sec-MS-GEC v2', () => {
  it('matches the token captured from Edge in upstream PR #492', () => {
    expect(generate(timestamp)).toBe(capturedToken)
  })

  it('uses five-minute windows including fractional timestamps', () => {
    expect(generate(timestamp + 299.999)).toBe(capturedToken)
    expect(generate(timestamp - 0.001)).not.toBe(capturedToken)
    expect(generate(timestamp + 300)).not.toBe(capturedToken)
    expect(generate(timestamp + 300)).toMatch(/^[0-9A-F]{16}-[0-9A-F]{64}$/)
  })

  it('preserves DRM clock skew correction', () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue((timestamp - 600) * 1000)
    DRM.adjClockSkewSeconds(600)
    try {
      expect(DRM.generateSecMsGec()).toBe(capturedToken)
    } finally {
      DRM.adjClockSkewSeconds(-600)
      clock.mockRestore()
    }
  })
})
