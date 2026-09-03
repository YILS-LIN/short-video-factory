import Crypto from 'crypto'
import axios from 'axios'
import WebSocket from 'ws'
import { writeFileSync } from 'node:fs'
import { stringifySync as subtitleStringifySync, type NodeList as SubtitleNodeList } from 'subtitle'

export const Constants = {
  TRUSTED_CLIENT_TOKEN: '6A5AA1D4EAFF4E9FB37E23D68491D6F4',
  WSS_URL: 'wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1',
  VOICES_URL: 'https://speech.platform.bing.com/consumer/speech/synthesize/readaloud/voices/list',
}

const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud'

export const WSS_URL_CONST = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${Constants.TRUSTED_CLIENT_TOKEN}`
export const VOICE_LIST_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${Constants.TRUSTED_CLIENT_TOKEN}`

export const CHROMIUM_FULL_VERSION = '143.0.3650.75'
export const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.', 1)[0]
export const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`

export const WIN_EPOCH = 11644473600
export const S_TO_NS = 1e9

export const BASE_HEADERS = {
  'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
  'Accept-Encoding': 'gzip, deflate, br, zstd',
  'Accept-Language': 'en-US,en;q=0.9',
}

export const WSS_HEADERS = {
  ...BASE_HEADERS,
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
  'Sec-WebSocket-Version': '13',
}

export const VOICE_HEADERS = {
  ...BASE_HEADERS,
  Authority: 'speech.platform.bing.com',
  'Sec-CH-UA': `" Not;A Brand";v="99", "Microsoft Edge";v="${CHROMIUM_MAJOR_VERSION}", "Chromium";v="${CHROMIUM_MAJOR_VERSION}"`,
  'Sec-CH-UA-Mobile': '?0',
  Accept: '*/*',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
}

export const AUDIO_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'
export const AUDIO_EXTENSION = '.mp3'

export const AUDIO_METADATA: AudioMetadata = {
  format: 'mp3',
  bitrate: '48k',
  sampleRate: 24000,
  channels: 1,
}

export enum EdgeTTSGender {
  MALE = 'Male',
  FEMALE = 'Female',
  NEUTRAL = 'Neutral',
}

export interface VoiceTag {
  ContentCategories: string[]
  VoicePersonalities: string[]
}

export interface EdgeTTSVoice {
  Name: string
  ShortName: string
  FriendlyName: string
  Gender: EdgeTTSGender
  Locale: string
  Status: string
  VoiceTag: VoiceTag
  SuggestedCodec: string
}

export interface SynthesisOptions {
  pitch?: number // Hz, -100 to 100
  rate?: number // Percentage, -100 to 100
  volume?: number // Percentage, -100 to 100
}

export interface AudioMetadata {
  format: string
  bitrate: string
  sampleRate: number
  channels: number
}

export interface WordBoundary {
  Offset: number
  Duration: number
  text: {
    Text: string
    Length: number
    BoundaryType: string
  }
}

export interface SynthesisResult {
  /**
   * Convert audio data to Base64 string
   */
  toBase64(): string

  /**
   * Save audio data to file
   * @param outputPath - Output file path (without extension)
   */
  toFile(outputPath: string): Promise<void>

  /**
   * Get audio buffer directly
   */
  getBuffer(): Buffer

  /**
   * Get audio format
   */
  getFormat(): string

  /**
   * Get audio metadata
   */
  getMetadata(): AudioMetadata

  /**
   * Get audio size in bytes
   */
  getSize(): number

  /**
   * Get Caption Srt String
   */
  getCaptionSrtString(): string

  /**
   * Get raw word boundaries for combining chunked synthesis results.
   */
  getWordList(): readonly WordBoundary[]
}

export type EdgeTTSErrorCode =
  | 'WEBSOCKET_CONNECTION_FAILED'
  | 'WEBSOCKET_503'
  | 'WEBSOCKET_CLOSED_EARLY'
  | 'NO_AUDIO_RECEIVED'
  | 'INVALID_AUDIO_BUFFER'

export interface EdgeTTSDiagnostics {
  requestId: string
  attempt: number
  voice: string
  textLength: number
  startedAt: string
  elapsedMs?: number
  messageTypes: string[]
  messageCounts: Record<string, number>
  audioBytes: number
  closeCode?: number
  closeReason?: string
  error?: string
}

export class EdgeTTSError extends Error {
  constructor(
    public readonly code: EdgeTTSErrorCode,
    message: string,
    public readonly diagnostics: EdgeTTSDiagnostics,
    public readonly retryable: boolean,
    public readonly cause?: unknown,
  ) {
    super(message)
    this.name = 'EdgeTTSError'
  }
}

const MAX_RETRIES = 3
const RETRY_DELAYS_MS = [1000, 3000, 7000]
const MAX_MP3_HEADER_SCAN_BYTES = 16 * 1024
const MIN_VALID_AUDIO_BYTES = 512
const WEBSOCKET_HANDSHAKE_TIMEOUT_MS = 15_000
const WEBSOCKET_IDLE_TIMEOUT_MS = 30_000
const AUDIO_BITS_PER_SECOND = 48_000

function getWebSocketMessagePath(data: Buffer): string | undefined {
  const marker = Buffer.from('Path:')
  const start = data.indexOf(marker)
  if (start === -1) return undefined

  const valueStart = start + marker.length
  const end = data.indexOf(Buffer.from('\r\n'), valueStart)
  if (end === -1) return undefined
  return data.subarray(valueStart, end).toString('utf-8').trim()
}

/** Reject obvious non-MP3 responses before they can reach video rendering. */
export function hasMp3FrameHeader(buffer: Buffer): boolean {
  if (buffer.length < MIN_VALID_AUDIO_BYTES) return false

  const scanLength = Math.min(buffer.length - 3, MAX_MP3_HEADER_SCAN_BYTES)
  for (let index = 0; index < scanLength; index++) {
    const first = buffer[index]
    const second = buffer[index + 1]
    const third = buffer[index + 2]
    const mpegVersion = (second >> 3) & 0x03
    if (
      first === 0xff &&
      (second & 0xe0) === 0xe0 &&
      mpegVersion !== 0x01 &&
      (second & 0x06) !== 0 &&
      ((third >> 4) & 0x0f) !== 0 &&
      ((third >> 4) & 0x0f) !== 0x0f
    ) {
      return true
    }
  }
  return false
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function getRetryDelayMs(retryIndex: number): number {
  const baseDelay = RETRY_DELAYS_MS[retryIndex] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]
  // Keep retries from forming a predictable request burst across clients.
  const jitter = Math.round(Math.random() * 400 - 200)
  return Math.max(0, baseDelay + jitter)
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const INCOMPATIBLE_CODE_RANGES = [
  [0, 8],
  [11, 12],
  [14, 31],
]

function removeIncompatibleCharacters(text: string): string {
  const chars = text.split('')
  for (let idx = 0; idx < chars.length; idx++) {
    const code = chars[idx].codePointAt(0) ?? 0
    for (const [start, end] of INCOMPATIBLE_CODE_RANGES) {
      if (code >= start && code <= end) {
        chars[idx] = ' '
        break
      }
    }
  }
  return chars.join('')
}

function findLastNewlineOrSpaceWithinLimit(text: Buffer, limit: number): number {
  const newlineIndex = text.lastIndexOf(Buffer.from('\n'), limit)
  if (newlineIndex >= 0) {
    return newlineIndex
  }
  return text.lastIndexOf(Buffer.from(' '), limit)
}

function findSafeUtf8SplitPoint(textSegment: Buffer): number {
  let splitAt = textSegment.length
  while (splitAt > 0) {
    try {
      textSegment.subarray(0, splitAt).toString('utf-8')
      return splitAt
    } catch {
      splitAt--
    }
  }
  return splitAt
}

function adjustSplitPointForXmlEntity(text: Buffer, splitAt: number): number {
  while (splitAt > 0) {
    const ampersandIndex = text.subarray(0, splitAt).lastIndexOf(Buffer.from('&'))
    if (ampersandIndex < 0) {
      break
    }
    const semicolonIndex = text.subarray(ampersandIndex, splitAt).indexOf(Buffer.from(';'))
    if (semicolonIndex >= 0) {
      break
    }
    splitAt = ampersandIndex
  }
  return splitAt
}

export function splitTextByByteLength(text: string | Buffer, byteLength: number): string[] {
  const chunks: string[] = []
  let currentText = Buffer.isBuffer(text) ? text : Buffer.from(text, 'utf-8')

  if (byteLength <= 0) {
    throw new Error('byteLength must be greater than 0')
  }

  while (currentText.length > byteLength) {
    let splitAt = findLastNewlineOrSpaceWithinLimit(currentText, byteLength)

    if (splitAt < 0) {
      splitAt = findSafeUtf8SplitPoint(currentText)
    }

    splitAt = adjustSplitPointForXmlEntity(currentText, splitAt)

    if (splitAt < 0) {
      throw new Error('Maximum byte length is too small or invalid text structure')
    }

    let chunk = currentText.subarray(0, splitAt).toString('utf-8').trim()
    if (chunk) {
      chunks.push(chunk)
    }

    currentText = splitAt > 0 ? currentText.subarray(splitAt) : currentText.subarray(1)
  }

  const remainingChunk = currentText.toString('utf-8').trim()
  if (remainingChunk) {
    chunks.push(remainingChunk)
  }

  return chunks
}

class SkewAdjustmentError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SkewAdjustmentError'
  }
}

export class DRM {
  private static clockSkewSeconds: number = 0.0

  /**
   * Adjusts the clock skew in seconds.
   */
  static adjClockSkewSeconds(skewSeconds: number): void {
    DRM.clockSkewSeconds += skewSeconds
  }

  /**
   * Gets the current Unix timestamp with skew correction.
   */
  static getUnixTimestamp(): number {
    return Date.now() / 1000 + DRM.clockSkewSeconds
  }

  /**
   * Parses an RFC 2616 date string into a Unix timestamp.
   */
  static parseRfc2616Date(date: string): number | null {
    const parsed = new Date(date)
    return isNaN(parsed.getTime()) ? null : parsed.getTime() / 1000
  }

  /**
   * Handles client response error and adjusts clock skew accordingly.
   */
  static handleClientResponseError(error: any): void {
    const headers = error.headers
    if (!headers) {
      throw new SkewAdjustmentError('No server date in headers.')
    }

    const serverDate: string | undefined = headers.get ? headers.get('Date') : headers['date']
    if (!serverDate || typeof serverDate !== 'string') {
      throw new SkewAdjustmentError('No server date in headers.')
    }

    const serverTimestamp = DRM.parseRfc2616Date(serverDate)
    if (serverTimestamp === null) {
      throw new SkewAdjustmentError(`Failed to parse server date: ${serverDate}`)
    }

    const clientTimestamp = DRM.getUnixTimestamp()
    DRM.adjClockSkewSeconds(serverTimestamp - clientTimestamp)
  }

  /**
   * Generates the Sec-MS-GEC token.
   */
  static generateSecMsGec(): string {
    let ticks = DRM.getUnixTimestamp()

    // Convert to Windows file time
    ticks += WIN_EPOCH

    // Round down to nearest 5 minutes (300 seconds)
    ticks -= ticks % 300

    // Convert to 100-nanosecond intervals
    ticks *= S_TO_NS / 100

    const strToHash = `${Math.floor(ticks)}${Constants.TRUSTED_CLIENT_TOKEN}`
    const hash = Crypto.createHash('sha256')
    hash.update(strToHash, 'ascii')
    return hash.digest('hex').toUpperCase()
  }
}

class SynthesisResultImpl implements SynthesisResult {
  private readonly wordList: WordBoundary[]
  private readonly audioBuffer: Buffer

  constructor(wordList: WordBoundary[], audioData: Buffer[]) {
    this.wordList = wordList
    this.audioBuffer = Buffer.concat(audioData)
  }

  toBase64(): string {
    if (this.audioBuffer.length === 0) {
      throw new Error('No audio data available.')
    }
    return this.audioBuffer.toString('base64')
  }

  async toFile(outputPath: string): Promise<void> {
    if (this.audioBuffer.length === 0) {
      throw new Error('No audio data available to save.')
    }

    if (outputPath.endsWith(AUDIO_EXTENSION)) {
      writeFileSync(outputPath, this.audioBuffer)
    } else {
      writeFileSync(`${outputPath}${this.getExtension()}`, this.audioBuffer)
    }
  }

  getBuffer(): Buffer {
    return this.audioBuffer
  }

  getFormat(): string {
    return AUDIO_FORMAT
  }

  getExtension(): string {
    return AUDIO_EXTENSION
  }

  getMetadata(): AudioMetadata {
    return AUDIO_METADATA
  }

  getSize(): number {
    return this.audioBuffer.length
  }

  getCaptionSrtString(): string {
    let srtCaptionList: SubtitleNodeList = []
    let currentSentence: WordBoundary[] = []

    const isNoSpaceScript = (char: string): boolean => {
      const regex = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]/u
      return regex.test(char)
    }

    function pushSrtNode() {
      const firstWord = currentSentence[0]
      const lastWord = currentSentence[currentSentence.length - 1]

      const textList = currentSentence.map((sentence) => sentence.text.Text)
      const joinedText = textList.reduce((acc, text, index) => {
        if (index === 0) return text
        const prevChar = acc[acc.length - 1]
        const currChar = text[0]
        const prevIsCompact = isNoSpaceScript(prevChar)
        const currIsCompact = isNoSpaceScript(currChar)
        return acc + (prevIsCompact && currIsCompact ? '' : ' ') + text
      }, '')

      srtCaptionList.push({
        type: 'cue',
        data: {
          start: firstWord.Offset / 10000,
          end: (lastWord.Offset + lastWord.Duration) / 10 ** 4,
          text: joinedText,
        },
      })
    }

    this.wordList.forEach((word, index) => {
      // const tooLong = () =>
      //   currentSentence.map((sentence) => sentence.text.Text).join('').length > 24

      const vocieGap = () =>
        word.Offset - (this.wordList[index - 1].Offset + this.wordList[index - 1].Duration) >
        100 * 10 ** 4

      if (index !== 0 && vocieGap()) {
        pushSrtNode()
        currentSentence = [word]
        return
      }

      currentSentence.push(word)
    })

    if (currentSentence.length) {
      pushSrtNode()
      currentSentence = []
    }

    return subtitleStringifySync(srtCaptionList, { format: 'SRT' })
  }

  getWordList(): readonly WordBoundary[] {
    return this.wordList
  }
}

export class EdgeTTS {
  private synthesisQueue: Promise<void> = Promise.resolve()

  async getVoices(): Promise<EdgeTTSVoice[]> {
    const response = await axios.get(
      `${Constants.VOICES_URL}?trustedclienttoken=${Constants.TRUSTED_CLIENT_TOKEN}`,
      {
        headers: VOICE_HEADERS,
      },
    )
    const voices: EdgeTTSVoice[] = response.data
    return voices.map((voice) => ({
      Name: voice.Name,
      ShortName: voice.ShortName,
      FriendlyName: voice.FriendlyName,
      Gender: voice.Gender,
      Locale: voice.Locale,
      Status: voice.Status,
      VoiceTag: voice.VoiceTag,
      SuggestedCodec: voice.SuggestedCodec,
    }))
  }

  private generateUUID(): string {
    return 'xxxxxxxx-xxxx-xxxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
      const random = (Math.random() * 16) | 0
      const value = char === 'x' ? random : (random & 0x3) | 0x8
      return value.toString(16)
    })
  }

  private validatePitch(pitch: number): number {
    if (!Number.isInteger(pitch) || pitch < -100 || pitch > 100) {
      throw new Error('Invalid pitch value. Expected integer between -100 and 100 Hz.')
    }
    return pitch
  }

  private validateRate(rate: number): number {
    if (isNaN(rate) || rate < -100 || rate > 100) {
      throw new Error('Invalid rate value. Expected integer between -100 and 100%.')
    }
    return rate
  }

  private validateVolume(volume: number): number {
    if (!Number.isInteger(volume) || volume < -100 || volume > 100) {
      throw new Error('Invalid volume value. Expected integer between -100 and 100%.')
    }
    return volume
  }

  /**
   * Synthesize text to speech and return a result object with audio manipulation methods
   * @param text - Text to synthesize
   * @param voice - Voice to use for synthesis
   * @param options - Synthesis options (pitch, rate, volume)
   * @returns SynthesisResult object with audio data and methods
   */
  async synthesize(
    text: string,
    voice: string = 'en-US-AnaNeural',
    options: SynthesisOptions = {},
  ): Promise<SynthesisResult> {
    return this.enqueue(() => this.synthesizeQueued(text, voice, options))
  }

  private async enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const previous = this.synthesisQueue
    let release: () => void = () => undefined
    this.synthesisQueue = new Promise((resolve) => {
      release = resolve
    })

    return previous.then(operation, operation).finally(release)
  }

  private async synthesizeQueued(
    text: string,
    voice: string,
    options: SynthesisOptions,
  ): Promise<SynthesisResult> {
    const cleanedText = removeIncompatibleCharacters(text)
    const textChunks = splitTextByByteLength(cleanedText, 4096)

    if (textChunks.length === 1) {
      return this.synthesizeSingleWithRetry(text, voice, options)
    }

    const allAudioData: Buffer[] = []
    const allWordList: WordBoundary[] = []
    let offsetCompensation = 0
    for (const chunk of textChunks) {
      const result = await this.synthesizeSingleWithRetry(chunk, voice, options)
      const audioData = result.getBuffer()
      if (audioData.length > 0) {
        allAudioData.push(audioData)
      }
      allWordList.push(
        ...result.getWordList().map((word) => ({
          ...word,
          Offset: word.Offset + offsetCompensation,
        })),
      )
      offsetCompensation += Math.round((audioData.length * 8 * 10 ** 7) / AUDIO_BITS_PER_SECOND)
    }

    return new SynthesisResultImpl(allWordList, allAudioData)
  }

  private async synthesizeSingleWithRetry(
    text: string,
    voice: string,
    options: SynthesisOptions,
  ): Promise<SynthesisResult> {
    let lastError: unknown
    for (let attempt = 1; attempt <= MAX_RETRIES + 1; attempt++) {
      try {
        return await this.synthesizeSingle(text, voice, options, attempt)
      } catch (error) {
        lastError = error
        const retryable = error instanceof EdgeTTSError && error.retryable
        if (!retryable || attempt > MAX_RETRIES) {
          throw error
        }

        const delayMs = getRetryDelayMs(attempt - 1)
        console.warn('[EdgeTTS] synthesis-retry-scheduled', {
          code: error.code,
          attempt,
          nextAttempt: attempt + 1,
          delayMs,
          diagnostics: error.diagnostics,
        })
        await wait(delayMs)
      }
    }
    throw lastError
  }

  private async synthesizeSingle(
    text: string,
    voice: string,
    options: SynthesisOptions,
    attempt: number,
  ): Promise<SynthesisResult> {
    // Validate local SSML inputs before opening a network connection.
    const ssmlText = this.getSSML(text, voice, options)

    return new Promise((resolve, reject) => {
      const audioStream: Buffer[] = []
      const wordList: WordBoundary[] = []
      const requestId = this.generateUUID()
      const startedAt = Date.now()
      const diagnostics: EdgeTTSDiagnostics = {
        requestId,
        attempt,
        voice,
        textLength: text.length,
        startedAt: new Date(startedAt).toISOString(),
        messageTypes: [],
        messageCounts: {},
        audioBytes: 0,
      }
      let settled = false
      let receivedTurnEnd = false
      let idleTimeout: NodeJS.Timeout | undefined
      const ws = new WebSocket(
        `${Constants.WSS_URL}?trustedclienttoken=${Constants.TRUSTED_CLIENT_TOKEN}` +
          `&Sec-MS-GEC=${DRM.generateSecMsGec()}` +
          `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
          `&ConnectionId=${requestId}`,
        {
          headers: WSS_HEADERS,
          handshakeTimeout: WEBSOCKET_HANDSHAKE_TIMEOUT_MS,
        },
      )

      const clearIdleTimeout = () => {
        if (idleTimeout) {
          clearTimeout(idleTimeout)
          idleTimeout = undefined
        }
      }

      const resetIdleTimeout = () => {
        if (settled) return
        clearIdleTimeout()
        idleTimeout = setTimeout(() => {
          finishWithError('WEBSOCKET_CLOSED_EARLY', 'WebSocket 长时间未收到上游消息', true)
          ws.terminate()
        }, WEBSOCKET_IDLE_TIMEOUT_MS)
      }

      const recordMessage = (path: string | undefined) => {
        if (!path) return
        diagnostics.messageTypes.push(path)
        diagnostics.messageCounts[path] = (diagnostics.messageCounts[path] ?? 0) + 1
      }

      const finishWithError = (
        code: EdgeTTSErrorCode,
        message: string,
        retryable: boolean,
        cause?: unknown,
      ) => {
        if (settled) return
        settled = true
        clearIdleTimeout()
        diagnostics.elapsedMs = Date.now() - startedAt
        diagnostics.audioBytes = audioStream.reduce((total, chunk) => total + chunk.length, 0)
        diagnostics.error = cause ? getErrorMessage(cause) : message
        const detail = JSON.stringify({
          attempt: diagnostics.attempt,
          voice: diagnostics.voice,
          textLength: diagnostics.textLength,
          audioBytes: diagnostics.audioBytes,
          closeCode: diagnostics.closeCode,
          messageTypes: diagnostics.messageTypes,
          cause: diagnostics.error,
        })
        const error = new EdgeTTSError(
          code,
          `${message}；诊断：${detail}`,
          diagnostics,
          retryable,
          cause,
        )
        console.error('[EdgeTTS] synthesis-attempt-failed', {
          code,
          retryable,
          diagnostics,
        })
        reject(error)
      }

      ws.on('open', () => {
        try {
          ws.send(this.buildTTSConfigMessage())
          ws.send(this.buildSpeechMessage(requestId, ssmlText))
          resetIdleTimeout()
        } catch (error) {
          finishWithError('WEBSOCKET_CONNECTION_FAILED', 'WebSocket 请求发送失败', true, error)
          ws.terminate()
        }
      })

      ws.on('message', (data: Buffer) => {
        resetIdleTimeout()
        const messagePath = getWebSocketMessagePath(data)
        recordMessage(messagePath)
        try {
          if (messagePath === 'turn.end') {
            receivedTurnEnd = true
          }
          this.processCaptionData(data, wordList)
          this.processAudioData(data, audioStream, ws)
        } catch (error) {
          finishWithError('WEBSOCKET_CLOSED_EARLY', 'WebSocket 消息解析失败', false, error)
          ws.terminate()
        }
      })

      ws.on('unexpected-response', (_request, response) => {
        const statusCode = response.statusCode
        finishWithError(
          statusCode === 503 ? 'WEBSOCKET_503' : 'WEBSOCKET_CONNECTION_FAILED',
          statusCode === 503
            ? 'WebSocket 连接被 Microsoft 上游拒绝（503）'
            : `WebSocket 连接失败（HTTP ${statusCode ?? 'unknown'}）`,
          true,
        )
        ws.terminate()
      })

      ws.on('close', (code, reason) => {
        diagnostics.closeCode = code
        diagnostics.closeReason = reason.toString('utf-8') || undefined
        if (settled) return
        if (!receivedTurnEnd) {
          finishWithError('WEBSOCKET_CLOSED_EARLY', 'WebSocket 在收到 turn.end 前关闭', true)
          return
        }

        const result = new SynthesisResultImpl(wordList, audioStream)
        const buffer = result.getBuffer()
        if (buffer.length === 0) {
          const receivedAudioMessage = (diagnostics.messageCounts.audio ?? 0) > 0
          finishWithError(
            receivedAudioMessage ? 'INVALID_AUDIO_BUFFER' : 'NO_AUDIO_RECEIVED',
            receivedAudioMessage ? '收到 audio 消息但 Buffer 为空' : '未收到 audio 消息',
            true,
          )
          return
        }
        if (!hasMp3FrameHeader(buffer)) {
          finishWithError(
            'INVALID_AUDIO_BUFFER',
            '已收到 audio 消息，但 Buffer 不包含有效 MP3 帧',
            true,
          )
          return
        }
        settled = true
        clearIdleTimeout()
        diagnostics.elapsedMs = Date.now() - startedAt
        diagnostics.audioBytes = buffer.length
        console.debug('[EdgeTTS] synthesis-attempt-completed', diagnostics)
        resolve(result)
      })

      ws.on('error', (error: Error) => {
        finishWithError('WEBSOCKET_CONNECTION_FAILED', 'WebSocket 连接异常', true, error)
        ws.terminate()
      })
    })
  }

  private getSSML(text: string, voice: string, options: SynthesisOptions): string {
    const pitch = this.validatePitch(options.pitch ?? 0)
    const rate = this.validateRate(options.rate ?? 0)
    const volume = this.validateVolume(options.volume ?? 0)

    return `<speak version='1.0' xml:lang='en-US'>
      <voice name='${voice}'>
        <prosody pitch='${pitch}Hz' rate='${rate}%' volume='${volume}%'>
          ${text}
        </prosody>
      </voice>
    </speak>`
  }

  private buildTTSConfigMessage(): string {
    const audioFormat = AUDIO_FORMAT
    const timestamp = new Date().toISOString() + 'Z'
    return (
      `X-Timestamp:${timestamp}\r\n` +
      `Content-Type:application/json; charset=utf-8\r\n` +
      `Path:speech.config\r\n\r\n` +
      JSON.stringify({
        context: {
          synthesis: {
            audio: {
              metadataoptions: {
                sentenceBoundaryEnabled: false,
                wordBoundaryEnabled: true,
              },
              outputFormat: audioFormat,
            },
          },
        },
      })
    )
  }

  private buildSpeechMessage(requestId: string, ssmlText: string): string {
    const timestamp = new Date().toISOString() + 'Z'
    return (
      `X-RequestId:${requestId}\r\n` +
      `Content-Type:application/ssml+xml\r\n` +
      `X-Timestamp:${timestamp}\r\n` +
      `Path:ssml\r\n\r\n${ssmlText}`
    )
  }

  private processCaptionData(data: Buffer, wordBoundaryList: WordBoundary[]): void {
    const needle = Buffer.from('Path:audio.metadata\r\n')

    const startIndex = data.indexOf(needle)

    if (startIndex !== -1) {
      const metaData = JSON.parse(
        data.subarray(startIndex + needle.length).toString('utf-8'),
      )?.Metadata

      if (metaData[0]?.Type === 'WordBoundary') {
        wordBoundaryList.push(metaData[0].Data)
      }
    }
  }

  private processAudioData(data: Buffer, audioStream: Buffer[], ws: WebSocket): void {
    const needle = Buffer.from('Path:audio\r\n')

    const startIndex = data.indexOf(needle)

    if (startIndex !== -1) {
      const audioData = data.subarray(startIndex + needle.length)

      if (audioData.length > 0) {
        audioStream.push(audioData)
      }
    }

    if (data.includes('Path:turn.end')) {
      ws.close()
    }
  }
}
