import { defaultSubtitleStyle } from '../effect-engine/default-style'
import type { SubtitleStyleConfig } from '../effect-engine/shared/types'
import { resolveSubtitleStyle } from '../effect-engine/shared/style'

export type BgmMode = 'none' | 'random' | 'fixed'
export const audioExtensions = ['mp3', 'wav', 'm4a', 'aac', 'flac', 'ogg']
export const isAudioFile = (name: string) =>
  audioExtensions.includes(name.split('.').pop()?.toLowerCase() ?? '')
export const videoSizePresets = [
  { value: '1080x1920', width: 1080, height: 1920 },
  { value: '720x1280', width: 720, height: 1280 },
  { value: '1920x1080', width: 1920, height: 1080 },
  { value: '1280x720', width: 1280, height: 720 },
  { value: '1080x1080', width: 1080, height: 1080 },
  { value: '1080x1440', width: 1080, height: 1440 },
]
export function validVideoSize(size: { width: number; height: number }) {
  return [size.width, size.height].every(
    (n) =>
      Number.isInteger(Number(n)) && Number(n) >= 64 && Number(n) <= 4096 && Number(n) % 2 === 0,
  )
}
export function normalizeSubtitleStyle(style?: Partial<SubtitleStyleConfig>): SubtitleStyleConfig {
  return resolveSubtitleStyle({ ...defaultSubtitleStyle, ...style })
}
