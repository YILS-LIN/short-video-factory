// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import AnnouncementPill from '../../src/views/Home/components/AnnouncementPill.vue'
import type { MatchedNotice } from '../../src/lib/notices'

vi.mock('i18next-vue', () => ({ useTranslation: () => ({ t: (key: string) => key }) }))
function entry(id: string): MatchedNotice {
  const translation = { title: id, summary: '', bodyMarkdown: '', actions: [] }
  return {
    notice: {
      id,
      revision: 1,
      kind: 'general',
      severity: 'info',
      priority: 0,
      publishedAt: '2026-10-13T00:00:00Z',
      dismissible: true,
      defaultLocale: 'en',
      translations: { en: translation },
    },
    translation,
    read: false,
    dismissed: false,
  }
}
let wrapper: VueWrapper | undefined
function render(notices: MatchedNotice[]) {
  wrapper = mount(AnnouncementPill, { props: { notices }, global: { stubs: { 'v-icon': true } } })
  return wrapper
}
beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  wrapper?.unmount()
  vi.useRealTimers()
})
describe('static announcement entry', () => {
  it('shows the first sorted announcement and folds the rest into a count', async () => {
    render([entry('urgent'), entry('second'), entry('third')])
    expect(wrapper!.find('.announcement-pill__title').text()).toBe('urgent')
    expect(wrapper!.find('.announcement-pill__count').text()).toBe('+2')
    expect(wrapper!.findAll('button')).toHaveLength(1)
    expect(wrapper!.find('.announcement-pill__details').text()).toBe('announcements.viewDetails')
    await wrapper!.trigger('click')
    expect(wrapper!.emitted('open')).toEqual([['urgent:1']])
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60000)
    expect(wrapper!.find('.announcement-pill__title').text()).toBe('urgent')
  })
  it('updates the entry when notices expire and hides it when empty', async () => {
    render([entry('a'), entry('b')])
    await wrapper!.setProps({ notices: [entry('b')] })
    expect(wrapper!.find('.announcement-pill__count').exists()).toBe(false)
    await wrapper!.trigger('click')
    expect(wrapper!.emitted('open')).toEqual([['b:1']])
    await wrapper!.setProps({ notices: [] })
    expect(wrapper!.find('button').exists()).toBe(false)
  })
  it('retains unread indication for other notices without marking anything read', async () => {
    render([{ ...entry('a'), read: true }, entry('b')])
    expect(wrapper!.find('.announcement-pill__unread').exists()).toBe(true)
    await wrapper!.setProps({ notices: [{ ...entry('a'), read: true }] })
    expect(wrapper!.find('.announcement-pill__unread').exists()).toBe(false)
  })
})
