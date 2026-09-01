import type { SubtitleStyleConfig } from './shared/types'

export const defaultSubtitleStyle: SubtitleStyleConfig = {
  position: 'bottom',
  offsetX: 0,
  offsetY: -210,
  safeAreaBottomRatio: 0.12,
  maxWidthRatio: 0.86,
  maxLines: 2,
  fontFamily: '"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", sans-serif',
  fontSize: 56,
  minFontSize: 34,
  fontWeight: '700',
  lineHeight: 1.24,
  color: '#FFFFFF',
  strokeColor: '#101010',
  strokeWidth: 4,
}
