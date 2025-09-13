import { app, BrowserWindow, screen, Menu } from 'electron'
import type { MenuItemConstructorOptions } from 'electron'
import { fileURLToPath } from 'node:url'
import { isDev } from './lib/is-dev'
import path from 'node:path'
import initIPC from './ipc'
import { initSqlite } from './sqlite'
import i18next from 'i18next'
import { changeAppLanguage, initI18n } from './i18n'
import { i18nLanguages } from './i18n/common-options'
import useCookieAllowCrossSite from './lib/cookie-allow-cross-site'

// 用于引入 CommonJS 模块的方法
// import { createRequire } from 'node:module'
// const require = createRequire(import.meta.url)

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// 已构建的目录结构
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 使用['ENV_NAME'] 避免 vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = isDev ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'icon.png'),
    width: Math.ceil(width * 0.8),
    height: Math.ceil(height * 0.8),
    minWidth: 800,
    minHeight: 650,
    backgroundColor: '#F3F3F3',
    show: false,
    frame: false,
    webPreferences: {
      webSecurity: false,
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // 优化应用进入体验
  win.once('ready-to-show', () => {
    win?.show()
  })

  //测试向渲染器进程发送的活动推送消息。
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', new Date().toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

function buildMenu() {
  const template: MenuItemConstructorOptions[] = [
    // macOS standard app menu
    ...(process.platform === 'darwin'
      ? [
          {
            label: i18next.t('app.name'),
            submenu: [
              {
                label: i18next.t('menu.app.about'),
                click: async () => {
                  const { shell } = await import('electron')
                  await shell.openExternal('https://github.com/TLS-802/TLS-Video-Factory')
                },
              },
              { type: 'separator' },
              { label: i18next.t('menu.app.services'), role: 'services' },
              { type: 'separator' },
              { label: i18next.t('menu.app.hide'), role: 'hide' },
              { label: i18next.t('menu.app.hideOthers'), role: 'hideOthers' },
              { label: i18next.t('menu.app.unhide'), role: 'unhide' },
              { type: 'separator' },
              { label: i18next.t('menu.app.quit'), role: 'quit' },
            ] as MenuItemConstructorOptions[],
          },
        ]
      : []),
    {
      label: i18next.t('menu.language'),
      submenu: i18nLanguages.map((lng) => ({
        label: lng.name,
        type: 'radio',
        checked: i18next.language === lng.code,
        click: () => {
          changeAppLanguage(lng.code)
        },
      })) as MenuItemConstructorOptions[],
    },
    {
      label: i18next.t('menu.edit.root'),
      submenu: [
        { label: i18next.t('menu.edit.undo'), role: 'undo' },
        { label: i18next.t('menu.edit.redo'), role: 'redo' },
        { type: 'separator' },
        { label: i18next.t('menu.edit.cut'), role: 'cut' },
        { label: i18next.t('menu.edit.copy'), role: 'copy' },
        { label: i18next.t('menu.edit.paste'), role: 'paste' },
        { label: i18next.t('menu.edit.selectAll'), role: 'selectAll' },
      ] as MenuItemConstructorOptions[],
    },
    {
      label: i18next.t('menu.view.root'),
      submenu: [
        { role: 'toggleDevTools', visible: false },
        { label: i18next.t('menu.view.resetZoom'), role: 'resetZoom' },
        { label: i18next.t('menu.view.zoomIn'), role: 'zoomIn' },
        { label: i18next.t('menu.view.zoomOut'), role: 'zoomOut' },
        { type: 'separator' },
        { label: i18next.t('menu.view.toggleFullscreen'), role: 'togglefullscreen' },
      ] as MenuItemConstructorOptions[],
    },
    {
      label: i18next.t('menu.window.root'),
      role: 'window',
      submenu: [
        { label: i18next.t('menu.window.minimize'), role: 'minimize' },
        { label: i18next.t('menu.window.close'), role: 'close' },
      ] as MenuItemConstructorOptions[],
    },
    {
      label: i18next.t('menu.help.root'),
      role: 'help',
      submenu: [
        {
          label: i18next.t('menu.help.learnMore'),
          click: async () => {
            const { shell } = await import('electron')
            await shell.openExternal('https://github.com/TLS-802/TLS-Video-Factory')
          },
        },
      ] as MenuItemConstructorOptions[],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

//关闭所有窗口后退出，macOS除外。在那里，这很常见
//让应用程序及其菜单栏保持活动状态，直到用户退出
//显式使用Cmd+Q。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  //在OS X上，当出现以下情况时，通常会在应用程序中重新创建一个窗口
  //单击dock图标后，没有其他打开的窗口。
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// 禁用硬件加速
// app.disableHardwareAcceleration();

app.whenReady().then(() => {
  initSqlite()
  initI18n()
  initIPC()
  createWindow()

  i18next.on('languageChanged', () => {
    buildMenu()
  })

  // 允许跨站请求携带cookie
  useCookieAllowCrossSite()
  // 禁用 CORS
  app.commandLine.appendSwitch('disable-features', 'OutOfBlinkCors')
  // 允许本地网络请求
  app.commandLine.appendSwitch('disable-features', 'BlockInsecurePrivateNetworkRequests')
})
