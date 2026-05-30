import { app, BrowserWindow, ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'

// Never auto-download — the user must confirm first
autoUpdater.autoDownload         = false
autoUpdater.autoInstallOnAppQuit = false

// Route electron-updater log output through the console
autoUpdater.logger = {
  info:  (msg: unknown) => console.log('[updater]', msg),
  warn:  (msg: unknown) => console.warn('[updater]', msg),
  error: (msg: unknown) => console.error('[updater]', msg),
  debug: (_msg: unknown) => { /* suppress */ },
}

/** Send a message to all open renderer windows. */
function send(channel: string, data?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    if (!win.isDestroyed()) win.webContents.send(channel, data)
  }
}

export function setupAutoUpdater(): void {
  // ── Event forwarding ────────────────────────────────────────────────────────
  autoUpdater.on('update-available', (info) => {
    send('updater:update-available', { version: info.version })
  })

  autoUpdater.on('update-not-available', () => {
    send('updater:update-not-available')
  })

  autoUpdater.on('download-progress', (p) => {
    send('updater:download-progress', Math.round(p.percent))
  })

  autoUpdater.on('update-downloaded', (info) => {
    send('updater:update-downloaded', { version: info.version })
  })

  autoUpdater.on('error', (err) => {
    send('updater:error', err.message)
  })

  // ── IPC handlers ────────────────────────────────────────────────────────────
  ipcMain.handle('updater:checkForUpdates', async () => {
    // In dev mode there is no published release to compare against
    if (!app.isPackaged) {
      // Simulate "no update" so the UI doesn't wait forever
      setTimeout(() => send('updater:update-not-available'), 300)
      return { success: true, data: null }
    }
    try {
      await autoUpdater.checkForUpdates()
      return { success: true, data: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('updater:downloadUpdate', async () => {
    try {
      await autoUpdater.downloadUpdate()
      return { success: true, data: null }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return { success: false, error: msg }
    }
  })

  ipcMain.handle('updater:quitAndInstall', () => {
    // isSilent=false shows the installer UI; isForceRunAfter=true re-launches the app
    autoUpdater.quitAndInstall(false, true)
    return { success: true, data: null }
  })

  ipcMain.handle('updater:getVersion', () => {
    return { success: true, data: app.getVersion() }
  })

  // ── Silent startup check ────────────────────────────────────────────────────
  // Only runs in the packaged app; delayed so it doesn't slow down startup.
  if (app.isPackaged) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.error('[updater] startup check failed:', err.message)
      })
    }, 8_000)
  }
}
