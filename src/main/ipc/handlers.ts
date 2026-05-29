import { ipcMain, dialog, BrowserWindow } from 'electron'
import { getAllSubjects, createSubject, updateSubject, deleteSubject } from '../db/subjects'
import { getTasksBySubject, getAllTasksWithDeadline, createTask, updateTask, deleteTask, completeTaskAndSpawnNext } from '../db/tasks'
import {
  getAttachmentsByTask, addAttachment, deleteAttachment, openAttachment
} from '../db/attachments'
import {
  getSubtasksByTask, createSubtask, updateSubtask, deleteSubtask, reorderSubtasks
} from '../db/subtasks'
import {
  getAllTags, createTag, updateTag, deleteTag, setTaskTags
} from '../db/tags'
import { getSetting, setSetting } from '../db/settings'
import {
  getAllScheduleEntries, createScheduleEntry, updateScheduleEntry, deleteScheduleEntry
} from '../db/schedule'

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
  ipcMain.handle('subjects:update', (_e, id: number, data) => wrap(() => updateSubject(id, data)))
  ipcMain.handle('subjects:delete', (_e, id: number) => wrap(() => { deleteSubject(id); return null }))

  // ── Tasks ─────────────────────────────────────────────────────────────────
  ipcMain.handle('tasks:getBySubject',        (_e, subjectId: number) => wrap(() => getTasksBySubject(subjectId)))
  ipcMain.handle('tasks:getAllWithDeadline',   ()                     => wrap(() => getAllTasksWithDeadline()))
  ipcMain.handle('tasks:create',              (_e, data)             => wrap(() => createTask(data)))
  ipcMain.handle('tasks:update',              (_e, id: number, data) => wrap(() => updateTask(id, data)))
  ipcMain.handle('tasks:delete',              (_e, id: number)       => wrap(() => { deleteTask(id); return null }))
  ipcMain.handle('tasks:completeRecurring',   (_e, id: number)       => wrap(() => completeTaskAndSpawnNext(id)))

  // ── Attachments ───────────────────────────────────────────────────────────
  ipcMain.handle('attachments:getByTask', (_e, taskId: number) => wrap(() => getAttachmentsByTask(taskId)))
  ipcMain.handle('attachments:add', (_e, taskId: number, filePath: string) => wrap(() => addAttachment(taskId, filePath)))
  ipcMain.handle('attachments:delete', (_e, id: number) => wrap(() => { deleteAttachment(id); return null }))
  ipcMain.handle('attachments:open', (_e, id: number) => wrap(() => { openAttachment(id); return null }))

  // ── Subtasks ──────────────────────────────────────────────────────────────
  ipcMain.handle('subtasks:getByTask', (_e, taskId: number) => wrap(() => getSubtasksByTask(taskId)))
  ipcMain.handle('subtasks:create', (_e, taskId: number, title: string) => wrap(() => createSubtask(taskId, title)))
  ipcMain.handle('subtasks:update', (_e, id: number, data: { title?: string; is_done?: boolean }) => wrap(() => updateSubtask(id, data)))
  ipcMain.handle('subtasks:delete', (_e, id: number) => wrap(() => { deleteSubtask(id); return null }))
  ipcMain.handle('subtasks:reorder', (_e, taskId: number, orderedIds: number[]) => wrap(() => { reorderSubtasks(taskId, orderedIds); return null }))

  // ── Tags ──────────────────────────────────────────────────────────────────
  ipcMain.handle('tags:getAll', () => wrap(() => getAllTags()))
  ipcMain.handle('tags:create', (_e, name: string, color: string) => wrap(() => createTag(name, color)))
  ipcMain.handle('tags:update', (_e, id: number, data: { name?: string; color?: string }) => wrap(() => updateTag(id, data)))
  ipcMain.handle('tags:delete', (_e, id: number) => wrap(() => { deleteTag(id); return null }))
  ipcMain.handle('tags:setTaskTags', (_e, taskId: number, tagIds: number[]) => wrap(() => { setTaskTags(taskId, tagIds); return null }))

  // ── Schedule ─────────────────────────────────────────────────────────────
  ipcMain.handle('schedule:getAll',    ()                          => wrap(() => getAllScheduleEntries()))
  ipcMain.handle('schedule:create',    (_e, data)                 => wrap(() => createScheduleEntry(data)))
  ipcMain.handle('schedule:update',    (_e, id: number, data)     => wrap(() => updateScheduleEntry(id, data)))
  ipcMain.handle('schedule:delete',    (_e, id: number)           => wrap(() => { deleteScheduleEntry(id); return null }))

  // ── Settings ──────────────────────────────────────────────────────────────
  ipcMain.handle('settings:get', (_e, key: string) => wrap(() => getSetting(key)))
  ipcMain.handle('settings:set', (_e, key: string, value: string) => wrap(() => { setSetting(key, value); return null }))

  // ── File dialog ───────────────────────────────────────────────────────────
  ipcMain.handle('dialog:openFile', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window' }
    const result = await dialog.showOpenDialog(win, {
      title: 'Выберите файл',
      properties: ['openFile']
    })
    if (result.canceled || result.filePaths.length === 0) return { success: true, data: null }
    return { success: true, data: result.filePaths[0] }
  })
}
