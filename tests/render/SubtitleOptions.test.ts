// @vitest-environment jsdom
import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { RenderStatus, useAppStore } from '../../src/store/app'
import SubtitleOptions from '../../src/views/Home/components/SubtitleOptions.vue'

vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const setup = () => {
  const pinia = createPinia()
  const store = useAppStore(pinia)
  const wrapper = shallowMount(SubtitleOptions, {
    global: {
      plugins: [pinia],
      stubs: { VSheet: true, VChip: true, VIcon: true },
      renderStubDefaultSlot: true,
    },
  })
  return { store, wrapper, chips: wrapper.findAllComponents({ name: 'VChip' }) }
}

describe('subtitle option chips', () => {
  it('toggles both options independently with visible and accessible state', async () => {
    const { store, wrapper, chips } = setup()
    try {
      expect(chips).toHaveLength(2)
      expect(chips[0].attributes('color')).toBe('primary')
      expect(chips[0].attributes('aria-pressed')).toBe('true')
      expect(chips[1].attributes('color')).toBe('grey')
      await chips[0].trigger('click')
      expect(store.renderConfig.subtitlesEnabled).toBe(false)
      expect(store.renderConfig.exportSubtitles).toBe(false)
      await chips[1].trigger('click')
      expect(store.renderConfig.exportSubtitles).toBe(true)
      expect(store.renderConfig.subtitlesEnabled).toBe(false)
      expect(chips[0].attributes('color')).toBe('grey')
      expect(chips[1].attributes('aria-pressed')).toBe('true')
    } finally {
      wrapper.unmount()
    }
  })

  it.each([
    RenderStatus.GenerateText,
    RenderStatus.SynthesizedSpeech,
    RenderStatus.SegmentVideo,
    RenderStatus.Rendering,
  ])('locks both chips throughout generation stage %s', async (status) => {
    const { store, wrapper, chips } = setup()
    try {
      store.renderStatus = status
      await chips[0].trigger('click')
      await chips[1].trigger('click')
      expect(chips[0].attributes('disabled')).toBe('true')
      expect(chips[1].attributes('disabled')).toBe('true')
      expect(store.renderConfig.subtitlesEnabled).toBe(true)
      expect(store.renderConfig.exportSubtitles).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })
})
