import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  preferredLanguages: vi.fn(() => ['zh-Hans-CN']),
  handle: vi.fn(),
  send: vi.fn(),
  i18next: {
    language: '',
    use: vi.fn(),
    init: vi.fn(),
    changeLanguage: vi.fn(),
  },
}))

vi.mock('electron', () => ({
  app: { getPreferredSystemLanguages: mocks.preferredLanguages },
  ipcMain: { handle: mocks.handle },
  BrowserWindow: { getAllWindows: () => [{ webContents: { send: mocks.send } }] },
}))
vi.mock('i18next', () => ({ default: mocks.i18next }))
vi.mock('i18next-fs-backend', () => ({ default: {} }))

import { changeAppLanguage, getAppLanguagePreference, initI18n } from '../../electron/i18n'

describe('main process language preference', () => {
  beforeEach(() => {
    mocks.preferredLanguages.mockReturnValue(['zh-Hans-CN'])
    mocks.i18next.use.mockReturnValue(mocks.i18next)
    mocks.i18next.init.mockImplementation(async ({ lng }: { lng: string }) => {
      mocks.i18next.language = lng
    })
    mocks.i18next.changeLanguage.mockImplementation(async (lng: string) => {
      mocks.i18next.language = lng
    })
  })

  it('initializes using the preferred system languages', async () => {
    await initI18n()
    expect(mocks.i18next.init).toHaveBeenCalledWith(expect.objectContaining({ lng: 'zh-CN' }))
    expect(mocks.handle).toHaveBeenCalledWith('i18n-getLanguage', expect.any(Function))
  })

  it('broadcasts an explicit selection separately from the resolved language', async () => {
    await changeAppLanguage('en')
    expect(getAppLanguagePreference()).toBe('en')
    expect(mocks.send).toHaveBeenCalledWith('i18n-changeLanguage', 'en', 'en')
  })

  it('re-reads system preferences when switching back to follow system', async () => {
    await changeAppLanguage('en')
    await changeAppLanguage('')
    expect(getAppLanguagePreference()).toBe('')
    expect(mocks.send).toHaveBeenCalledWith('i18n-changeLanguage', 'zh-CN', '')

    mocks.preferredLanguages.mockReturnValue(['en-GB'])
    await changeAppLanguage('')
    expect(mocks.send).toHaveBeenCalledWith('i18n-changeLanguage', 'en', '')
  })
})
