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
  synthesizeSpeech: vi.fn(),
  getVideoSegments: vi.fn(),
  random: {
    choice: vi.fn(),
    integer: vi.fn(() => 0),
  },
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
vi.mock('random', () => ({ default: mocks.random }))

const TextGenerateStub = defineComponent({
  setup(_, { expose }) {
    expose({
      clearOutputText: vi.fn(),
      getTextForSynthesis: () => mocks.getTextForSynthesis(),
      handleStopGenerate: vi.fn(),
    })
    return () => h('div', { 'data-testid': 'text-generate-stub' })
  },
})

const TtsControlStub = defineComponent({
  setup(_, { expose }) {
    expose({ synthesizedSpeechToFile: (options: unknown) => mocks.synthesizeSpeech(options) })
    return () => h('div', { 'data-testid': 'tts-control-stub' })
  },
})

const VideoManageStub = defineComponent({
  setup(_, { expose }) {
    expose({ getVideoSegments: (options: unknown) => mocks.getVideoSegments(options) })
    return () => h('div', { 'data-testid': 'video-manage-stub' })
  },
})

const VideoRenderStub = defineComponent({
  emits: ['render-video', 'cancel-render'],
  setup(_, { emit }) {
    return () =>
      h('div', [
        h('button', { id: 'render-trigger', onClick: () => emit('render-video') }, 'Render'),
        h('button', { id: 'cancel-trigger', onClick: () => emit('cancel-render') }, 'Cancel'),
      ])
  },
})

const createDeferred = <T>() => {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

describe('Home video render flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.getTextForSynthesis.mockReset()
    mocks.synthesizeSpeech.mockReset()
    mocks.getVideoSegments.mockReset()
    mocks.random.integer.mockReturnValue(0)
  })

  it('preserves render arguments with spaces and does not continue auto-batch after cancellation', async () => {
    const storeState = reactive({
      renderConfig: {
        bgmPath: '',
        outputSize: { width: 720, height: 1280 },
        outputPath: 'C:/video output',
        outputFileName: 'my video',
        outputFileExt: '.mp4',
      },
      autoBatch: true,
      renderStatus: mocks.RenderStatus.None,
      updateRenderStatus(status: number) {
        this.renderStatus = status
      },
    })
    const renderDeferred = createDeferred<{ stdout: string; stderr: string; code: number }>()
    const renderVideo = vi.fn(() => renderDeferred.promise)
    mocks.store = storeState
    mocks.getTextForSynthesis.mockResolvedValue('A generated script')
    mocks.synthesizeSpeech.mockResolvedValue({ duration: 8, srtText: 'subtitle text' })
    mocks.getVideoSegments.mockResolvedValue({
      videoFiles: ['C:/video assets/scene 1.mp4'],
      timeRanges: [['1.000', '9.000']],
    })
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        platform: 'win32',
        renderVideo,
        statTrack: vi.fn(() => Promise.resolve()),
      },
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { send: vi.fn() },
    })

    const wrapper = mount(Home, {
      attachTo: document.body,
      global: {
        stubs: {
          TextGenerate: TextGenerateStub,
          VideoManage: VideoManageStub,
          TtsControl: TtsControlStub,
          VideoRender: VideoRenderStub,
          TopBar: true,
        },
      },
    })

    try {
      await wrapper.find('#render-trigger').trigger('click')
      await vi.waitFor(() => expect(renderVideo).toHaveBeenCalledTimes(1))

      expect(renderVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          videoFiles: ['C:/video assets/scene 1.mp4'],
          timeRanges: [['1.000', '9.000']],
          audioFiles: { bgm: undefined },
          subtitleText: 'subtitle text',
          outputSize: { width: 720, height: 1280 },
          outputDuration: '8',
          outputPath: 'C:/video output/my video.mp4',
        }),
      )

      await wrapper.find('#cancel-trigger').trigger('click')
      renderDeferred.resolve({ stdout: '', stderr: 'cancelled', code: 255 })
      await flushPromises()

      expect(renderVideo).toHaveBeenCalledTimes(1)
      expect(mocks.getTextForSynthesis).toHaveBeenCalledTimes(1)
      expect(storeState.renderStatus).toBe(mocks.RenderStatus.None)
      expect(mocks.toast.success).not.toHaveBeenCalled()
      expect(mocks.toast.info).not.toHaveBeenCalledWith('features.render.info.batchNext')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('marks a zero-exit FFmpeg render as completed', async () => {
    const storeState = reactive({
      renderConfig: {
        bgmPath: '',
        outputSize: { width: 720, height: 1280 },
        outputPath: 'C:/video output',
        outputFileName: 'success',
        outputFileExt: '.mp4',
      },
      autoBatch: false,
      renderStatus: mocks.RenderStatus.None,
      updateRenderStatus(status: number) {
        this.renderStatus = status
      },
    })
    const renderDeferred = createDeferred<{ stdout: string; stderr: string; code: number }>()
    const renderVideo = vi.fn(() => renderDeferred.promise)
    mocks.store = storeState
    mocks.getTextForSynthesis.mockResolvedValue('A generated script')
    mocks.synthesizeSpeech.mockResolvedValue({ duration: 8, srtText: 'subtitle text' })
    mocks.getVideoSegments.mockResolvedValue({
      videoFiles: ['C:/video assets/scene 1.mp4'],
      timeRanges: [['1.000', '9.000']],
    })
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        platform: 'win32',
        renderVideo,
        statTrack: vi.fn(() => Promise.resolve()),
      },
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { send: vi.fn() },
    })
    const wrapper = mount(Home, {
      attachTo: document.body,
      global: {
        stubs: {
          TextGenerate: TextGenerateStub,
          VideoManage: VideoManageStub,
          TtsControl: TtsControlStub,
          VideoRender: VideoRenderStub,
          TopBar: true,
        },
      },
    })

    try {
      await wrapper.find('#render-trigger').trigger('click')
      await vi.waitFor(() => expect(renderVideo).toHaveBeenCalledTimes(1))
      renderDeferred.resolve({ stdout: '', stderr: '', code: 0 })

      await vi.waitFor(() => expect(storeState.renderStatus).toBe(mocks.RenderStatus.Completed))
      expect(mocks.toast.success).toHaveBeenCalledWith('features.render.success.succeeded')
      expect(mocks.getTextForSynthesis).toHaveBeenCalledTimes(1)
      expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'A generated script', withCaption: true }),
      )
      expect(mocks.getVideoSegments).toHaveBeenCalledWith({ duration: 8 })
      expect(mocks.getTextForSynthesis.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.synthesizeSpeech.mock.invocationCallOrder[0],
      )
      expect(mocks.synthesizeSpeech.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.getVideoSegments.mock.invocationCallOrder[0],
      )
      expect(mocks.getVideoSegments.mock.invocationCallOrder[0]).toBeLessThan(
        renderVideo.mock.invocationCallOrder[0],
      )
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('marks a non-zero FFmpeg exit as failed and stops auto-batch', async () => {
    const storeState = reactive({
      renderConfig: {
        bgmPath: '',
        outputSize: { width: 720, height: 1280 },
        outputPath: 'C:/video output',
        outputFileName: 'failed',
        outputFileExt: '.mp4',
      },
      autoBatch: true,
      renderStatus: mocks.RenderStatus.None,
      updateRenderStatus(status: number) {
        this.renderStatus = status
      },
    })
    const renderDeferred = createDeferred<{ stdout: string; stderr: string; code: number }>()
    const renderVideo = vi.fn(() => renderDeferred.promise)
    mocks.store = storeState
    mocks.getTextForSynthesis.mockResolvedValue('A generated script')
    mocks.synthesizeSpeech.mockResolvedValue({ duration: 8, srtText: 'subtitle text' })
    mocks.getVideoSegments.mockResolvedValue({
      videoFiles: ['C:/video assets/scene 1.mp4'],
      timeRanges: [['1.000', '9.000']],
    })
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        platform: 'win32',
        renderVideo,
        statTrack: vi.fn(() => Promise.resolve()),
      },
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { send: vi.fn() },
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = mount(Home, {
      attachTo: document.body,
      global: {
        stubs: {
          TextGenerate: TextGenerateStub,
          VideoManage: VideoManageStub,
          TtsControl: TtsControlStub,
          VideoRender: VideoRenderStub,
          TopBar: true,
        },
      },
    })

    try {
      await wrapper.find('#render-trigger').trigger('click')
      await vi.waitFor(() => expect(renderVideo).toHaveBeenCalledTimes(1))
      renderDeferred.resolve({ stdout: '', stderr: 'encoder failed', code: 1 })

      await vi.waitFor(() => expect(storeState.renderStatus).toBe(mocks.RenderStatus.Failed))
      expect(renderVideo).toHaveBeenCalledTimes(1)
      expect(mocks.getTextForSynthesis).toHaveBeenCalledTimes(1)
      expect(mocks.toast.success).not.toHaveBeenCalled()
      expect(mocks.toast.error).toHaveBeenCalledTimes(1)
      expect(consoleError).toHaveBeenCalledTimes(1)
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('aborts in-flight TTS and does not begin rendering after cancellation', async () => {
    const storeState = reactive({
      renderConfig: {
        bgmPath: '',
        outputSize: { width: 720, height: 1280 },
        outputPath: 'C:/video output',
        outputFileName: 'cancelled',
        outputFileExt: '.mp4',
      },
      autoBatch: false,
      renderStatus: mocks.RenderStatus.None,
      updateRenderStatus(status: number) {
        this.renderStatus = status
      },
    })
    const ttsDeferred = createDeferred<{ duration: number; srtText: string }>()
    const renderVideo = vi.fn(() => Promise.resolve({ stdout: '', stderr: '', code: 0 }))
    const statTrack = vi.fn((_payload: { title: string }) => Promise.resolve())
    mocks.store = storeState
    mocks.getTextForSynthesis.mockResolvedValue('A generated script')
    mocks.synthesizeSpeech.mockImplementation((options: { abortSignal: AbortSignal }) => {
      options.abortSignal.addEventListener(
        'abort',
        () => {
          const error = new Error('cancelled')
          error.name = 'AbortError'
          ttsDeferred.reject(error)
        },
        { once: true },
      )
      return ttsDeferred.promise
    })
    mocks.getVideoSegments.mockResolvedValue({
      videoFiles: ['C:/video assets/scene 1.mp4'],
      timeRanges: [['1.000', '9.000']],
    })
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        platform: 'win32',
        renderVideo,
        statTrack,
      },
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { send: vi.fn() },
    })
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const wrapper = mount(Home, {
      attachTo: document.body,
      global: {
        stubs: {
          TextGenerate: TextGenerateStub,
          VideoManage: VideoManageStub,
          TtsControl: TtsControlStub,
          VideoRender: VideoRenderStub,
          TopBar: true,
        },
      },
    })

    try {
      await wrapper.find('#render-trigger').trigger('click')
      await vi.waitFor(() => expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(1))
      const request = mocks.synthesizeSpeech.mock.calls[0][0] as {
        abortSignal: AbortSignal
      }
      expect(request.abortSignal.aborted).toBe(false)

      await wrapper.find('#cancel-trigger').trigger('click')
      expect(request.abortSignal.aborted).toBe(true)
      await flushPromises()

      expect(renderVideo).not.toHaveBeenCalled()
      expect(storeState.renderStatus).toBe(mocks.RenderStatus.None)
      expect(consoleError).not.toHaveBeenCalled()
      expect(statTrack.mock.calls.map(([payload]) => payload.title)).not.toContain('视频渲染失败')
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it('stops before rendering when TTS synthesis fails', async () => {
    const storeState = reactive({
      renderConfig: {
        bgmPath: '',
        outputSize: { width: 720, height: 1280 },
        outputPath: 'C:/video output',
        outputFileName: 'tts-failed',
        outputFileExt: '.mp4',
      },
      autoBatch: true,
      renderStatus: mocks.RenderStatus.None,
      updateRenderStatus(status: number) {
        this.renderStatus = status
      },
    })
    const renderVideo = vi.fn(() => Promise.resolve({ stdout: '', stderr: '', code: 0 }))
    mocks.store = storeState
    mocks.getTextForSynthesis.mockResolvedValue('A generated script')
    mocks.synthesizeSpeech.mockRejectedValue(new Error('TTS service failed'))
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        platform: 'win32',
        renderVideo,
        statTrack: vi.fn(() => Promise.resolve()),
      },
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { send: vi.fn() },
    })
    const wrapper = mount(Home, {
      attachTo: document.body,
      global: {
        stubs: {
          TextGenerate: TextGenerateStub,
          VideoManage: VideoManageStub,
          TtsControl: TtsControlStub,
          VideoRender: VideoRenderStub,
          TopBar: true,
        },
      },
    })

    try {
      await wrapper.find('#render-trigger').trigger('click')
      await vi.waitFor(() => expect(storeState.renderStatus).toBe(mocks.RenderStatus.Failed))

      expect(renderVideo).not.toHaveBeenCalled()
      expect(mocks.getTextForSynthesis).toHaveBeenCalledTimes(1)
      expect(mocks.toast.error).toHaveBeenCalledTimes(1)
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })

  it.each([
    ['missing', { srtText: 'caption' }],
    ['zero', { duration: 0, srtText: 'caption' }],
  ])('rejects %s TTS duration before starting rendering', async (_label, ttsResult) => {
    const storeState = reactive({
      renderConfig: {
        bgmPath: '',
        outputSize: { width: 720, height: 1280 },
        outputPath: 'C:/video output',
        outputFileName: 'invalid-duration',
        outputFileExt: '.mp4',
      },
      autoBatch: true,
      renderStatus: mocks.RenderStatus.None,
      updateRenderStatus(status: number) {
        this.renderStatus = status
      },
    })
    const renderVideo = vi.fn(() => Promise.resolve({ stdout: '', stderr: '', code: 0 }))
    mocks.store = storeState
    mocks.getTextForSynthesis.mockResolvedValue('A generated script')
    mocks.synthesizeSpeech.mockResolvedValue(ttsResult)
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: {
        platform: 'win32',
        renderVideo,
        statTrack: vi.fn(() => Promise.resolve()),
      },
    })
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { send: vi.fn() },
    })
    const wrapper = mount(Home, {
      attachTo: document.body,
      global: {
        stubs: {
          TextGenerate: TextGenerateStub,
          VideoManage: VideoManageStub,
          TtsControl: TtsControlStub,
          VideoRender: VideoRenderStub,
          TopBar: true,
        },
      },
    })

    try {
      await wrapper.find('#render-trigger').trigger('click')
      await vi.waitFor(() => expect(storeState.renderStatus).toBe(mocks.RenderStatus.Failed))

      expect(mocks.synthesizeSpeech).toHaveBeenCalledTimes(1)
      expect(renderVideo).not.toHaveBeenCalled()
      expect(mocks.toast.error).toHaveBeenCalledTimes(1)
    } finally {
      wrapper.unmount()
      document.body.innerHTML = ''
    }
  })
})
