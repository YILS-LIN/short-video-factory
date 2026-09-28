// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { reactive } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VideoManage from '../../src/views/Home/components/VideoManage.vue'

const mocks = vi.hoisted(() => ({
  appStore: {} as Record<string, unknown>,
  random: {
    float: vi.fn((min: number) => min),
    int: vi.fn(() => 0),
  },
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
vi.mock('random', () => ({ default: mocks.random }))

type MockVideo = HTMLVideoElement & {
  emit: (event: string) => void
  pause: ReturnType<typeof vi.fn>
  load: ReturnType<typeof vi.fn>
  removeAttribute: ReturnType<typeof vi.fn>
}

const installVideoMetadata = (durationBySrc: Record<string, number | Error | null>) => {
  const videos: MockVideo[] = []
  const originalCreateElement = document.createElement.bind(document)
  const createElement = vi.spyOn(document, 'createElement') as unknown as {
    mockImplementation: (
      implementation: (tagName: string, options?: ElementCreationOptions) => HTMLElement,
    ) => unknown
    mockRestore: () => void
  }
  createElement.mockImplementation((tagName, options) => {
    if (tagName.toLowerCase() !== 'video') return originalCreateElement(tagName, options)

    const listeners = new Map<string, Set<EventListenerOrEventListenerObject>>()
    let source = ''
    let duration = Number.NaN
    const video = {
      get duration() {
        return duration
      },
      preload: '',
      play: vi.fn(() => Promise.resolve()),
      pause: vi.fn(),
      load: vi.fn(),
      removeAttribute: vi.fn((attribute: string) => {
        if (attribute === 'src') source = ''
      }),
      addEventListener: vi.fn((event: string, listener: EventListenerOrEventListenerObject) => {
        const eventListeners = listeners.get(event) ?? new Set()
        eventListeners.add(listener)
        listeners.set(event, eventListeners)
      }),
      removeEventListener: vi.fn((event: string, listener: EventListenerOrEventListenerObject) => {
        listeners.get(event)?.delete(listener)
      }),
      emit(event: string) {
        for (const listener of listeners.get(event) ?? []) {
          if (typeof listener === 'function') listener(new Event(event))
          else listener.handleEvent(new Event(event))
        }
      },
      get src() {
        return source
      },
      set src(value: string) {
        source = value
        queueMicrotask(() => {
          const metadata = durationBySrc[value]
          if (metadata === null) return
          if (metadata instanceof Error) video.emit('error')
          else {
            duration = metadata ?? Number.NaN
            video.emit('loadedmetadata')
          }
        })
      },
    } as unknown as MockVideo
    videos.push(video)
    return video
  })

  return { createElement, videos }
}

const createHost = (
  assets: Array<{ name: string; path: string }>,
  listFilesFromFolder = vi.fn(() => Promise.resolve(assets)),
) => {
  mocks.appStore = reactive({ videoAssetsFolder: 'C:/video assets' })
  Object.defineProperty(window, 'electron', {
    configurable: true,
    value: { listFilesFromFolder },
  })
  const wrapper = mount(VideoManage, {
    global: {
      stubs: {
        VForm: true,
        VSheet: true,
        VTextField: true,
        VBtn: true,
        VIcon: true,
        VEmptyState: true,
        VideoAutoPreview: true,
      },
    },
  })

  return {
    wrapper,
    listFilesFromFolder,
    getVideoSegments: (
      wrapper.vm as unknown as {
        getVideoSegments: (options: {
          duration: number
        }) => Promise<{ videoFiles: string[]; timeRanges: [string, string][] }>
      }
    ).getVideoSegments,
  }
}

describe('VideoManage asset filtering and segment selection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.random.float.mockImplementation((min: number) => min)
    mocks.random.int.mockReturnValue(0)
  })

  it('filters case-insensitive MP4 files and creates duration-matched segments', async () => {
    const assets = [
      { name: 'scene one.MP4', path: 'C:/video assets/scene one.MP4' },
      { name: 'notes.txt', path: 'C:/video assets/notes.txt' },
      { name: 'scene two.mp4', path: 'C:/video assets/scene two.mp4' },
    ]
    const metadata = installVideoMetadata({
      'file:///C:/video%20assets/scene%20one.MP4': 12,
      'file:///C:/video%20assets/scene%20two.mp4': 20,
    })
    const consoleInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined)
    const consoleDebug = vi.spyOn(console, 'debug').mockImplementation(() => undefined)
    const { wrapper, listFilesFromFolder, getVideoSegments } = createHost(assets)

    try {
      await flushPromises()
      expect(listFilesFromFolder).toHaveBeenCalledWith({ folderPath: 'C:/video assets' })
      expect(consoleInfo).toHaveBeenCalledWith('素材库刷新完成', {
        assetCount: 3,
        mp4Count: 2,
      })
      expect(mocks.toast.success).toHaveBeenCalledWith('features.assets.success.loadSucceeded')

      const segments = await getVideoSegments({ duration: 2 })
      expect(segments).toEqual({
        videoFiles: ['C:/video assets/scene one.MP4'],
        timeRanges: [['0.000', '2.000']],
      })
      expect(metadata.videos).toHaveLength(1)
      expect(metadata.videos[0].pause).toHaveBeenCalled()
      expect(metadata.videos[0].removeEventListener).toHaveBeenCalledTimes(2)
      expect(consoleDebug).toHaveBeenCalledWith('随机素材片段生成完成', {
        segmentCount: 1,
        totalDurationSeconds: '2.000',
      })
    } finally {
      wrapper.unmount()
      metadata.createElement.mockRestore()
    }
  })

  it('reuses cached video metadata for subsequent segments', async () => {
    const asset = { name: 'scene.mp4', path: 'C:/video assets/scene.mp4' }
    const metadata = installVideoMetadata({ 'file:///C:/video%20assets/scene.mp4': 4 })
    const { wrapper, getVideoSegments } = createHost([asset])

    try {
      await flushPromises()
      await getVideoSegments({ duration: 1 })
      await getVideoSegments({ duration: 1 })
      expect(metadata.videos).toHaveLength(1)
    } finally {
      wrapper.unmount()
      metadata.createElement.mockRestore()
    }
  })

  it('warns and rejects when there are no MP4 assets or the folder is empty', async () => {
    const { wrapper, getVideoSegments } = createHost([
      { name: 'notes.txt', path: 'C:/video assets/notes.txt' },
    ])
    try {
      await flushPromises()
      expect(mocks.toast.warning).toHaveBeenCalledWith('features.assets.errors.noMp4InFolder')
      await expect(getVideoSegments({ duration: 2 })).rejects.toThrow(
        'features.assets.errors.noVideoAssets',
      )
    } finally {
      wrapper.unmount()
    }
  })

  it('reports an empty folder and surfaces filesystem listing errors', async () => {
    const empty = createHost([])
    try {
      await flushPromises()
      expect(mocks.toast.warning).toHaveBeenCalledWith('emptyStates.assetsFolderEmpty')
    } finally {
      empty.wrapper.unmount()
    }

    const failedListing = vi.fn(() => Promise.reject(new Error('Folder is unavailable')))
    const failed = createHost([], failedListing)
    const consoleDir = vi.spyOn(console, 'dir').mockImplementation(() => undefined)
    await flushPromises()
    expect(mocks.toast.error).toHaveBeenCalledTimes(1)
    expect(consoleDir).toHaveBeenCalledTimes(1)
    failed.wrapper.unmount()
  })

  it('skips unreadable and invalid-duration video files without looping forever', async () => {
    const assets = [
      { name: 'missing.mp4', path: 'C:/video assets/missing.mp4' },
      { name: 'invalid.mp4', path: 'C:/video assets/invalid.mp4' },
    ]
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const metadata = installVideoMetadata({
      'file:///C:/video%20assets/missing.mp4': new Error('metadata unavailable'),
      'file:///C:/video%20assets/invalid.mp4': 0,
    })
    const { wrapper, getVideoSegments } = createHost(assets)

    try {
      await flushPromises()
      await expect(getVideoSegments({ duration: 2 })).rejects.toThrow(
        'features.assets.errors.noUsableVideoAssets',
      )
      expect(metadata.videos).toHaveLength(2)
      expect(consoleWarn).toHaveBeenCalledTimes(1)
      expect(consoleWarn).toHaveBeenCalledWith('部分视频素材不可用，已跳过', {
        count: 2,
        samples: ['missing.mp4: 视频元数据读取失败', 'invalid.mp4: 视频时长无效'],
      })
    } finally {
      wrapper.unmount()
      metadata.createElement.mockRestore()
    }
  })

  it('times out stalled metadata reads and clears their timer and media listeners', async () => {
    const asset = { name: 'stalled.mp4', path: 'C:/video assets/stalled.mp4' }
    const metadata = installVideoMetadata({ 'file:///C:/video%20assets/stalled.mp4': null })
    const consoleWarn = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    const { wrapper, getVideoSegments } = createHost([asset])
    try {
      await flushPromises()
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const segments = getVideoSegments({ duration: 2 })
      const assertion = expect(segments).rejects.toThrow(
        'features.assets.errors.noUsableVideoAssets',
      )
      await vi.advanceTimersByTimeAsync(8000)
      await assertion

      expect(metadata.videos).toHaveLength(1)
      expect(metadata.videos[0].pause).toHaveBeenCalled()
      expect(metadata.videos[0].removeEventListener).toHaveBeenCalledTimes(2)
      expect(consoleWarn).toHaveBeenCalledTimes(1)
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      vi.useRealTimers()
      wrapper.unmount()
      metadata.createElement.mockRestore()
    }
  })
})
