import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { BrowserWindow } from 'electron'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

function isEnvEnabled(value: string | undefined): boolean {
  return value === '1' || value?.toLowerCase() === 'true'
}

const EFFECT_RENDERER_DEBUG = isEnvEnabled(import.meta.env.VITE_EFFECT_RENDERER_DEBUG)

let renderWindow: BrowserWindow | null = null

export async function ensureEffectRenderWindow(): Promise<BrowserWindow> {
  if (renderWindow && !renderWindow.isDestroyed()) {
    return renderWindow
  }

  // 注意：这里必须和主窗口一致，指向 dist-electron/preload.js。
  // 若 preload 路径错误，隐藏窗口将拿不到 window.ipcRenderer，导致导出任务无响应。
  const preloadPath = path.join(__dirname, 'preload.js')
  const mainWindow = BrowserWindow.getAllWindows().find((win) => win.isVisible())
  renderWindow = new BrowserWindow({
    parent: mainWindow,
    show: EFFECT_RENDERER_DEBUG,
    width: 800,
    height: 600,
    webPreferences: {
      preload: preloadPath,
      backgroundThrottling: false,
      webSecurity: false,
    },
  })
  renderWindow.on('closed', () => {
    renderWindow = null
  })

  renderWindow.webContents.on('did-fail-load', (_event, code, desc, url) => {
    console.error('[EffectEngine] 隐藏渲染窗口加载失败:', { code, desc, url })
  })
  renderWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('[EffectEngine] 隐藏渲染窗口进程异常退出:', details)
  })

  if (DEV_SERVER_URL) {
    await renderWindow.loadURL(`${DEV_SERVER_URL}#/effect-renderer`)
  } else {
    const appRoot = process.env.APP_ROOT as string
    await renderWindow.loadFile(path.join(appRoot, 'dist', 'index.html'), {
      hash: '/effect-renderer',
    })
  }

  if (EFFECT_RENDERER_DEBUG) {
    renderWindow.show()
  }

  return renderWindow
}

export function getEffectRenderWindow() {
  return renderWindow
}

export function destroyEffectRenderWindow() {
  if (renderWindow && !renderWindow.isDestroyed()) {
    renderWindow.destroy()
  }
  renderWindow = null
}
