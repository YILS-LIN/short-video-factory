export interface RenderVideoParams {
  videoFiles: string[]
  timeRanges: [string, string][]
  audioFiles?: { voice?: string; bgm?: string }
  subtitleFile: string
  outputSize: { width: number; height: number }
  outputPath: string
  outputDuration?: string
  onProgress?: (progress: number) => void
  abortSignal?: AbortSignal
}

export interface ExecuteFFmpegResult {
  stdout: string
  stderr: string
  code: number
}
