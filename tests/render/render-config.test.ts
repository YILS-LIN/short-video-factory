import { describe, expect, it } from 'vitest'
import { resolveSubtitleStyle } from '../../src/effect-engine/shared/style'
import { defaultSubtitleStyle } from '../../src/effect-engine/default-style'
import { isAudioFile, validVideoSize, videoSizePresets } from '../../src/lib/render-config'

describe('render configuration', () => {
  it('retains the existing 1080-wide style and scales all pixel geometry together', () => {
    expect(resolveSubtitleStyle()).toEqual(defaultSubtitleStyle)
    const scaled = resolveSubtitleStyle({}, 720)
    for (const field of ['fontSize', 'minFontSize', 'offsetX', 'offsetY', 'strokeWidth'] as const) {
      expect(scaled[field]).toBeCloseTo((defaultSubtitleStyle[field] * 720) / 1080)
    }
    expect(scaled.maxWidthRatio).toBe(defaultSubtitleStyle.maxWidthRatio)
  })
  it('clamps invalid geometry before scaling in both preview and export', () => {
    const style = resolveSubtitleStyle({
      fontSize: NaN,
      minFontSize: 1000,
      offsetY: Infinity,
      strokeWidth: -4,
    })
    expect(style.fontSize).toBe(56)
    expect(style.minFontSize).toBe(56)
    expect(style.offsetY).toBe(-210)
    expect(style.strokeWidth).toBe(0)
  })
  it('provides valid encoding sizes and rejects malformed custom sizes', () => {
    expect(videoSizePresets.every(validVideoSize)).toBe(true)
    for (const width of [0, -2, 63, 721, 720.5, 4098, NaN, Infinity]) {
      expect(validVideoSize({ width, height: 1920 })).toBe(false)
    }
  })
  it('recognizes supported audio extensions case-insensitively', () => {
    expect(isAudioFile('sound.MP3')).toBe(true)
    expect(isAudioFile('sound.wav')).toBe(true)
    expect(isAudioFile('sound.mp4')).toBe(false)
    expect(isAudioFile('sound')).toBe(false)
  })
})
