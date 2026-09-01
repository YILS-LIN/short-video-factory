import { Container, Text, TextStyle } from 'pixi.js'
import { autoLineBreak } from '../shared/line-break'
import type { SubtitleCue, SubtitleLayoutCue, SubtitleStyleConfig } from '../shared/types'

export function buildSubtitleLayout(params: {
  cues: SubtitleCue[]
  style: SubtitleStyleConfig
  videoWidth: number
  measure: (text: string, fontSize: number) => number
}): SubtitleLayoutCue[] {
  return params.cues.map((cue) => ({
    ...cue,
    ...autoLineBreak({
      text: cue.text,
      style: params.style,
      videoWidth: params.videoWidth,
      measure: params.measure,
    }),
  }))
}

export function renderSubtitleFrame(params: {
  root: Container
  cues: SubtitleLayoutCue[]
  style: SubtitleStyleConfig
  timeMs: number
  width: number
  height: number
}) {
  const { root, cues, style, timeMs, width, height } = params
  root.removeChildren().forEach((child) => child.destroy({ children: true }))
  const cue = cues.find((item) => timeMs >= item.startMs && timeMs < item.endMs)
  if (!cue) return

  const text = new Text({
    text: cue.lines.map((line) => line.text).join('\n'),
    style: new TextStyle({
      fontFamily: style.fontFamily,
      fontSize: cue.fontSize,
      fontWeight: style.fontWeight as any,
      fill: style.color,
      stroke: { color: style.strokeColor, width: style.strokeWidth },
      align: 'center',
      lineHeight: Math.round(cue.fontSize * style.lineHeight),
    }),
  })
  text.anchor.set(0.5, 1)
  text.x = width / 2 + style.offsetX
  const baseY =
    style.position === 'top'
      ? height * style.safeAreaBottomRatio + text.height
      : style.position === 'middle'
        ? height / 2 + text.height / 2
        : height * (1 - style.safeAreaBottomRatio)
  text.y = baseY + style.offsetY
  root.addChild(text)
}
