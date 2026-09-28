// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import { VApp } from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import TtsControl from '../../src/views/Home/components/TtsControl.vue'

const mocks = vi.hoisted(() => ({
  appStore: {} as Record<string, unknown>,
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/store', () => ({ useAppStore: () => mocks.appStore }))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('vue-toastification', () => ({ useToast: () => mocks.toast }))

const voice = {
  Name: 'Microsoft Test Voice',
  ShortName: 'en-US-Test',
  FriendlyName: 'English (United States) - Test',
  Gender: 'Female',
  Locale: 'en-US',
  Status: 'GA',
  VoiceTag: { ContentCategories: [], VoicePersonalities: [] },
  SuggestedCodec: 'audio-24khz-48kbitrate-mono-mp3',
}

const createHost = () => {
  mocks.appStore = reactive({
    voice,
    speed: 0,
    originalVoicesList: [voice],
    languageList: ['English (United States)'],
    genderList: [{ label: 'Female', value: 'Female' }],
    speedList: [{ label: 'Medium', value: 0 }],
    tryListeningText: 'Hello',
  })

  const Host = defineComponent({
    setup() {
      return () => h(VApp, {}, () => h(TtsControl))
    },
  })
  const wrapper = mount(Host, {
    attachTo: document.body,
    global: { plugins: [createVuetify({ components, directives })] },
  })

  return {
    wrapper,
    control: wrapper.findComponent(TtsControl).vm as unknown as {
      synthesizedSpeechToFile: (options: {
        text: string
        withCaption?: boolean
        abortSignal?: AbortSignal
      }) => Promise<{ duration: number; srtText?: string }>
    },
  }
}

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('TtsControl synthesis cancellation bridge', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends the matching request id when the caller aborts and preserves AbortError', async () => {
    const deferred = createDeferred<{ duration: number; srtText: string }>()
    const invoke = vi.fn((..._args: unknown[]) => deferred.promise)
    const send = vi.fn()
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        edgeTtsGetVoiceList: vi.fn(() => Promise.resolve([voice])),
        edgeTtsSynthesizeToFile: invoke,
      },
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { send },
    })
    const { wrapper, control } = createHost()
    const controller = new AbortController()

    try {
      const synthesis = control.synthesizedSpeechToFile({
        text: 'Hello',
        withCaption: true,
        abortSignal: controller.signal,
      })
      await flushPromises()

      const requestId = (invoke.mock.calls[0][0] as { requestId: string }).requestId
      expect(requestId).toMatch(/^tts-\d+-\d+$/)
      expect(invoke).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Hello',
          voice: 'en-US-Test',
          withCaption: true,
          requestId,
        }),
      )

      controller.abort()
      expect(send).toHaveBeenCalledWith('cancel-edge-tts-synthesis', requestId)
      deferred.reject(new Error('IPC synthesis interrupted'))
      await expect(synthesis).rejects.toMatchObject({ name: 'AbortError' })
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('does not invoke IPC for an already aborted synthesis', async () => {
    const invoke = vi.fn(() => Promise.resolve({ duration: 1 }))
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        edgeTtsGetVoiceList: vi.fn(() => Promise.resolve([voice])),
        edgeTtsSynthesizeToFile: invoke,
      },
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { send: vi.fn() },
    })
    const { wrapper, control } = createHost()
    const controller = new AbortController()
    controller.abort()

    try {
      await expect(
        control.synthesizedSpeechToFile({
          text: 'Hello',
          abortSignal: controller.signal,
        }),
      ).rejects.toMatchObject({ name: 'AbortError' })
      expect(invoke).not.toHaveBeenCalled()
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })
})
