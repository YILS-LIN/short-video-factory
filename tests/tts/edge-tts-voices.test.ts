import { describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  Constants,
  DRM,
  EdgeTTS,
  SEC_MS_GEC_VERSION,
  VOICE_HEADERS,
} from '../../electron/lib/edge-tts'

vi.mock('axios', () => ({ default: { get: vi.fn() } }))

describe('EdgeTTS voice list authentication', () => {
  it('uses the same v2 authentication as synthesis and preserves voice mapping', async () => {
    const token = '0123456789ABCDEF-' + 'A'.repeat(64)
    vi.spyOn(DRM, 'generateSecMsGec').mockReturnValue(token)
    const voice = {
      Name: 'test',
      ShortName: 'en-US-Test',
      FriendlyName: 'Test',
      Gender: 'Female',
      Locale: 'en-US',
      Status: 'GA',
      VoiceTag: { ContentCategories: [], VoicePersonalities: [] },
      SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3',
    }
    vi.mocked(axios.get).mockResolvedValue({ data: [voice] })
    await expect(new EdgeTTS().getVoices()).resolves.toEqual([voice])
    const [requestUrl, config] = vi.mocked(axios.get).mock.calls[0]
    const url = new URL(requestUrl)
    expect(url.searchParams.get('Sec-MS-GEC')).toBe(token)
    expect(url.searchParams.get('Sec-MS-GEC-Version')).toBe(SEC_MS_GEC_VERSION)
    expect(url.searchParams.get('trustedclienttoken')).toBe(Constants.TRUSTED_CLIENT_TOKEN)
    expect(config?.headers).toEqual(VOICE_HEADERS)
  })
})
