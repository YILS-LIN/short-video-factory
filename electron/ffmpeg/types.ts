export interface AudioVolumeConfig {
  voiceVolume?: string // voice音量，如 "1.5"（倍数）或 "-3dB"（分贝）
  bgmVolume?: string // bgm音量，如 "0.5"（倍数）或 "-6dB"（分贝）
  targetLoudness?: string // 目标响度（LUFS），如 "-16"（YouTube推荐）或 "-14"（Spotify推荐）
}

export interface RenderVideoParams {
  videoFiles: string[]
  timeRanges: [string, string][]
  audioFiles?: { voice?: string; bgm?: string }
  subtitleFile?: string
  outputSize: { width: number; height: number }
  outputPath: string
  outputDuration?: string
  audioVolume?: AudioVolumeConfig
}

export interface ExecuteFFmpegResult {
  stdout: string
  stderr: string
  code: number
}
