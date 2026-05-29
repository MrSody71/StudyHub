import { app, BrowserWindow, shell, protocol } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase } from './db/database'
import { setupIpcHandlers } from './ipc/handlers'
import { startNotificationScheduler } from './notifications'
import { setupAttachmentProtocol } from './protocol'

// Must be called before app.ready
protocol.registerSchemesAsPrivileged([{
  scheme:     'attachment',
  privileges: { secure: true, standard: true, bypassCSP: true, supportFetchAPI: true },
}])

app.setName('StudyHub')
// Required on Windows for system notifications to appear correctly
if (process.platform === 'win32') {
  app.setAppUserModelId('com.studyhub.app')
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false,
    backgroundColor: '#f8f9fa',
    title: 'StudyHub',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  win.on('ready-to-show', () => win.show())

  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https:')) shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env['ELECTRON_RENDERER_URL']

  if (!app.isPackaged && devUrl) {
    // Retry on connection refused (Vite dev server may not be ready yet)
    const load = () => {
      win.loadURL(devUrl).catch(() => {
        setTimeout(load, 300)
      })
    }
    load()
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  initDatabase()
  setupIpcHandlers()
  setupAttachmentProtocol()
  startNotificationScheduler()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})
