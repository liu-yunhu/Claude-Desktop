import { app, BrowserWindow, Tray, Menu, shell } from 'electron'
import { join } from 'path'
import { registerIpc } from './ipc'
import { appState } from './state'

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    title: 'Claude Desktop',
    backgroundColor: '#1a1b26',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    show: false
  })

  mainWindow.on('ready-to-show', async () => {
    if (process.env.SMOKE_TEST) {
      // 验证 React 已挂载（CSP 未拦截脚本、renderer bundle 正常执行）
      try {
        const count = await mainWindow?.webContents.executeJavaScript(
          'document.getElementById("root")?.childElementCount ?? -1'
        )
        console.log(`SMOKE_OK root_children=${count}`)
      } catch (e) {
        console.log(`SMOKE_FAIL ${String(e)}`)
      }
      appState.quitting = true
      app.quit()
      return
    }
    mainWindow?.show()
  })

  // 关闭到托盘
  mainWindow.on('close', (e) => {
    if (appState.closeToTray && !appState.quitting) {
      e.preventDefault()
      mainWindow?.hide()
    }
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // electron-vite 开发模式加载 dev server，生产加载打包文件
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function createTray(): void {
  try {
    const icon = join(__dirname, '../../resources/icon.png')
    tray = new Tray(icon)
  } catch {
    return // 图标缺失时跳过托盘（不阻断启动）
  }
  const menu = Menu.buildFromTemplate([
    { label: '显示主窗口', click: () => (mainWindow?.isVisible() ? mainWindow.focus() : mainWindow?.show()) },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        appState.quitting = true
        app.quit()
      }
    }
  ])
  tray.setToolTip('Claude Desktop')
  tray.setContextMenu(menu)
  tray.on('click', () => (mainWindow?.isVisible() ? mainWindow?.hide() : mainWindow?.show()))
}

app.whenReady().then(() => {
  registerIpc(() => mainWindow)
  createWindow()
  createTray()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  // 关闭到托盘，不退出；托盘菜单里才真正退出
})
