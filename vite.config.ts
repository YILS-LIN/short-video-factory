import path from 'node:path'
import fs from 'node:fs'
import { createPublicKey } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
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
const getBuildId = (env: Record<string, string>) => {
  const configuredId = env['BUILD_ID'] || env['GITHUB_SHA']
  if (configuredId) return configuredId.slice(0, 40)
  try {
    return execFileSync('git', ['rev-parse', '--short=12', 'HEAD'], { encoding: 'utf8' }).trim()
  } catch {
    return 'unknown'
  }
}

function parseMetadataPublicKeys(value: string | undefined): Record<string, string> {
  if (!value?.trim()) return {}
  let parsed: unknown
  try {
    parsed = JSON.parse(value)
  } catch {
    throw new Error('METADATA_API_PUBLIC_KEYS must be a JSON object keyed by keyId.')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('METADATA_API_PUBLIC_KEYS must be a JSON object keyed by keyId.')
  }
  for (const [keyId, publicKey] of Object.entries(parsed)) {
    if (!keyId.trim() || typeof publicKey !== 'string' || !publicKey.includes('PUBLIC KEY')) {
      throw new Error(`METADATA_API_PUBLIC_KEYS contains an invalid public key entry: ${keyId}`)
    }
    try {
      if (createPublicKey(publicKey).asymmetricKeyType !== 'ed25519') {
        throw new Error('Expected an Ed25519 public key.')
      }
    } catch {
      throw new Error(
        `METADATA_API_PUBLIC_KEYS entry '${keyId}' must be a valid Ed25519 public key.`,
      )
    }
  }
  return parsed as Record<string, string>
}

function validateMetadataBaseUrl(value: string, environment: 'development' | 'production'): string {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('METADATA_API_BASE_URL must be a valid absolute URL.')
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new Error(
      'METADATA_API_BASE_URL cannot include credentials, query parameters, or a fragment.',
    )
  }
  if (environment === 'production' && url.protocol !== 'https:') {
    throw new Error('Production METADATA_API_BASE_URL must use HTTPS.')
  }
  if (
    environment === 'development' &&
    url.protocol !== 'https:' &&
    !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
  ) {
    throw new Error('Development METADATA_API_BASE_URL must use HTTPS or a local HTTP service.')
  }
  return url.toString().replace(/\/$/, '')
}

const metadataChannelValues = ['stable', 'beta', 'nightly'] as const

// https://vitejs.dev/config/
export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const environment = command === 'serve' ? 'development' : 'production'
  const configuredBaseUrl = env['METADATA_API_BASE_URL']
  if (!configuredBaseUrl) {
    throw new Error(
      'METADATA_API_BASE_URL must be configured for both development and production builds.',
    )
  }

  const releaseChannel = env['METADATA_RELEASE_CHANNEL'] || 'stable'
  if (!metadataChannelValues.includes(releaseChannel as (typeof metadataChannelValues)[number])) {
    throw new Error('METADATA_RELEASE_CHANNEL must be stable, beta, or nightly.')
  }

  const buildId = getBuildId(env)
  const distributionChannel =
    env['ANALYTICS_DISTRIBUTION_CHANNEL'] || (env['GITHUB_ACTIONS'] ? 'ci' : 'self_build')
  const publicKeys = parseMetadataPublicKeys(env['METADATA_API_PUBLIC_KEYS'])
  if (environment === 'production' && Object.keys(publicKeys).length === 0) {
    throw new Error(
      'Production builds require at least one trusted METADATA_API_PUBLIC_KEYS entry.',
    )
  }
  const appAnalyticsBuildInfo = JSON.stringify({
    productName: getBuilderString('productName', 'unknown'),
    appId: getBuilderString('appId', 'unknown'),
    packageName,
    buildId,
    distributionChannel,
  })
  const metadataConfig = JSON.stringify({
    environment,
    apiBaseUrl: validateMetadataBaseUrl(configuredBaseUrl, environment),
    appId: 'short-video-factory',
    releaseChannel,
    distributionChannel,
    buildId,
    publicKeys,
  })

  return {
    define: {
      __APP_VERSION__: JSON.stringify(version),
      __APP_ANALYTICS_BUILD_INFO__: appAnalyticsBuildInfo,
      __APP_METADATA_ENVIRONMENT__: JSON.stringify(environment),
      __APP_METADATA_RELEASE_CHANNEL__: JSON.stringify(releaseChannel),
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
              __APP_METADATA_CONFIG__: metadataConfig,
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
          // Preload scripts may contain Web assets, so use the `build.rollupOptions.input` instead the `build.lib.entry`.
          input: path.join(__dirname, 'electron/preload.ts'),
        },
        // Polyfill for the Electron renderer process.
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
  }
})
