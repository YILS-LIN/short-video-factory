import { describe, expect, it, vi } from 'vitest'
import {
  estimateVideoDuration,
  formatPlaybackDuration,
} from '../../src/lib/video-duration-estimate'

describe('engine-independent playback duration estimate', () => {
  it.each([
    '欢迎来到短视频工厂，今天一起分享生活中的小美好。',
    'Let us take a walk and enjoy the world around us.',
    '今日はコーヒーを飲みながら、楽しい一日を始めましょう。',
    '오늘은 새로운 하루를 함께 시작해 보겠습니다.',
    'Давайте начнём новый день с хорошего настроения.',
    'مرحبا بكم في يوم جديد مليء بالأمل والعمل.',
    'आइए आज एक नई शुरुआत करें और कुछ अच्छा सीखें।',
    'วันนี้เราจะมาเรียนรู้เรื่องราวดีๆด้วยกัน',
    'Chào mừng bạn đến với một ngày mới đầy niềm vui.',
    'Καλημέρα, ας ξεκινήσουμε μια όμορφη ημέρα.',
    'שלום לכולם, בואו נתחיל יום חדש ביחד.',
    '今天使用AI整理Word文档，再制作PPT。Hello world！',
    '2026年11月8日，优惠30%，只要99.5元。',
    '了解更多：https://example.com/hello，或查看 <b>说明</b>。',
  ])('returns a single finite positive estimate without a language allowlist: %s', (text) => {
    const seconds = estimateVideoDuration(text)
    expect(Number.isFinite(seconds)).toBe(true)
    expect(Number.isInteger(seconds)).toBe(true)
    expect(seconds).toBeGreaterThan(0)
    expect(estimateVideoDuration(text)).toBe(seconds)
  })

  it.each(['', '  \n\t', '……！？', '🎉✨', '\u0301'])(
    'does not estimate non-spoken content: %s',
    (text) => {
      expect(estimateVideoDuration(text)).toBe(0)
    },
  )

  it('weights dense scripts by characters and other words by length', () => {
    expect(estimateVideoDuration('你好'.repeat(50))).toBe(22)
    expect(estimateVideoDuration('あい'.repeat(50))).toBe(14)
    expect(estimateVideoDuration('안녕'.repeat(50))).toBe(20)
    expect(estimateVideoDuration('hi '.repeat(100))).toBe(32)
    expect(estimateVideoDuration('extraordinary '.repeat(100))).toBeGreaterThan(32)
    expect(estimateVideoDuration('𠮷'.repeat(100))).toBe(22)
  })

  it('increases with content and pauses, but counts repeated punctuation once', () => {
    const text = '今天一起学习整理房间的小技巧。'
    expect(estimateVideoDuration(text.repeat(3))).toBeGreaterThan(estimateVideoDuration(text))
    expect(estimateVideoDuration('你好，'.repeat(30))).toBeGreaterThan(
      estimateVideoDuration('你好'.repeat(30)),
    )
    expect(estimateVideoDuration('你好！！！')).toBe(estimateVideoDuration('你好！'))
    expect(estimateVideoDuration('１２３４５６７８９０')).toBe(estimateVideoDuration('1234567890'))
    expect(estimateVideoDuration('123.45 '.repeat(20))).toBe(
      estimateVideoDuration('12345 '.repeat(20)),
    )
    expect(estimateVideoDuration('I')).toBe(1)
  })

  it('also estimates long text without the previous unsupported-content limit', () => {
    const seconds = estimateVideoDuration('欢迎'.repeat(26_000))
    expect(Number.isFinite(seconds)).toBe(true)
    expect(seconds).toBe(11_440)
  })

  it('falls back to Unicode word/length weighting when Segmenter is unavailable', () => {
    const original = Object.getOwnPropertyDescriptor(Intl, 'Segmenter')!
    Object.defineProperty(Intl, 'Segmenter', { configurable: true, value: undefined })
    try {
      for (const text of [
        'Hello world',
        'مرحبا بالعالم',
        'नमस्ते दुनिया',
        'สวัสดีทุกคน',
        '中文 English 123',
      ]) {
        expect(estimateVideoDuration(text)).toBeGreaterThan(0)
      }
      expect(estimateVideoDuration('你好'.repeat(50))).toBe(22)
    } finally {
      Object.defineProperty(Intl, 'Segmenter', original)
    }
  })

  it('does not make network or TTS calls', () => {
    const fetch = vi.fn()
    vi.stubGlobal('fetch', fetch)
    try {
      estimateVideoDuration('正常朗读速度下的通用文案。')
      expect(fetch).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('formats one playback time across minute and hour boundaries', () => {
    expect(formatPlaybackDuration(5)).toBe('00:05')
    expect(formatPlaybackDuration(65)).toBe('01:05')
    expect(formatPlaybackDuration(3605)).toBe('1:00:05')
    expect(formatPlaybackDuration(NaN)).toBe('00:00')
  })
})
