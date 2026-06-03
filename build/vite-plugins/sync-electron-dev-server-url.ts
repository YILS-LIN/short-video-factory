import type { Plugin, ViteDevServer } from 'vite'

function resolveElectronDevServerUrl(server: ViteDevServer) {
  const resolvedUrl = server.resolvedUrls?.local[0]

  if (resolvedUrl) {
    return resolvedUrl
  }

  const address = server.httpServer?.address()

  if (!address || typeof address === 'string') {
    return undefined
  }

  const protocol = server.config.server.https ? 'https' : 'http'
  const host = ['::', '::1', '0.0.0.0'].includes(address.address) ? 'localhost' : address.address

  return `${protocol}://${host}:${address.port}${server.config.base}`
}

export function syncElectronDevServerUrl(): Plugin {
  return {
    name: 'sync-electron-dev-server-url',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        const syncDevServerUrl = () => {
          const url = resolveElectronDevServerUrl(server)

          if (url) {
            process.env.VITE_DEV_SERVER_URL = url
          }
        }

        syncDevServerUrl()
        // Run after other listening handlers so plugin-injected values cannot overwrite it.
        setImmediate(syncDevServerUrl)
      })
    },
  }
}
