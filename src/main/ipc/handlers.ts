import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getAllSubjects, createSubject, updateSubject, deleteSubject } from '../db/subjects'
import { getTasksBySubject, createTask, updateTask, deleteTask } from '../db/tasks'
import {
  getAttachmentsByTask,
  addAttachment,
  deleteAttachment,
  openAttachment
} from '../db/attachments'
import { getSetting, setSetting } from '../db/settings'

function wrap<T>(fn: () => T): { success: true; data: T } | { success: false; error: string } {
  try {
    return { success: true, data: fn() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[IPC Error]', msg)
    return { success: false, error: msg }
  }
}

export function setupIpcHandlers(): void {
  // ── Subjects ─────────────────────────────────────────────────────────────
  ipcMain.handle('subjects:getAll', () => wrap(() => getAllSubjects()))

  ipcMain.handle('subjects:create', (_e, data) => wrap(() => createSubject(data)))

  ipcMain.handle('subjects:update', (_e, id: number, data) =>
    wrap(() => updateSubject(id, data))
  )

  ipcMain.handle('subjects:delete', (_e, id: number) =>
    wrap(() => { deleteSubject(id); return null })
  )

  // ── Tasks ─────────────────────────────────────────────────────────────────
  ipcMain.handle('tasks:getBySubject', (_e, subjectId: number) =>
    wrap(() => getTasksBySubject(subjectId))
  )

  ipcMain.handle('tasks:create', (_e, data) => wrap(() => createTask(data)))

  ipcMain.handle('tasks:update', (_e, id: number, data) =>
    wrap(() => updateTask(id, data))
  )

  ipcMain.handle('tasks:delete', (_e, id: number) =>
    wrap(() => { deleteTask(id); return null })
  )

  // ── Attachments ───────────────────────────────────────────────────────────
  ipcMain.handle('attachments:getByTask', (_e, taskId: number) =>
    wrap(() => getAttachmentsByTask(taskId))
  )

  ipcMain.handle('attachments:add', (_e, taskId: number, filePath: string) =>
    wrap(() => addAttachment(taskId, filePath))
  )

  ipcMain.handle('attachments:delete', (_e, id: number) =>
    wrap(() => { deleteAttachment(id); return null })
  )

  ipcMain.handle('attachments:open', (_e, id: number) =>
    wrap(() => { openAttachment(id); return null })
  )

  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', (_e, key: string) => wrap(() => getSetting(key)))

  ipcMain.handle('settings:set', (_e, key: string, value: string) =>
    wrap(() => { setSetting(key, value); return null })
  )

  // ── File dialog ───────────────────────────────────────────────────────────
  ipcMain.handle('dialog:openFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window' }

    const result = await dialog.showOpenDialog(win, {
      title: 'Выберите файл',
      properties: ['openFile']
    })

    if (result.canceled || result.filePaths.length === 0) {
      return { success: true, data: null }
    }
    return { success: true, data: result.filePaths[0] }
  })
}
