import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

const store = createPinia().use(piniaPluginPersistedstate)

export default store

export * from './app'
export * from './metadata'
