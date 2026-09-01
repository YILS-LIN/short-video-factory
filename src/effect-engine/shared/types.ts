export type SubtitleSource = 'tts' | 'asr' | 'external' | 'manual'

export interface SubtitleAsset {
  srtText: string
  source: SubtitleSource
}

export interface SubtitleCue {
  id: string
  text: string
  startMs: number
  endMs: number
}

export interface SubtitleRenderLine {
  text: string
}

export interface SubtitleLayoutCue extends SubtitleCue {
  lines: SubtitleRenderLine[]
  fontSize: number
}

export interface SubtitleStyleConfig {
  position: 'top' | 'middle' | 'bottom'
  offsetX: number
  offsetY: number
  safeAreaBottomRatio: number
  maxWidthRatio: number
  maxLines: 1 | 2
  fontFamily: string
  fontSize: number
  minFontSize: number
  fontWeight: string
  lineHeight: number
  color: string
  strokeColor: string
  strokeWidth: number
}

export interface SubtitleRendererTask {
  taskId: string
  output: {
    framesDir: string
    pattern: string
    startNumber: number
  }
  video: {
    width: number
    height: number
    fps: number
    durationMs: number
  }
  subtitleAsset: SubtitleAsset
  style: SubtitleStyleConfig
}

export interface SubtitleRendererManifest {
  taskId: string
  framesDir: string
  framePattern: string
  frameCount: number
  fps: number
  startNumber: number
  width: number
  height: number
}
