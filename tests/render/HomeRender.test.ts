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
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it.each([
    [true, false],
    [false, false],
    [true, true],
    [false, true],
  ])(
    'preserves inputs and cancellation with overlay=%s and export=%s',
    async (subtitlesEnabled, exportSubtitles) => {
      const storeState = reactive({
        renderConfig: {
          subtitlesEnabled,
          exportSubtitles,
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
            GenerationOptions: true,
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
            subtitlesEnabled,
            exportSubtitles,
            outputSize: { width: 720, height: 1280 },
            outputDuration: '8',
            outputPath: 'C:/video output/my video.mp4',
          }),
        )
        expect(mocks.synthesizeSpeech).toHaveBeenCalledWith(
          expect.objectContaining({ withCaption: true }),
        )

        await wrapper.find('#cancel-trigger').trigger('click')
        renderDeferred.resolve({ stdout: '', stderr: 'cancelled', code: 255 })
        await flushPromises()

        expect(renderVideo).toHaveBeenCalledTimes(1)
        expect(mocks.getTextForSynthesis).toHaveBeenCalledTimes(1)
        expect(storeState.renderStatus).toBe(mocks.RenderStatus.None)
        expect(mocks.toast.success).not.toHaveBeenCalled()
        expect(mocks.toast.info).not.toHaveBeenCalledWith('features.render.info.batchNext')
        expect(console.info).toHaveBeenCalledWith(
          '[Generation]',
          expect.objectContaining({
            event: 'task_finished',
            outcome: 'cancelled',
            stage: 'export',
            item: 1,
          }),
        )
      } finally {
        wrapper.unmount()
        document.body.innerHTML = ''
      }
    },
  )

  it.each([1, 3])('completes exactly %s successful renders', async (count) => {
    const storeState = reactive({
      renderConfig: {
        bgmPath: '',
        outputSize: { width: 720, height: 1280 },
        outputPath: 'C:/video output',
        outputFileName: 'success',
        outputFileExt: '.mp4',
      },
      autoBatch: count > 1,
      batchConfig: { count, onError: 'stop' },
      batchProgress: null as { running: boolean; completedCount: number } | null,
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
          GenerationOptions: true,
          TopBar: true,
        },
      },
    })

    try {
      await wrapper.find('#render-trigger').trigger('click')
      await vi.waitFor(() => expect(renderVideo).toHaveBeenCalledTimes(1))
      await wrapper.find('#render-trigger').trigger('click')
      expect(mocks.getTextForSynthesis).toHaveBeenCalledTimes(1)
      renderDeferred.resolve({ stdout: '', stderr: '', code: 0 })
      await vi.waitFor(() => expect(renderVideo).toHaveBeenCalledTimes(count))
      await vi.waitFor(() => expect(storeState.batchProgress?.running ?? false).toBe(false))

      await vi.waitFor(() => expect(storeState.renderStatus).toBe(mocks.RenderStatus.Completed))
      expect(mocks.toast.success).toHaveBeenCalledWith('features.render.success.succeeded')
      expect(mocks.getTextForSynthesis).toHaveBeenCalledTimes(count)
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
      const [params] = renderVideo.mock.calls[0] as unknown as [
        {
          diagnosticContext: { operationId: string; batchId?: string }
        },
      ]
      const context = params.diagnosticContext
      expect(console.info).toHaveBeenCalledWith(
        '[Generation]',
        expect.objectContaining({
          event: 'task_finished',
          operationId: context.operationId,
          outcome: 'succeeded',
        }),
      )
      if (count > 1) {
        expect(console.info).toHaveBeenCalledWith(
          '[Generation]',
          expect.objectContaining({
            event: 'batch_finished',
            batchId: context.batchId,
            completed: count,
            stopReason: 'completed',
          }),
        )
      }
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
          GenerationOptions: true,
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
      expect(consoleError).toHaveBeenCalledWith(
        '[Generation]',
        expect.objectContaining({
          event: 'task_finished',
          stage: 'export',
          outcome: 'failed',
          item: 1,
          error: expect.objectContaining({ message: 'encoder failed' }),
        }),
      )
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
          GenerationOptions: true,
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
          GenerationOptions: true,
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

  it.each(['subtitle_warning', 'continue_after_failure', 'consecutive_failures'] as const)(
    'logs batch outcome for %s',
    async (scenario) => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      const storeState = reactive({
        renderConfig: {
          bgmPath: '',
          outputSize: { width: 720, height: 1280 },
          outputPath: '/output',
          outputFileName: 'video',
          outputFileExt: '.mp4',
        },
        autoBatch: true,
        batchConfig: { count: 5, onError: scenario === 'subtitle_warning' ? 'stop' : 'continue' },
        batchProgress: null as { running: boolean } | null,
        renderStatus: mocks.RenderStatus.None,
        updateRenderStatus(status: number) {
          this.renderStatus = status
        },
      })
      mocks.store = storeState
      mocks.getTextForSynthesis.mockResolvedValue('private script')
      mocks.synthesizeSpeech.mockResolvedValue({ duration: 8, srtText: 'private caption' })
      if (scenario === 'consecutive_failures')
        mocks.synthesizeSpeech.mockRejectedValue(new Error('TTS timeout'))
      if (scenario === 'continue_after_failure')
        mocks.synthesizeSpeech.mockRejectedValueOnce(new Error('TTS timeout'))
      mocks.getVideoSegments.mockResolvedValue({ videoFiles: [], timeRanges: [] })
      const renderVideo = vi.fn().mockResolvedValue({ code: 0 })
      if (scenario === 'subtitle_warning')
        renderVideo.mockResolvedValueOnce({ code: 0, subtitleExportError: 'EACCES subtitle' })
      Object.defineProperty(window, 'electron', {
        configurable: true,
        value: { platform: 'win32', renderVideo },
      })
      const wrapper = mount(Home, {
        global: {
          stubs: {
            TextGenerate: TextGenerateStub,
            VideoManage: VideoManageStub,
            TtsControl: TtsControlStub,
            VideoRender: VideoRenderStub,
            GenerationOptions: true,
            TopBar: true,
          },
        },
      })
      try {
        await wrapper.find('#render-trigger').trigger('click')
        await vi.waitFor(() => expect(storeState.batchProgress?.running).toBe(false))
        const summary =
          scenario === 'subtitle_warning'
            ? { completed: 1, failed: 0, warnings: 1, stopReason: 'generation_failed' }
            : scenario === 'consecutive_failures'
              ? { completed: 0, failed: 3, stopReason: 'consecutive_failures' }
              : { completed: 4, failed: 1, stopReason: 'completed' }
        expect(console.info).toHaveBeenCalledWith(
          '[Generation]',
          expect.objectContaining({
            event: 'batch_finished',
            batchId: expect.any(String),
            ...summary,
          }),
        )
        if (scenario === 'subtitle_warning') {
          expect(console.warn).toHaveBeenCalledWith(
            '[Generation]',
            expect.objectContaining({
              event: 'subtitle_export_warning',
              item: 1,
              stage: 'export',
              videoSucceeded: true,
              error: { message: 'EACCES subtitle' },
            }),
          )
        } else {
          expect(console.error).toHaveBeenCalledWith(
            '[Generation]',
            expect.objectContaining({
              event: 'task_finished',
              item: 1,
              stage: 'tts',
              outcome: 'failed',
              errorCode: 'network_timeout',
            }),
          )
        }
        expect(JSON.stringify(vi.mocked(console.info).mock.calls)).not.toContain('private script')
      } finally {
        wrapper.unmount()
      }
    },
  )

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
          GenerationOptions: true,
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
