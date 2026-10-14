// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TopBar from '../../src/views/Home/components/TopBar.vue'

vi.mock('i18next-vue', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18next: { language: 'en' } }),
}))
vi.mock('vue-toastification', () => ({
  useToast: () => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }),
}))
vi.mock('@/store', () => ({
  useAppStore: () => ({ locale: 'en' }),
  useMetadataStore: () => ({ payload: null, getMatchedNotices: () => [], applyState: vi.fn() }),
}))
vi.mock('@/lib/analytics', () => ({ trackAnalytics: vi.fn() }))
vi.mock('@/components/UpdateDialog.vue', () => ({
  default: { name: 'UpdateDialog', props: ['modelValue', 'updateInfo'], template: '<div />' },
}))
vi.mock('@/components/AnnouncementDialog.vue', () => ({ default: { template: '<div />' } }))
vi.mock('@/components/ActionToastEmbed.vue', () => ({ default: { template: '<div />' } }))

let wrapper: VueWrapper
const handlers = new Map<string, (...args: unknown[]) => void>()
const check = vi.fn()
const info = { version: '9.0.0' }
beforeEach(() => {
  handlers.clear()
  check.mockReset()
  Object.assign(window, {
    ipcRenderer: {
      on: (event: string, handler: (...args: unknown[]) => void) => handlers.set(event, handler),
      off: vi.fn(),
    },
    electron: {
      checkForUpdates: check,
      onMetadataStateChanged: () => vi.fn(),
      getMetadataState: async () => ({}),
    },
  })
  wrapper = mount(TopBar, {
    global: {
      directives: { ripple: {} },
      stubs: {
        'v-sheet': { template: '<div><slot /></div>' },
        'v-icon': true,
        'v-dialog': true,
        'v-card': true,
        'v-progress-linear': true,
      },
    },
  })
})
afterEach(() => wrapper.unmount())
const button = () => wrapper.find('button.topbar-action')
const dot = () => wrapper.find('.topbar-update-dot').exists()
const dialog = () => wrapper.findComponent({ name: 'UpdateDialog' })

describe('update availability badge', () => {
  it('keeps automatic popup and retains the dot after closing the popup', async () => {
    expect(dot()).toBe(false)
    handlers.get('update-available')!(null, info)
    await flushPromises()
    expect(dot()).toBe(true)
    expect(dialog().props('modelValue')).toBe(true)
    expect(button().attributes('aria-label')).toBe('version.updateAvailable')
    dialog().vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(dialog().props('modelValue')).toBe(false)
    expect(dot()).toBe(true)
  })
  it.each(['up-to-date', 'no-release'])('clears availability after %s', async (status) => {
    handlers.get('update-available')!(null, info)
    check.mockResolvedValue({ status })
    await button().trigger('click')
    await flushPromises()
    expect(dot()).toBe(false)
  })
  it('sets availability and opens the dialog on manual checks, retaining it on failures', async () => {
    check.mockResolvedValue({ status: 'available', info })
    await button().trigger('click')
    await flushPromises()
    expect(dot()).toBe(true)
    expect(dialog().props('modelValue')).toBe(true)
    check.mockResolvedValue({ status: 'error', message: 'offline' })
    await button().trigger('click')
    await flushPromises()
    expect(dot()).toBe(true)
    expect(check).toHaveBeenCalledTimes(2)
  })
})
