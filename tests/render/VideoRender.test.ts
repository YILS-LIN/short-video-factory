// @vitest-environment jsdom
import { flushPromises, shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { isProxy, reactive, toRaw } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VideoRender from '../../src/views/Home/components/VideoRender.vue'
import { RenderStatus, useAppStore } from '../../src/store/app'

const mocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))
vi.mock('vue-toastification', () => ({ useToast: () => mocks }))

vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const stubs = Object.fromEntries(
  [
    'VSheet',
    'VDivider',
    'VProgressCircular',
    'VBtn',
    'VIcon',
    'VChip',
    'VDialog',
    'VCard',
    'VCardText',
    'VTextField',
    'VCardActions',
    'VSpacer',
  ].map((name) => [name, true]),
)

describe('VideoRender configuration drafts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { on: vi.fn(), off: vi.fn() },
    })
  })

  it('disables opening an unconfigured folder and opens the configured path during rendering', async () => {
    const pinia = createPinia()
    const store = useAppStore(pinia)
    const openDirectory = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(window, 'electron', { configurable: true, value: { openDirectory } })
    const wrapper = shallowMount(VideoRender, {
      global: { plugins: [pinia], stubs, renderStubDefaultSlot: true },
    })
    try {
      const button = wrapper
        .findAllComponents({ name: 'VBtn' })
        .find((btn) => btn.text().includes('features.render.config.openOutputDirectory'))!
      expect(button.attributes('disabled')).toBe('true')
      expect(button.attributes('variant')).toBe('text')
      expect(button.element.nextElementSibling?.textContent).toContain('common.buttons.config')
      store.renderConfig.outputPath = 'C:/video output'
      store.renderStatus = RenderStatus.Rendering
      await button.trigger('click')
      await flushPromises()
      expect(button.attributes('title')).toBe('C:/video output')
      expect(openDirectory).toHaveBeenCalledWith('C:/video output')
      openDirectory.mockRejectedValue(new Error('Access denied'))
      await button.trigger('click')
      await flushPromises()
      const vnode = mocks.error.mock.calls[0][0].component.render()
      expect(vnode.props.message).toBe('features.render.errors.openOutputDirectoryFailed')
      expect(vnode.props.detail).toContain('Access denied')
      expect(vnode.props.detail).toContain('C:/video output')
      expect(vnode.props.actionText).toBe('common.buttons.copyErrorDetail')
    } finally {
      wrapper.unmount()
    }
  })

  it('mounts with nested reactive configuration and keeps draft edits isolated', async () => {
    const pinia = createPinia()
    const store = useAppStore(pinia)
    store.renderConfig = {
      ...store.renderConfig,
      outputSize: reactive({ width: 720, height: 1280 }),
    }
    expect(isProxy(toRaw(store.renderConfig).outputSize)).toBe(true)
    const wrapper = shallowMount(VideoRender, {
      global: { plugins: [pinia], stubs, renderStubDefaultSlot: true },
    })
    try {
      const fields = wrapper.findAllComponents({ name: 'VTextField' })
      expect(fields[0].attributes('modelvalue')).toBe('720')
      fields[0].vm.$emit('update:modelValue', 1080)
      expect(store.renderConfig.outputSize.width).toBe(720)

      // Subtitle settings now live in their own panel. Opening the config
      // dialog must pick up changes made there instead of restoring stale values.
      store.renderConfig.subtitlesEnabled = false
      store.renderConfig.exportSubtitles = true
      expect(store.renderConfig.subtitlesEnabled).toBe(false)
      expect(store.renderConfig.exportSubtitles).toBe(true)

      const buttons = wrapper.findAllComponents({ name: 'VBtn' })
      const configButton = buttons.find((button) =>
        button.text().includes('common.buttons.config'),
      )!
      await configButton.trigger('click')
      const saveButton = buttons.find(
        (button) => button.attributes('text') === 'common.buttons.save',
      )!
      await saveButton.trigger('click')
      expect(store.renderConfig.subtitlesEnabled).toBe(false)
      expect(store.renderConfig.exportSubtitles).toBe(true)
      expect(store.renderConfig.outputSize.width).toBe(720)
    } finally {
      wrapper.unmount()
    }
  })

  it('copies nested size values when saving reactive configuration', () => {
    const store = useAppStore(createPinia())
    const draft = reactive({ ...store.renderConfig, outputSize: { width: 720, height: 1280 } })
    store.updateRenderConfig(draft)
    expect(isProxy(toRaw(store.renderConfig).outputSize)).toBe(false)
    draft.outputSize.width = 1920
    expect(store.renderConfig.outputSize.width).toBe(720)
  })
})
