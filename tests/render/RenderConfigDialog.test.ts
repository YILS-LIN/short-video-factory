// @vitest-environment jsdom
import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import RenderConfigDialog from '../../src/views/Home/components/RenderConfigDialog.vue'
import { useAppStore } from '../../src/store/app'

vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
vi.mock('vue-toastification', () => ({ useToast: () => ({ error: vi.fn() }) }))
vi.mock('../../src/components/SubtitlePreview.vue', () => ({ default: { template: '<div />' } }))
const stubs = Object.fromEntries(
  [
    'VDialog',
    'VCard',
    'VCardText',
    'VCardActions',
    'VSpacer',
    'VDivider',
    'VTabs',
    'VTab',
    'VSelect',
    'VTextField',
    'VBtn',
    'VSwitch',
    'VSlider',
  ].map((name) => [name, true]),
)
function setup() {
  const pinia = createPinia()
  const store = useAppStore(pinia)
  const wrapper = shallowMount(RenderConfigDialog, {
    props: { modelValue: true },
    global: { plugins: [pinia], stubs, renderStubDefaultSlot: true },
  })
  const save = () =>
    wrapper
      .findAllComponents({ name: 'VBtn' })
      .find((btn) => btn.text().includes('common.buttons.save'))!
  return { store, wrapper, save }
}
describe('unified render configuration', () => {
  it('updates preset dimensions in the draft and saves them together', async () => {
    const { wrapper, store, save } = setup()
    try {
      expect(
        wrapper
          .findAllComponents({ name: 'VBtn' })
          .some((btn) => btn.text() === 'common.buttons.selectFolder'),
      ).toBe(true)
      wrapper.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', '1920x1080')
      expect(store.renderConfig.outputSize).toEqual({ width: 1080, height: 1920 })
      await save().trigger('click')
      expect(store.renderConfig.outputSize).toEqual({ width: 1920, height: 1080 })
    } finally {
      wrapper.unmount()
    }
  })
  it('rejects odd custom sizes', async () => {
    const { wrapper, store, save } = setup()
    try {
      wrapper.findComponent({ name: 'VTextField' }).vm.$emit('update:modelValue', 721)
      await wrapper.vm.$nextTick()
      expect(save().attributes('disabled')).toBe('true')
      await save().trigger('click')
      expect(store.renderConfig.outputSize.width).toBe(1080)
    } finally {
      wrapper.unmount()
    }
  })
  it('isolates subtitle edits and discards them when reopened without saving', async () => {
    const { wrapper, store, save } = setup()
    try {
      wrapper.findComponent({ name: 'VTabs' }).vm.$emit('update:modelValue', 'subtitle')
      await wrapper.vm.$nextTick()
      expect(wrapper.findAll('.subtitle-section h3').map((heading) => heading.text())).toEqual([
        'renderSettings.sections.subtitle',
        'renderSettings.sections.typography',
        'renderSettings.sections.outline',
        'renderSettings.sections.layout',
      ])
      expect(
        wrapper
          .findAllComponents({ name: 'VSlider' })
          .every((slider) => slider.attributes('color') === 'primary'),
      ).toBe(true)
      const sections = wrapper.findAll('.subtitle-section')
      for (const section of sections.slice(1)) {
        const slider = section.findComponent({ name: 'VSlider' }).element
        for (const field of section.findAll('.color-field, v-select-stub')) {
          expect(
            slider.compareDocumentPosition(field.element) & Node.DOCUMENT_POSITION_FOLLOWING,
          ).toBeTruthy()
        }
      }
      wrapper.findComponent({ name: 'VSlider' }).vm.$emit('update:modelValue', 80)
      await wrapper.find('input[type="color"]').setValue('#ff0000')
      expect(store.renderConfig.subtitleStyle.fontSize).toBe(56)
      expect(store.renderConfig.subtitleStyle.color).toBe('#FFFFFF')
      await wrapper.setProps({ modelValue: false })
      expect(wrapper.findComponent({ name: 'VTabs' }).attributes('modelvalue')).toBe('video')
      await wrapper.setProps({ modelValue: true })
      expect(wrapper.findComponent({ name: 'VTabs' }).attributes('modelvalue')).toBe('video')
      wrapper.findComponent({ name: 'VTabs' }).vm.$emit('update:modelValue', 'subtitle')
      await wrapper.vm.$nextTick()
      expect(wrapper.findComponent({ name: 'VSlider' }).attributes('modelvalue')).toBe('56')
      wrapper.findComponent({ name: 'VSlider' }).vm.$emit('update:modelValue', 72)
      await save().trigger('click')
      expect(store.renderConfig.subtitleStyle.fontSize).toBe(72)
      expect(wrapper.findComponent({ name: 'VTabs' }).attributes('modelvalue')).toBe('video')
    } finally {
      wrapper.unmount()
    }
  })
  it('requires a file in fixed mode, then saves the selected audio file', async () => {
    const { wrapper, store, save } = setup()
    const selectAudioFile = vi.fn().mockResolvedValue('/music/test.wav')
    Object.defineProperty(window, 'electron', { configurable: true, value: { selectAudioFile } })
    try {
      wrapper.findComponent({ name: 'VTabs' }).vm.$emit('update:modelValue', 'audio')
      await wrapper.vm.$nextTick()
      wrapper.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'fixed')
      await wrapper.vm.$nextTick()
      expect(save().attributes('disabled')).toBe('true')
      await wrapper
        .findAllComponents({ name: 'VBtn' })
        .find((btn) => btn.text() === 'common.buttons.selectFile')!
        .trigger('click')
      expect(selectAudioFile).toHaveBeenCalledOnce()
      await save().trigger('click')
      expect(store.renderConfig.bgmMode).toBe('fixed')
      expect(store.renderConfig.bgmFile).toBe('/music/test.wav')
    } finally {
      wrapper.unmount()
    }
  })
  it('uses folder labels for random audio and resets the tab scroll container', async () => {
    const { wrapper } = setup()
    try {
      const videoFields = wrapper.find('.config-fields').element
      wrapper.findComponent({ name: 'VTabs' }).vm.$emit('update:modelValue', 'audio')
      await wrapper.vm.$nextTick()
      expect(wrapper.find('.config-fields').element).not.toBe(videoFields)
      wrapper.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'random')
      await wrapper.vm.$nextTick()
      const select = wrapper
        .findAllComponents({ name: 'VBtn' })
        .find((btn) => btn.text() === 'common.buttons.selectFolder')!
      expect(select.attributes('prepend-icon')).toBe('mdi-folder-open')
      wrapper.findComponent({ name: 'VSelect' }).vm.$emit('update:modelValue', 'fixed')
      await wrapper.vm.$nextTick()
      const file = wrapper
        .findAllComponents({ name: 'VBtn' })
        .find((btn) => btn.text() === 'common.buttons.selectFile')!
      expect(file.attributes('prepend-icon')).toBe('mdi-file-music-outline')
    } finally {
      wrapper.unmount()
    }
  })
})
