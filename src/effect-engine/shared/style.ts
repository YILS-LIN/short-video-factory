import { defaultSubtitleStyle } from '../default-style'
import type { SubtitleStyleConfig } from './types'

// UI values use a 1080px reference width. Preview and export must resolve identically.
export function resolveSubtitleStyle(
  style: Partial<SubtitleStyleConfig> = {},
  width = 1080,
): SubtitleStyleConfig {
  const merged = { ...defaultSubtitleStyle, ...style }
  const finite = (value: number, fallback: number) => (Number.isFinite(value) ? value : fallback)
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  const fontSize = clamp(finite(merged.fontSize, 56), 16, 220)
  const scale = width / 1080
  return {
    ...merged,
    position: ['top', 'middle', 'bottom'].includes(merged.position) ? merged.position : 'bottom',
    offsetX: clamp(finite(merged.offsetX, 0), -1200, 1200) * scale,
    offsetY: clamp(finite(merged.offsetY, -210), -1200, 1200) * scale,
    safeAreaBottomRatio: clamp(finite(merged.safeAreaBottomRatio, 0.12), 0, 0.5),
    maxWidthRatio: clamp(finite(merged.maxWidthRatio, 0.86), 0.2, 1),
    maxLines: merged.maxLines === 1 ? 1 : 2,
    fontSize: fontSize * scale,
    minFontSize: clamp(finite(merged.minFontSize, 34), 12, fontSize) * scale,
    strokeWidth: clamp(finite(merged.strokeWidth, 4), 0, 12) * scale,
  }
}
