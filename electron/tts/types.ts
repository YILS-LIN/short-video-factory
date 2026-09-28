import { SynthesisOptions } from '../lib/edge-tts'

export interface EdgeTtsSynthesizeCommonParams {
  text: string
  voice: string
  options: SynthesisOptions
}

export interface EdgeTtsSynthesizeToFileParams extends EdgeTtsSynthesizeCommonParams {
  withCaption?: boolean
  outputPath?: string
  /** Request identifier used to route renderer cancellation to the active synthesis. */
  requestId?: string
}

export interface EdgeTtsSynthesizeToFileResult {
  /**
   * 合成后的音频时长，单位秒
   */
  duration: number | undefined
  srtText?: string
}
