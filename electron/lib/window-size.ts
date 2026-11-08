const EXTRA_WINDOW_HEIGHT = 60
const BASE_MIN_WINDOW_HEIGHT = 650

export interface WorkAreaSize {
  width: number
  height: number
}

export function getMainWindowSize({ width, height }: WorkAreaSize) {
  const minHeight = Math.min(BASE_MIN_WINDOW_HEIGHT + EXTRA_WINDOW_HEIGHT, height)
  const preferredHeight = Math.ceil(height * 0.85) + EXTRA_WINDOW_HEIGHT

  return {
    width: Math.ceil(width * 0.9),
    height: Math.min(height, Math.max(preferredHeight, minHeight)),
    minWidth: 800,
    minHeight,
  }
}
