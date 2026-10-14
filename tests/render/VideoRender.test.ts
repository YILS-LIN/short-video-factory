// @vitest-environment jsdom
import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { isProxy, reactive, toRaw } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import VideoRender from '../../src/views/Home/components/VideoRender.vue'
import { useAppStore } from '../../src/store/app'

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
    Object.defineProperty(window, 'ipcRenderer', {
      configurable: true,
      value: { on: vi.fn(), off: vi.fn() },
    })
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
