import { app, BrowserWindow, shell, protocol, session } from 'electron'
import path from 'path'
import { initDatabase, closeDatabase } from './db/database'
import { setupIpcHandlers } from './ipc/handlers'
import { startNotificationScheduler } from './notifications'
import { setupAttachmentProtocol } from './protocol'
import { setupAutoUpdater } from './updater'
import { startTulguScheduler } from './tulguScheduler'

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

  // Prevent the renderer from navigating away to an external page (phishing, open-redirect).
  // Only allow the dev-server origin and local file:// loads.
  win.webContents.on('will-navigate', (event, url) => {
    const parsed = new URL(url)
    const isLocal = parsed.protocol === 'file:'
    const isDevServer = !app.isPackaged && parsed.origin === new URL(process.env['ELECTRON_RENDERER_URL'] || 'http://localhost').origin
    if (!isLocal && !isDevServer) {
      event.preventDefault()
      console.warn('[security] Blocked navigation to:', url)
    }
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

const isDev = !app.isPackaged

// In dev mode: allow 'unsafe-inline' scripts (Vite/React HMR preamble) and
// ws:// for HMR WebSocket. In production these are not needed.
const CSP = [
  "default-src 'self'",
  isDev
    ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
    : "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  isDev
    ? "connect-src 'self' ws://127.0.0.1:* http://127.0.0.1:* https://*.supabase.co wss://*.supabase.co https://moodle.tulsu.ru https://tulsu.ru https://corsproxy.io"
    : "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://moodle.tulsu.ru https://tulsu.ru https://corsproxy.io",
].join('; ')

app.whenReady().then(() => {
  // Override CSP at the session level so it applies in both dev and packaged builds.
  // This is more reliable than the <meta> tag alone, which some Electron versions ignore
  // for locally-loaded files.
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [CSP],
      },
    })
  })

  // Block all permission requests the app doesn't need (camera, mic, geolocation, etc.)
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    const allowed = new Set(['notifications'])
    if (allowed.has(permission)) {
      callback(true)
    } else {
      console.warn('[security] Denied permission request:', permission)
      callback(false)
    }
  })

  // Also block permission checks (synchronous queries)
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => {
    const allowed = new Set(['notifications'])
    return allowed.has(permission)
  })

  initDatabase()
  setupIpcHandlers()
  setupAttachmentProtocol()
  startNotificationScheduler()
  startTulguScheduler()
  setupAutoUpdater()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') app.quit()
})
