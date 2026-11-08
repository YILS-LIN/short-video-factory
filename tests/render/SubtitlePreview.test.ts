// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import SubtitlePreview from '../../src/components/SubtitlePreview.vue'
import { defaultSubtitleStyle } from '../../src/effect-engine/default-style'

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  layout: vi.fn(() => []),
  frame: vi.fn(),
  render: vi.fn(),
  destroy: vi.fn(),
}))
vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('../../src/effect-engine/renderer/pixi-stage-factory', () => ({
  createPixiApp: mocks.create,
}))
vi.mock('../../src/effect-engine/renderer/subtitle-render-runtime', () => ({
  buildSubtitleLayout: mocks.layout,
  renderSubtitleFrame: mocks.frame,
}))

describe('engine single-frame preview', () => {
  afterEach(() => {
    vi.useRealTimers()
  })
  it('debounces edits, renders one engine frame at output resolution and releases resources', async () => {
    vi.useFakeTimers()
    const context = {
      measureText: () => ({ width: 100 }),
      fillRect: vi.fn(),
      drawImage: vi.fn(),
      fillStyle: '',
      font: '',
    }
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
      context as unknown as ReturnType<HTMLCanvasElement['getContext']>,
    )
    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue(
      'data:image/png;base64,preview',
    )
    Object.defineProperty(document, 'fonts', {
      configurable: true,
      value: { load: vi.fn().mockResolvedValue([]) },
    })
    mocks.create.mockResolvedValue({
      root: {},
      app: {
        render: mocks.render,
        destroy: mocks.destroy,
        canvas: document.createElement('canvas'),
      },
    })
    const wrapper = mount(SubtitlePreview, {
      props: {
        size: { width: 1080, height: 1920 },
        styleConfig: { ...defaultSubtitleStyle },
        enabled: true,
      },
      global: { stubs: { VTextarea: true, VProgressCircular: true, VAlert: true, VBtn: true } },
    })
    try {
      expect(wrapper.find('[role="status"]').text()).toContain('renderSettings.loading')
      expect(wrapper.findComponent({ name: 'VTextarea' }).attributes('no-resize')).toBe('')
      await wrapper.setProps({ size: { width: 720, height: 1280 } })
      await wrapper.setProps({ styleConfig: { ...defaultSubtitleStyle, fontSize: 72 } })
      await vi.advanceTimersByTimeAsync(250)
      await flushPromises()
      expect(mocks.create).toHaveBeenCalledExactlyOnceWith({ width: 720, height: 1280 })
      expect(mocks.layout).toHaveBeenCalledWith(
        expect.objectContaining({
          videoWidth: 720,
          style: expect.objectContaining({ fontSize: 48 }),
        }),
      )
      expect(mocks.frame).toHaveBeenCalledWith(
        expect.objectContaining({ width: 720, height: 1280, timeMs: 0 }),
      )
      expect(mocks.render).toHaveBeenCalledOnce()
      expect(mocks.destroy).toHaveBeenCalledOnce()
      expect(wrapper.find('img').attributes('src')).toBe('data:image/png;base64,preview')
      await vi.advanceTimersByTimeAsync(1)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
      await wrapper.setProps({ enabled: false })
      expect(wrapper.find('img').exists()).toBe(true)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
      await vi.advanceTimersByTimeAsync(250)
      expect(mocks.render).toHaveBeenCalledTimes(2)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
      const stage = await mocks.create.mock.results[0].value
      let finish!: (value: unknown) => void
      mocks.create.mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finish = resolve
          }),
      )
      await wrapper.setProps({ enabled: true })
      await vi.advanceTimersByTimeAsync(400)
      expect(wrapper.find('[role="status"]').exists()).toBe(true)
      expect(wrapper.find('img').attributes('src')).toBe('data:image/png;base64,preview')
      finish(stage)
      await flushPromises()
      // A visible mask stays briefly rather than flashing off with a fast frame.
      expect(wrapper.find('[role="status"]').exists()).toBe(true)
      await vi.advanceTimersByTimeAsync(240)
      expect(wrapper.find('[role="status"]').exists()).toBe(false)
      await wrapper.setProps({ enabled: false })
      wrapper.unmount()
      await vi.advanceTimersByTimeAsync(500)
      expect(mocks.render).toHaveBeenCalledTimes(3)
    } finally {
      if (wrapper.exists()) wrapper.unmount()
    }
  })
})
