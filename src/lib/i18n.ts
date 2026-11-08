import { useAppStore } from '@/store'
import i18next from 'i18next'
import Backend from 'i18next-http-backend'
import { toRaw } from 'vue'
import { i18nCommonOptions } from '~/electron/i18n/common-options'

const i18nInitialized = async () => {
  const appStore = useAppStore()
  if (appStore.locale) {
    await window.i18n.changeLanguage(toRaw(appStore.locale))
  }
  return i18next.use(Backend).init({
    // debug: true,
    ...i18nCommonOptions,
    lng: await window.i18n.getLanguage(),
    backend: {
      loadPath: 'file:///' + (await window.i18n.getLocalesPath()),
    },
  })
}

export const i18n = i18next

export default i18nInitialized
