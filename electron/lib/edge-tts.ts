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

export const CHROMIUM_FULL_VERSION = '130.0.2849.68'
export const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.', 1)[0]
export const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`

export const WIN_EPOCH = 11644473600
export const S_TO_NS = 1e9

export const BASE_HEADERS = {
  'User-Agent': `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROMIUM_MAJOR_VERSION}.0.0.0 Safari/537.36 Edg/${CHROMIUM_MAJOR_VERSION}.0.0.0`,
  'Accept-Encoding': 'gzip, deflate, br',
  'Accept-Language': 'en-US,en;q=0.9',
}

export const WSS_HEADERS = {
  ...BASE_HEADERS,
  Pragma: 'no-cache',
  'Cache-Control': 'no-cache',
  Origin: 'chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold',
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

    function pushSrtNode() {
      const firstWord = currentSentence[0]
      const lastWord = currentSentence[currentSentence.length - 1]

      const textList = currentSentence.map((sentence) => sentence.text.Text)
      const joinedText = textList.reduce((acc, text, index) => {
        if (index === 0) return text
        const prevChar = acc[acc.length - 1]
        const currChar = text[0]
        const prevIsChinese = /[\u4e00-\u9fa5]/.test(prevChar)
        const currIsChinese = /[\u4e00-\u9fa5]/.test(currChar)
        return acc + (prevIsChinese && currIsChinese ? '' : ' ') + text
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
      const tooLong = () =>
        currentSentence.map((sentence) => sentence.text.Text).join('').length > 24

      const vocieGap = () =>
        word.Offset - (this.wordList[index - 1].Offset + this.wordList[index - 1].Duration) >
        100 * 10 ** 4

      if (index !== 0 && (tooLong() || vocieGap())) {
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
}

export class EdgeTTS {
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
    return new Promise((resolve, reject) => {
      const audioStream: Buffer[] = []
      const wordList: WordBoundary[] = []
      const requestId = this.generateUUID()
      const ws = new WebSocket(
        `${Constants.WSS_URL}?trustedclienttoken=${Constants.TRUSTED_CLIENT_TOKEN}` +
          `&Sec-MS-GEC=${DRM.generateSecMsGec()}` +
          `&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}` +
          `&ConnectionId=${requestId}`,
        {
          headers: WSS_HEADERS,
        },
      )

      const ssmlText = this.getSSML(text, voice, options)

      ws.on('open', () => {
        const configMessage = this.buildTTSConfigMessage()
        ws.send(configMessage)

        const speechMessage = this.buildSpeechMessage(requestId, ssmlText)
        ws.send(speechMessage)
      })

      ws.on('message', (data: Buffer) => {
        this.processCaptionData(data, wordList)
        this.processAudioData(data, audioStream, ws)
      })

      ws.on('close', () => {
        const result = new SynthesisResultImpl(wordList, audioStream)
        resolve(result)
      })

      ws.on('error', (error: Error) => {
        reject(error)
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
