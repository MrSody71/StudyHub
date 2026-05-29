import { ipcMain, dialog, BrowserWindow, Notification } from 'electron'
import { getAllSubjects, createSubject, updateSubject, deleteSubject, archiveSubject } from '../db/subjects'
import { getAllSemesters, createSemester, updateSemester, deleteSemester, setActiveSemester } from '../db/semesters'
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
import { createSession, getSessionStats } from '../db/sessions'
import { getGradesBySubject, createGrade, updateGrade, deleteGrade, getSubjectGradeStats } from '../db/grades'
import { getNotesBySubject, createNote, updateNote, deleteNote, searchNotes } from '../db/notes'
import { getDashboardData } from '../db/dashboard'

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
  ipcMain.handle('subjects:getAll',    (_e, filter?)             => wrap(() => getAllSubjects(filter)))
  ipcMain.handle('subjects:create',    (_e, data)                => wrap(() => createSubject(data)))
  ipcMain.handle('subjects:update',    (_e, id: number, data)    => wrap(() => updateSubject(id, data)))
  ipcMain.handle('subjects:delete',    (_e, id: number)          => wrap(() => { deleteSubject(id); return null }))
  ipcMain.handle('subjects:archive',   (_e, id: number, archive: boolean) => wrap(() => archiveSubject(id, archive)))

  // ── Semesters ─────────────────────────────────────────────────────────────
  ipcMain.handle('semesters:getAll',    ()                          => wrap(() => getAllSemesters()))
  ipcMain.handle('semesters:create',    (_e, data)                 => wrap(() => createSemester(data)))
  ipcMain.handle('semesters:update',    (_e, id: number, data)     => wrap(() => updateSemester(id, data)))
  ipcMain.handle('semesters:delete',    (_e, id: number)           => wrap(() => { deleteSemester(id); return null }))
  ipcMain.handle('semesters:setActive', (_e, id: number | null)    => wrap(() => { setActiveSemester(id); return null }))

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

  // ── Dashboard ────────────────────────────────────────────────────────────
  ipcMain.handle('dashboard:getData', (_e, semesterId?: number | null) => wrap(() => getDashboardData(semesterId)))

  // ── Notes ────────────────────────────────────────────────────────────────
  ipcMain.handle('notes:getBySubject', (_e, subjectId: number) => wrap(() => getNotesBySubject(subjectId)))
  ipcMain.handle('notes:create',       (_e, subjectId: number, title: string) => wrap(() => createNote(subjectId, title)))
  ipcMain.handle('notes:update',       (_e, id: number, data) => wrap(() => updateNote(id, data)))
  ipcMain.handle('notes:delete',       (_e, id: number) => wrap(() => { deleteNote(id); return null }))
  ipcMain.handle('notes:search',       (_e, query: string) => wrap(() => searchNotes(query)))

  // ── Grades ────────────────────────────────────────────────────────────────
  ipcMain.handle('grades:getBySubject',  (_e, subjectId: number) => wrap(() => getGradesBySubject(subjectId)))
  ipcMain.handle('grades:create',        (_e, data)             => wrap(() => createGrade(data)))
  ipcMain.handle('grades:update',        (_e, id: number, data) => wrap(() => updateGrade(id, data)))
  ipcMain.handle('grades:delete',        (_e, id: number)       => wrap(() => { deleteGrade(id); return null }))
  ipcMain.handle('grades:getSubjectStats', ()                   => wrap(() => getSubjectGradeStats()))

  // ── Study sessions ────────────────────────────────────────────────────────
  ipcMain.handle('sessions:create', (_e, data) => wrap(() => createSession(data)))
  ipcMain.handle('sessions:getStats', ()       => wrap(() => getSessionStats()))

  // ── Notifications ─────────────────────────────────────────────────────────
  ipcMain.handle('notifications:show', (_e, title: string, body: string) => {
    try {
      if (Notification.isSupported()) {
        new Notification({ title, body }).show()
      }
      return { success: true, data: null }
    } catch (err) {
      return { success: false, error: String(err) }
    }
  })

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
