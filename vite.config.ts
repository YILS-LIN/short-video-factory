import path from 'node:path'
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import electron from 'vite-plugin-electron/simple'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'
import UnoCSS from 'unocss/vite'
import { name as packageName, version } from './package.json'
import { syncElectronDevServerUrl } from './build/vite-plugins/sync-electron-dev-server-url'

const electronBuilderConfig = fs.readFileSync(
  fileURLToPath(new URL('./electron-builder.json5', import.meta.url)),
  'utf8',
)
const getBuilderString = (key: string, fallback: string) =>
  electronBuilderConfig.match(new RegExp(`\\b${key}\\s*:\\s*(['\"])(.*?)\\1`))?.[2] ?? fallback
const getBuildId = () => {
  const configuredId = process.env['BUILD_ID'] || process.env['GITHUB_SHA']
  if (configuredId) return configuredId.slice(0, 40)
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}
const appAnalyticsBuildInfo = JSON.stringify({
  productName: getBuilderString('productName', 'unknown'),
  appId: getBuilderString('appId', 'unknown'),
  packageName,
  buildId: getBuildId(),
  distributionChannel:
    process.env['ANALYTICS_DISTRIBUTION_CHANNEL'] ||
    (process.env['GITHUB_ACTIONS'] ? 'ci' : 'self_build'),
})

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
    __APP_ANALYTICS_BUILD_INFO__: appAnalyticsBuildInfo,
  },
  plugins: [
    syncElectronDevServerUrl(),
    vue(),
    vueDevTools(),
    UnoCSS(),
    electron({
      main: {
        // Shortcut of `build.lib.entry`.
        entry: 'electron/main.ts',
        vite: {
          define: {
            __APP_ANALYTICS_BUILD_INFO__: appAnalyticsBuildInfo,
          },
          build: {
            rollupOptions: {
              external: ['better-sqlite3'],
            },
          },
        },
      },
      preload: {
        // Shortcut of `build.rollupOptions.input`.
        // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead `build.lib.entry`.
        input: path.join(__dirname, 'electron/preload.ts'),
      },
      // Ployfill the Electron and Node.js API for Renderer process.
      // If you want use Node.js in Renderer process, the `nodeIntegration` needs to be enabled in the Main process.
      // See 👉 https://github.com/electron-vite/vite-plugin-electron-renderer
      renderer:
        process.env.NODE_ENV === 'test'
          ? // https://github.com/electron-vite/vite-plugin-electron-renderer/issues/78#issuecomment-2053600808
            undefined
          : {},
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '~': fileURLToPath(new URL('./', import.meta.url)),
    },
  },
  build: {
    rollupOptions: {},
    chunkSizeWarningLimit: 2048,
  },
})
