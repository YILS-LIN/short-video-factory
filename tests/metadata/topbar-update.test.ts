// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import TopBar from '../../src/views/Home/components/TopBar.vue'
import { trackAnalytics } from '../../src/lib/analytics'
import type { UpdateCheckResult, UpdateInfo } from '../../electron/updater'

const toast = vi.hoisted(() => ({ info: vi.fn(), success: vi.fn(), error: vi.fn() }))

vi.mock('i18next-vue', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18next: { language: 'en' } }),
}))
vi.mock('vue-toastification', () => ({
  useToast: () => toast,
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
const info: UpdateInfo = {
  version: '9.0.0',
  minimumVersion: null,
  releaseNotes: {},
  fallbackReleaseNotes: '',
  releaseDate: '',
  mandatory: false,
  assetAvailable: null,
  homepage: 'https://example.com',
  notesOverride: null,
  source: 'github',
}
beforeEach(() => {
  handlers.clear()
  check.mockReset().mockResolvedValue({ status: 'up-to-date' })
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
})
const mountTopBar = () => {
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
}
afterEach(() => wrapper.unmount())
const button = () => wrapper.find('button.topbar-action')
const dot = () => wrapper.find('.topbar-update-dot').exists()
const dialog = () => wrapper.findComponent({ name: 'UpdateDialog' })

describe('update availability badge', () => {
  it('checks after subscribing and opens the automatic popup from the result without an event', async () => {
    check.mockImplementation(async () => {
      expect(handlers.has('update-available')).toBe(true)
      return { status: 'available', info }
    })
    mountTopBar()
    expect(dot()).toBe(false)
    await flushPromises()
    expect(check).toHaveBeenCalledTimes(1)
    expect(dot()).toBe(true)
    expect(dialog().props('modelValue')).toBe(true)
    expect(button().attributes('aria-label')).toBe('version.updateAvailable')
    expect(trackAnalytics).toHaveBeenCalledWith(
      'update_check_finished',
      expect.objectContaining({ trigger: 'automatic', outcome: 'success', has_update: true }),
    )
    expect(toast.info).not.toHaveBeenCalled()
    dialog().vm.$emit('update:modelValue', false)
    await flushPromises()
    expect(dialog().props('modelValue')).toBe(false)
    expect(dot()).toBe(true)
  })
  it.each(['up-to-date', 'no-release'])('keeps automatic %s results silent', async (status) => {
    check.mockResolvedValue({ status })
    mountTopBar()
    await flushPromises()
    expect(dot()).toBe(false)
    expect(dialog().exists()).toBe(false)
    expect(toast.info).not.toHaveBeenCalled()
    expect(toast.success).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })
  it.each(['result', 'rejection'])(
    'silently handles an automatic %s failure and allows manual retry',
    async (failure) => {
      vi.spyOn(console, 'warn').mockImplementation(() => {})
      vi.spyOn(console, 'error').mockImplementation(() => {})
      if (failure === 'result') check.mockResolvedValueOnce({ status: 'error', message: 'offline' })
      else check.mockRejectedValueOnce(new Error('offline'))
      mountTopBar()
      await flushPromises()
      expect(dot()).toBe(false)
      expect(toast.info).not.toHaveBeenCalled()
      expect(toast.error).not.toHaveBeenCalled()
      expect(button().attributes('disabled')).toBeUndefined()
      expect(trackAnalytics).toHaveBeenCalledWith(
        'update_check_finished',
        expect.objectContaining({ trigger: 'automatic', outcome: 'failed', has_update: false }),
      )
      check.mockResolvedValue({ status: 'available', info })
      await button().trigger('click')
      await flushPromises()
      expect(check).toHaveBeenCalledTimes(2)
      expect(dot()).toBe(true)
      expect(dialog().props('modelValue')).toBe(true)
      expect(toast.info).toHaveBeenCalledWith('update.checking')
    },
  )
  it('disables manual checks while the automatic check is pending', async () => {
    let resolve!: (result: UpdateCheckResult) => void
    check.mockReturnValue(
      new Promise<UpdateCheckResult>((done) => {
        resolve = done
      }),
    )
    mountTopBar()
    await wrapper.vm.$nextTick()
    expect(button().attributes('disabled')).toBeDefined()
    await button().trigger('click')
    expect(check).toHaveBeenCalledTimes(1)
    resolve({ status: 'available', info })
    await flushPromises()
    expect(button().attributes('disabled')).toBeUndefined()
    expect(dot()).toBe(true)
    expect(dialog().props('modelValue')).toBe(true)
  })
  it('continues handling update notifications after the startup check', async () => {
    mountTopBar()
    await flushPromises()
    handlers.get('update-available')!(null, info)
    await flushPromises()
    expect(dot()).toBe(true)
    expect(dialog().props('modelValue')).toBe(true)
  })
  it.each(['up-to-date', 'no-release'])('clears availability after %s', async (status) => {
    mountTopBar()
    await flushPromises()
    handlers.get('update-available')!(null, info)
    check.mockResolvedValue({ status })
    await button().trigger('click')
    await flushPromises()
    expect(dot()).toBe(false)
    expect(toast.info).toHaveBeenCalledWith('update.checking')
    if (status === 'up-to-date') expect(toast.success).toHaveBeenCalledWith('update.upToDate')
    else expect(toast.info).toHaveBeenCalledWith('update.noRelease')
  })
  it('sets availability and opens the dialog on manual checks, retaining it on failures', async () => {
    mountTopBar()
    await flushPromises()
    check.mockResolvedValue({ status: 'available', info })
    await button().trigger('click')
    await flushPromises()
    expect(dot()).toBe(true)
    expect(dialog().props('modelValue')).toBe(true)
    check.mockResolvedValue({ status: 'error', message: 'offline' })
    await button().trigger('click')
    await flushPromises()
    expect(dot()).toBe(true)
    expect(toast.error).toHaveBeenCalledTimes(1)
    expect(check).toHaveBeenCalledTimes(3)
  })
})
