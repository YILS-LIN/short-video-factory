// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import DurationEstimate from '../../src/views/Home/components/DurationEstimate.vue'
import { useAppStore } from '../../src/store/app'

vi.mock('i18next-vue', () => ({
  useTranslation: () => ({
    t: (key: string, options?: Record<string, string>) =>
      options ? `${key}: ${options.duration}` : key,
  }),
}))

const script =
  '今天一起学习整理房间的小技巧。先从桌面开始，给常用物品找到固定的位置，每天只需要几分钟，就能让生活更加轻松。'
function setup() {
  vi.useFakeTimers()
  const pinia = createPinia()
  const store = useAppStore(pinia)
  const wrapper = mount(DurationEstimate, {
    attachTo: document.body,
    props: { text: script, generating: false },
    global: { plugins: [pinia] },
  })
  return { wrapper, store }
}
async function settle() {
  vi.advanceTimersByTime(200)
  await nextTick()
}

describe('DurationEstimate', () => {
  afterEach(() => {
    document.body.innerHTML = ''
    vi.useRealTimers()
  })

  it('estimates without a voice, and ignores voice, speech rate and prompt changes', async () => {
    const { wrapper, store } = setup()
    try {
      expect(wrapper.find('[data-testid="duration-estimate"]').exists()).toBe(true)
      expect(wrapper.isVisible()).toBe(false)
      await settle()
      const initial = wrapper.text()
      expect(initial).toContain('durationEstimate.label')
      expect(wrapper.attributes('title')).toContain('durationEstimate.hint')
      store.prompt = 'A different prompt'
      store.speed = -30
      store.voice = { ShortName: 'ja-JP-NanamiNeural', Locale: 'ja-JP' } as NonNullable<
        typeof store.voice
      >
      await nextTick()
      expect(wrapper.text()).toBe(initial)
      await settle()
      expect(wrapper.text()).toBe(initial)
      await wrapper.setProps({ text: script.repeat(3) })
      await settle()
      expect(wrapper.text()).not.toBe(initial)
    } finally {
      wrapper.unmount()
    }
  })

  it('preserves the same hidden placeholder during generation, unready, empty and non-spoken states', async () => {
    const { wrapper } = setup()
    try {
      await settle()
      const element = wrapper.element
      for (const props of [
        { generating: true, ready: true, text: script },
        { generating: false, ready: false, text: script },
        { generating: false, ready: true, text: '' },
        { generating: false, ready: true, text: '……🎉' },
      ]) {
        await wrapper.setProps(props)
        expect(wrapper.element).toBe(element)
        expect(wrapper.isVisible()).toBe(false)
        expect(wrapper.attributes('aria-hidden')).toBe('true')
        expect(wrapper.attributes('title')).toBeUndefined()
        await settle()
        expect(wrapper.find('[data-testid="duration-estimate"]').exists()).toBe(true)
        expect(wrapper.isVisible()).toBe(false)
      }
      await wrapper.setProps({ text: script })
      await settle()
      expect(wrapper.text()).toContain('durationEstimate.label')
      expect(wrapper.element).toBe(element)
      expect((wrapper.element as HTMLElement).style.visibility).toBe('visible')
      expect(wrapper.isVisible()).toBe(true)
      expect(wrapper.attributes('aria-hidden')).toBe('false')
    } finally {
      wrapper.unmount()
    }
  })

  it('debounces input, shows previously unsupported text and never synthesizes or exports', async () => {
    const { wrapper } = setup()
    const synthesize = vi.fn()
    const renderVideo = vi.fn()
    Object.defineProperty(window, 'electron', {
      configurable: true,
      value: { edgeTtsSynthesizeToFile: synthesize, renderVideo },
    })
    try {
      await settle()
      const previous = wrapper.text()
      await wrapper.setProps({ text: script.repeat(2) })
      expect(wrapper.text()).toBe(previous)
      expect(wrapper.isVisible()).toBe(true)
      vi.advanceTimersByTime(150)
      await wrapper.setProps({ text: 'こんにちは！ مرحبا بالعالم https://example.com' })
      await nextTick()
      expect(wrapper.text()).toBe(previous)
      expect(wrapper.isVisible()).toBe(true)
      await settle()
      expect(wrapper.text()).toContain('durationEstimate.label')
      expect(wrapper.text()).not.toMatch(/fallback|unavailable|selectVoice/)
      expect(synthesize).not.toHaveBeenCalled()
      expect(renderVideo).not.toHaveBeenCalled()
      await wrapper.setProps({ text: script })
      wrapper.unmount()
      expect(vi.getTimerCount()).toBe(0)
    } finally {
      if (wrapper.exists()) wrapper.unmount()
    }
  })
})
