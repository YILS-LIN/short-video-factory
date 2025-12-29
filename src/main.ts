import 'vuetify/styles/main.sass'
import '@mdi/font/css/materialdesignicons.css'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import { aliases, mdi } from 'vuetify/iconsets/mdi'

import Toast, { PluginOptions } from 'vue-toastification'
import 'vue-toastification/dist/index.css'

import 'virtual:uno.css'
import './assets/base.scss'

import { createApp } from 'vue'
import router from './router/index.ts'
import store, { useAppStore } from './store/index.ts'
import App from './App.vue'

import i18next from 'i18next'
import I18NextVue from 'i18next-vue'
import i18nInitialized from './lib/i18n.ts'

const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'mdi',
    aliases,
    sets: {
      mdi,
    },
  },
})

const app = createApp(App)

app.use(vuetify)
app.use(Toast, {
  position: 'bottom-left',
  pauseOnFocusLoss: false,
  closeOnClick: false,
} as PluginOptions)
app.use(router)
app.use(store)

// 初始化并应用国际化
i18nInitialized().then(() => {
  app.use(I18NextVue, { i18next })
  app.mount('#app').$nextTick(() => {
    // 测试消息
    window.ipcRenderer.on('main-process-message', (_event, message) => {
      console.log(message)
    })

    // 监听主进程切换语言
    window.ipcRenderer.on('i18n-changeLanguage', (_event, lng) => {
      i18next.changeLanguage(lng)
      useAppStore().updateLocale(lng)
    })
  })
})
