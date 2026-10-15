// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { defineComponent, h, reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Home from '../../src/views/Home/index.vue'

const mocks = vi.hoisted(() => ({
  RenderStatus: {
    None: 0,
    GenerateText: 1,
    SynthesizedSpeech: 2,
    SegmentVideo: 3,
    Rendering: 4,
    Completed: 5,
    Failed: 6,
  },
  store: {} as Record<string, unknown>,
  getTextForSynthesis: vi.fn(),
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
    warning: vi.fn(),
  },
}))

vi.mock('@/store', () => ({
  RenderStatus: mocks.RenderStatus,
  useAppStore: () => mocks.store,
}))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('vue-toastification', () => ({ useToast: () => mocks.toast }))

const TextGenerateStub = defineComponent({
  setup(_, { expose }) {
    expose({ getTextForSynthesis: () => mocks.getTextForSynthesis() })
    return () => h('div', { 'data-testid': 'text-generate-stub' })
  },
})

const VideoRenderStub = defineComponent({
  emits: ['render-video', 'cancel-render'],
  setup(_, { emit }) {
    return () =>
      h('button', { id: 'render-trigger', onClick: () => emit('render-video') }, 'Render')
  },
})

describe('Home render batch failure handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTextForSynthesis.mockReset()
  })

  it.each([
    ['stop', 10, 1],
    ['continue', 2, 2],
    ['continue', 10, 3],
  ] as const)(
    'handles %s policy with limit %s and %s failed attempts',
    async (onError, count, attempts) => {
      const storeState = reactive({
        renderConfig: {
          bgmPath: '',
          outputSize: { width: 1080, height: 1920 },
          outputPath: 'C:/render-output',
          outputFileName: 'video',
          outputFileExt: '.mp4',
        },
        autoBatch: true,
        batchConfig: { count, onError },
        renderStatus: mocks.RenderStatus.None,
        updateRenderStatus(status: number) {
          this.renderStatus = status
        },
      })
      mocks.store = storeState
      mocks.getTextForSynthesis.mockRejectedValue(new Error('Generation failed'))
      Object.defineProperty(window, 'electron', {
        configurable: true,
        value: {
          platform: 'win32',
          statTrack: vi.fn(() => Promise.resolve()),
        },
      })
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
      const wrapper = mount(Home, {
        attachTo: document.body,
        global: {
          stubs: {
            TextGenerate: TextGenerateStub,
            VideoManage: true,
            TtsControl: true,
            VideoRender: VideoRenderStub,
            GenerationOptions: true,
            TopBar: true,
          },
        },
      })

      try {
        await wrapper.find('#render-trigger').trigger('click')
        await flushPromises()

        expect(mocks.getTextForSynthesis).toHaveBeenCalledTimes(attempts)
        expect(storeState.renderStatus).toBe(mocks.RenderStatus.Failed)
        expect(mocks.toast.error).toHaveBeenCalledTimes(attempts)
        expect(consoleError).toHaveBeenCalledTimes(attempts)
      } finally {
        wrapper.unmount()
        document.body.innerHTML = ''
      }
    },
  )
})
