// @vitest-environment jsdom
import { shallowMount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { describe, expect, it, vi } from 'vitest'
import { RenderStatus, useAppStore } from '../../src/store/app'
import GenerationOptions from '../../src/views/Home/components/GenerationOptions.vue'

vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))

const setup = () => {
  const pinia = createPinia()
  const store = useAppStore(pinia)
  const wrapper = shallowMount(GenerationOptions, {
    global: {
      plugins: [pinia],
      stubs: {
        VSheet: true,
        VChip: true,
        VIcon: true,
        VMenu: true,
        VBtn: true,
        VCard: true,
        VTextField: true,
        VSelect: true,
        VProgressLinear: true,
      },
      renderStubDefaultSlot: true,
    },
  })
  return { store, wrapper, chips: wrapper.findAllComponents({ name: 'VChip' }) }
}

describe('subtitle option chips', () => {
  it('locks options between tasks while showing batch progress', async () => {
    const { store, wrapper, chips } = setup()
    try {
      store.renderStatus = RenderStatus.Completed
      store.batchProgress = {
        id: 'batch',
        startedAt: 0,
        total: 10,
        current: 3,
        completedCount: 2,
        failedCount: 0,
        cancelledCount: 0,
        warningCount: 0,
        consecutiveFailures: 0,
        onError: 'stop',
        running: true,
        stopRequested: false,
        stopReason: '',
        finished: false,
      }
      await chips[2].trigger('click')
      expect(store.autoBatch).toBe(false)
      expect(chips[2].attributes('disabled')).toBe('true')
      const progress = wrapper.findComponent({ name: 'VProgressLinear' })
      expect(progress.attributes('model-value')).toBe('20')
      expect(wrapper.text()).toContain('features.render.batch.progress')
      store.batchProgress.running = false
      store.batchProgress.stopReason = 'completed'
      await chips[2].trigger('click')
      expect(wrapper.findComponent({ name: 'VProgressLinear' }).exists()).toBe(false)
      expect(wrapper.text()).toContain('features.render.batch.reasons.completed')
    } finally {
      wrapper.unmount()
    }
  })
  it('toggles both options independently with visible and accessible state', async () => {
    const { store, wrapper, chips } = setup()
    try {
      expect(chips).toHaveLength(3)
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
      await chips[2].trigger('click')
      expect(store.autoBatch).toBe(true)
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
      await chips[2].trigger('click')
      expect(chips[0].attributes('disabled')).toBe('true')
      expect(chips[1].attributes('disabled')).toBe('true')
      expect(store.renderConfig.subtitlesEnabled).toBe(true)
      expect(store.renderConfig.exportSubtitles).toBe(false)
      expect(store.autoBatch).toBe(false)
    } finally {
      wrapper.unmount()
    }
  })
})
