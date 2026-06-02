import { ipcMain, dialog, BrowserWindow, Notification } from 'electron'
import fs from 'fs'
import path from 'path'
import { getAllSubjects, createSubject, updateSubject, deleteSubject, archiveSubject } from '../db/subjects'
import { getAllSemesters, createSemester, updateSemester, deleteSemester, setActiveSemester } from '../db/semesters'
import { getTasksBySubject, getAllTasksWithDeadline, createTask, updateTask, deleteTask, completeTaskAndSpawnNext } from '../db/tasks'
import {
  getAttachmentsByTask, addAttachment, deleteAttachment, openAttachment,
  addAttachmentMultiple, addFolder,
} from '../db/attachments'
import {
  getSubtasksByTask, createSubtask, updateSubtask, deleteSubtask, reorderSubtasks
} from '../db/subtasks'
import {
  getAllTags, createTag, updateTag, deleteTag, setTaskTags
} from '../db/tags'
import { getSetting, setSetting } from '../db/settings'
import {
  getAllScheduleEntries, createScheduleEntry, updateScheduleEntry, deleteScheduleEntry,
  batchImportScheduleEntries
} from '../db/schedule'
import { fetchTulguGroups, fetchTulguSchedule } from '../tulgu'
import { syncNow, getTulguStatus, restartTulguScheduler } from '../tulguScheduler'
import { createSession, getSessionStats } from '../db/sessions'
import { getGradesBySubject, createGrade, updateGrade, deleteGrade, getSubjectGradeStats, getAllGrades } from '../db/grades'
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
  ipcMain.handle('attachments:getByTask',   (_e, taskId: number)                    => wrap(() => getAttachmentsByTask(taskId)))
  ipcMain.handle('attachments:add',         (_e, taskId: number, filePath: string)  => wrap(() => addAttachment(taskId, filePath)))
  ipcMain.handle('attachments:addMultiple', (_e, taskId: number, paths: string[])   => wrap(() => addAttachmentMultiple(taskId, paths)))
  ipcMain.handle('attachments:addFolder',   (_e, taskId: number, src: string, name: string) => wrap(() => addFolder(taskId, src, name)))
  ipcMain.handle('attachments:delete',      (_e, id: number)                        => wrap(() => { deleteAttachment(id); return null }))
  ipcMain.handle('attachments:open',        (_e, id: number)                        => wrap(() => { openAttachment(id); return null }))

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
  ipcMain.handle('schedule:batchImport', (_e, entries, replace: boolean) =>
    wrap(() => batchImportScheduleEntries(entries, replace)))

  // ── ТулГУ config & sync ───────────────────────────────────────────────────
  ipcMain.handle('tulgu:getConfig', () => wrap(() => ({
    baseUrl:    getSetting('tulgu.baseUrl')    ?? '',
    token:      getSetting('tulgu.token')      ?? '',
    groupId:    getSetting('tulgu.groupId')    ?? '',
    groupName:  getSetting('tulgu.groupName')  ?? '',
    entityType: getSetting('tulgu.entityType') ?? 'group',
    interval:   getSetting('tulgu.interval')   ?? 'manual',
  })))

  ipcMain.handle('tulgu:saveConfig', (_e, data: {
    baseUrl: string; token: string; groupId: string; groupName: string;
    entityType: string; interval: string;
  }) => wrap(() => {
    setSetting('tulgu.baseUrl',    data.baseUrl)
    setSetting('tulgu.token',      data.token)
    setSetting('tulgu.groupId',    data.groupId)
    setSetting('tulgu.groupName',  data.groupName)
    setSetting('tulgu.entityType', data.entityType)
    setSetting('tulgu.interval',   data.interval)
    restartTulguScheduler()
    return null
  }))

  ipcMain.handle('tulgu:getStatus', () => wrap(() => getTulguStatus()))

  ipcMain.handle('tulgu:syncNow', async () => {
    try {
      const result = await syncNow(true)
      return { success: true, data: result }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  // ── ТулГУ API proxy (HTTP fetch runs in main to bypass renderer CORS) ─────
  ipcMain.handle('tulgu:fetchGroups', async (_e, baseUrl: string, token: string, entityType: 'group' | 'teacher') => {
    try {
      const data = await fetchTulguGroups(baseUrl, token, entityType)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

  ipcMain.handle('tulgu:fetchSchedule', async (
    _e,
    baseUrl: string,
    token: string,
    groupId: string,
    entityType: 'group' | 'teacher',
    dateFrom?: string,
    dateTo?: string
  ) => {
    try {
      const data = await fetchTulguSchedule(baseUrl, token, groupId, entityType, dateFrom, dateTo)
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : String(err) }
    }
  })

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
  ipcMain.handle('grades:getAll',        ()                     => wrap(() => getAllGrades()))
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
      title: 'Выберите файлы',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return { success: true, data: null }
    return { success: true, data: result.filePaths }
  })

  ipcMain.handle('dialog:openDirectory', async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win) return { success: false, error: 'No window' }
    const result = await dialog.showOpenDialog(win, {
      title: 'Выберите папку для выгрузки',
      properties: ['openDirectory']
    })
    if (result.canceled || result.filePaths.length === 0) return { success: true, data: null }
    return { success: true, data: result.filePaths[0] }
  })

  ipcMain.handle(
    'attachments:export',
    (
      _e,
      files: Array<{ filepath: string; filename: string }>,
      destDir: string
    ) => {
      try {
        let count = 0
        for (const file of files) {
          if (!fs.existsSync(file.filepath)) continue

          const ext      = path.extname(file.filename)
          const base     = path.basename(file.filename, ext)
          let destName   = file.filename
          let destPath   = path.join(destDir, destName)
          let suffix     = 1

          while (fs.existsSync(destPath)) {
            destName = `${base}_${suffix}${ext}`
            destPath = path.join(destDir, destName)
            suffix++
          }

          fs.copyFileSync(file.filepath, destPath)
          count++
        }
        return { success: true, data: { count, destDir } }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        console.error('[IPC Error] attachments:export', msg)
        return { success: false, error: msg }
      }
    }
  )
}
