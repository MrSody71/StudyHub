/**
 * Web API adapter — implements the full window.api surface using Supabase directly.
 *
 * Conventions:
 *  - Every function returns IpcResult<T> = { success: true; data: T } | { success: false; error: string }
 *  - Supabase returns booleans; the renderer expects 0/1 integers — normalised by norm().
 *  - Settings are stored in localStorage; VITE_* env vars override supabase credentials.
 *  - File attachments use Supabase Storage (bucket: 'attachments').
 *  - TulGU API calls run client-side (no Electron main process).
 */

import { getSupabase, initSupabase } from '@renderer/lib/supabase'
import type {
  Subject, Task, Attachment, Subtask, Tag, ScheduleEntry,
  BatchImportEntry, BatchImportResult, StudySession, SessionStats,
  Grade, SubjectGradeStat, Note, DashboardData, Semester,
  TulguConfig, TulguStatus, TulguSyncResult,
} from '@renderer/types'

// ── Helpers ───────────────────────────────────────────────────────────────────

type IpcResult<T> = { success: true; data: T } | { success: false; error: string }

function ok<T>(data: T): IpcResult<T> { return { success: true, data } }
function err(e: unknown): IpcResult<never> {
  const msg = e instanceof Error ? e.message : String(e)
  return { success: false, error: msg }
}
async function wrap<T>(fn: () => Promise<T>): Promise<IpcResult<T>> {
  try { return ok(await fn()) } catch (e) { return err(e) }
}

/** Columns that Supabase returns as booleans but the renderer expects as 0 | 1. */
const BOOL_COLS = new Set([
  'is_deleted', 'is_archived', 'is_active', 'is_done', 'is_folder',
])

/** Convert boolean columns returned by Supabase to the integer form the renderer uses. */
function norm<T>(r: Record<string, unknown>): T {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(r)) {
    out[k] = BOOL_COLS.has(k) && typeof v === 'boolean' ? (v ? 1 : 0) : v
  }
  return out as T
}

function normAll<T>(rows: Record<string, unknown>[]): T[] {
  return rows.map((r) => norm<T>(r))
}

/** Returns the authenticated user's id, throwing if not signed in. */
function uid(): string {
  const sb = getSupabase()
  if (!sb) throw new Error('Supabase не инициализирован')
  // The session is synchronously available via _client.auth.currentUser in v2
  const user = (sb as unknown as { auth: { currentUser: { id: string } | null } }).auth.currentUser
  if (!user) throw new Error('Не авторизован')
  return user.id
}

/** Pending File objects stored during dialog.openFile() — keyed by fake path. */
const pendingFiles = new Map<string, File>()

// ── Settings (localStorage) ───────────────────────────────────────────────────

const SETTINGS_PREFIX = 'studyhub.settings.'

function settingsGet(key: string): string | null {
  // Allow env vars to override supabase credentials
  if (key === 'supabase_url')      return import.meta.env.VITE_SUPABASE_URL      ?? null
  if (key === 'supabase_anon_key') return import.meta.env.VITE_SUPABASE_ANON_KEY ?? null
  return localStorage.getItem(SETTINGS_PREFIX + key)
}

function settingsSet(key: string, value: string): void {
  localStorage.setItem(SETTINGS_PREFIX + key, value)
}

// ── Subjects ──────────────────────────────────────────────────────────────────

async function subjectsGetAll(filter?: { archived?: boolean; semesterId?: number }): Promise<IpcResult<Subject[]>> {
  return wrap(async () => {
    const sb = getSupabase()!
    const userId = uid()
    let q = sb.from('subjects').select('*').eq('user_id', userId).eq('is_deleted', false)
    if (filter?.archived !== undefined) q = q.eq('is_archived', filter.archived)
    if (filter?.semesterId !== undefined) q = q.eq('semester_id', filter.semesterId)
    const { data, error } = await q.order('name')
    if (error) throw error
    return normAll<Subject>(data as Record<string, unknown>[])
  })
}

async function subjectsCreate(data: { name: string; color: string; description?: string | null; semester_id?: number | null }): Promise<IpcResult<Subject>> {
  return wrap(async () => {
    const userId = uid()
    const { data: row, error } = await getSupabase()!
      .from('subjects')
      .insert({ ...data, user_id: userId })
      .select()
      .single()
    if (error) throw error
    return norm<Subject>(row as Record<string, unknown>)
  })
}

async function subjectsUpdate(id: number, data: Partial<Omit<Subject, 'id' | 'created_at'>>): Promise<IpcResult<Subject>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('subjects')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return norm<Subject>(row as Record<string, unknown>)
  })
}

async function subjectsDelete(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const { error } = await getSupabase()!
      .from('subjects')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return null
  })
}

async function subjectsArchive(id: number, archive: boolean): Promise<IpcResult<Subject>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('subjects')
      .update({ is_archived: archive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return norm<Subject>(row as Record<string, unknown>)
  })
}

// ── Semesters ─────────────────────────────────────────────────────────────────

async function semestersGetAll(): Promise<IpcResult<Semester[]>> {
  return wrap(async () => {
    const userId = uid()
    const { data, error } = await getSupabase()!
      .from('semesters')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('created_at')
    if (error) throw error
    return normAll<Semester>(data as Record<string, unknown>[])
  })
}

async function semestersCreate(data: { name: string; start_date?: string | null; end_date?: string | null }): Promise<IpcResult<Semester>> {
  return wrap(async () => {
    const userId = uid()
    const { data: row, error } = await getSupabase()!
      .from('semesters')
      .insert({ ...data, user_id: userId })
      .select()
      .single()
    if (error) throw error
    return norm<Semester>(row as Record<string, unknown>)
  })
}

async function semestersUpdate(id: number, data: Partial<Omit<Semester, 'id' | 'created_at'>>): Promise<IpcResult<Semester>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('semesters')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return norm<Semester>(row as Record<string, unknown>)
  })
}

async function semestersDelete(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const { error } = await getSupabase()!
      .from('semesters')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return null
  })
}

async function semestersSetActive(id: number | null): Promise<IpcResult<null>> {
  return wrap(async () => {
    const userId = uid()
    const sb = getSupabase()!
    // Clear all active flags for this user
    await sb.from('semesters')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId)
    if (id !== null) {
      await sb.from('semesters')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('id', id)
    }
    return null
  })
}

// ── Tasks ─────────────────────────────────────────────────────────────────────

/** Fetches tasks and joins subtask counts + tags client-side. */
async function buildTasks(rows: Record<string, unknown>[]): Promise<Task[]> {
  if (rows.length === 0) return []
  const sb = getSupabase()!
  const ids = rows.map((r) => r.id as number)

  // Subtask counts
  const { data: subtaskRows } = await sb
    .from('subtasks')
    .select('task_id, is_done')
    .in('task_id', ids)
    .eq('is_deleted', false)

  const subtaskTotal = new Map<number, number>()
  const subtaskDone  = new Map<number, number>()
  for (const s of (subtaskRows ?? []) as { task_id: number; is_done: boolean }[]) {
    subtaskTotal.set(s.task_id, (subtaskTotal.get(s.task_id) ?? 0) + 1)
    if (s.is_done) subtaskDone.set(s.task_id, (subtaskDone.get(s.task_id) ?? 0) + 1)
  }

  // Tags via task_tags join
  const { data: tagRows } = await sb
    .from('task_tags')
    .select('task_id, tags(id, name, color, created_at)')
    .in('task_id', ids)

  const taskTags = new Map<number, Tag[]>()
  for (const r of (tagRows ?? []) as { task_id: number; tags: Tag | null }[]) {
    if (!r.tags) continue
    const arr = taskTags.get(r.task_id) ?? []
    arr.push(r.tags)
    taskTags.set(r.task_id, arr)
  }

  return rows.map((r) => ({
    ...norm<Task>(r),
    subtask_total: subtaskTotal.get(r.id as number) ?? 0,
    subtask_done:  subtaskDone.get(r.id as number)  ?? 0,
    tags:          taskTags.get(r.id as number)     ?? [],
  }))
}

async function tasksGetBySubject(subjectId: number): Promise<IpcResult<Task[]>> {
  return wrap(async () => {
    const { data, error } = await getSupabase()!
      .from('tasks')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('is_deleted', false)
      .order('created_at')
    if (error) throw error
    return buildTasks(data as Record<string, unknown>[])
  })
}

async function tasksGetAllWithDeadline(): Promise<IpcResult<Task[]>> {
  return wrap(async () => {
    const userId = uid()
    const { data, error } = await getSupabase()!
      .from('tasks')
      .select('*, subjects!inner(user_id)')
      .eq('subjects.user_id', userId)
      .eq('is_deleted', false)
      .not('due_date', 'is', null)
      .order('due_date')
    if (error) throw error
    // Strip the joined subjects column before normalising
    const cleaned = (data as Record<string, unknown>[]).map(({ subjects: _s, ...rest }) => rest)
    return buildTasks(cleaned)
  })
}

async function tasksCreate(data: Omit<Task, 'id' | 'created_at' | 'tags' | 'subtask_total' | 'subtask_done'>): Promise<IpcResult<Task>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('tasks')
      .insert(data)
      .select()
      .single()
    if (error) throw error
    const tasks = await buildTasks([row as Record<string, unknown>])
    return tasks[0]
  })
}

async function tasksUpdate(id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id' | 'tags' | 'subtask_total' | 'subtask_done'>>): Promise<IpcResult<Task>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('tasks')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    const tasks = await buildTasks([row as Record<string, unknown>])
    return tasks[0]
  })
}

async function tasksDelete(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const { error } = await getSupabase()!
      .from('tasks')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return null
  })
}

/** Completes a recurring task by marking it done and spawning the next occurrence. */
async function tasksCompleteRecurring(id: number): Promise<IpcResult<{ task: Task; spawned: Task | null }>> {
  return wrap(async () => {
    const sb = getSupabase()!

    const { data: row, error: fetchErr } = await sb.from('tasks').select('*').eq('id', id).single()
    if (fetchErr) throw fetchErr

    const task = row as Record<string, unknown>
    const rule  = task.recurrence_rule as string | null

    // Mark current as done
    const { data: updRow, error: updErr } = await sb
      .from('tasks')
      .update({ status: 'done', updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (updErr) throw updErr

    let spawned: Task | null = null

    if (rule && task.due_date) {
      const nextDate = shiftDate(task.due_date as string, rule)
      if (nextDate) {
        // Copy tags
        const { data: tagLinks } = await sb.from('task_tags').select('tag_id').eq('task_id', id)
        const tagIds = (tagLinks ?? []).map((t: { tag_id: number }) => t.tag_id)

        const { data: spawnRow, error: spawnErr } = await sb
          .from('tasks')
          .insert({
            subject_id:          task.subject_id,
            title:               task.title,
            description:         task.description,
            status:              'not_started',
            priority:            task.priority,
            due_date:            nextDate,
            recurrence_rule:     rule,
            recurrence_parent_id: id,
            updated_at:          new Date().toISOString(),
          })
          .select()
          .single()
        if (spawnErr) throw spawnErr

        if (tagIds.length > 0) {
          await sb.from('task_tags').insert(
            tagIds.map((tag_id: number) => ({ task_id: (spawnRow as { id: number }).id, tag_id }))
          )
        }

        const tasks = await buildTasks([spawnRow as Record<string, unknown>])
        spawned = tasks[0]
      }
    }

    const doneTasks = await buildTasks([updRow as Record<string, unknown>])
    return { task: doneTasks[0], spawned }
  })
}

/** Shifts a YYYY-MM-DD date by a recurrence rule string ('daily','weekly','biweekly','monthly'). */
function shiftDate(dateStr: string, rule: string): string | null {
  const d = new Date(dateStr)
  if (isNaN(d.getTime())) return null
  const r = rule.toLowerCase()
  if (r === 'daily')     d.setDate(d.getDate() + 1)
  else if (r === 'weekly')    d.setDate(d.getDate() + 7)
  else if (r === 'biweekly')  d.setDate(d.getDate() + 14)
  else if (r === 'monthly')   d.setMonth(d.getMonth() + 1)
  else return null
  return d.toISOString().slice(0, 10)
}

// ── Attachments ───────────────────────────────────────────────────────────────

const STORAGE_BUCKET = 'attachments'

async function attachmentsGetByTask(taskId: number): Promise<IpcResult<Attachment[]>> {
  return wrap(async () => {
    const { data, error } = await getSupabase()!
      .from('attachments')
      .select('*')
      .eq('task_id', taskId)
      .eq('is_deleted', false)
      .order('created_at')
    if (error) throw error
    return normAll<Attachment>(data as Record<string, unknown>[])
  })
}

async function attachmentsGetBySubject(subjectId: number): Promise<IpcResult<Attachment[]>> {
  return wrap(async () => {
    const { data, error } = await getSupabase()!
      .from('attachments')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
    if (error) throw error
    return normAll<Attachment>(data as Record<string, unknown>[])
  })
}

/** Not available in the web version — file paths are local paths and don't apply. */
async function attachmentsAdd(_taskId: number, _filePath: string): Promise<IpcResult<Attachment>> {
  return err('Недоступно в веб-версии — используйте кнопку загрузки файла')
}

/**
 * In the web version `paths` are keys previously stored in `pendingFiles` by
 * `dialog.openFile()`. Each key resolves to a real `File` object which is then
 * uploaded to Supabase Storage.
 */
async function attachmentsAddMultiple(
  taskId: number,
  paths: string[]
): Promise<IpcResult<{ added: Attachment[]; skipped: string[] }>> {
  return wrap(async () => {
    const userId = uid()
    const sb = getSupabase()!
    const added: Attachment[] = []
    const skipped: string[] = []

    for (const key of paths) {
      const file = pendingFiles.get(key)
      if (!file) { skipped.push(key); continue }
      pendingFiles.delete(key)

      const storagePath = `${userId}/${taskId}/${crypto.randomUUID()}/${file.name}`

      const { error: uploadErr } = await sb.storage
        .from(STORAGE_BUCKET)
        .upload(storagePath, file, { contentType: file.type, upsert: false })

      if (uploadErr) { skipped.push(file.name); continue }

      const { data: row, error: dbErr } = await sb
        .from('attachments')
        .insert({
          task_id:      taskId,
          filename:     file.name,
          filepath:     storagePath,       // store storage path as filepath too
          size:         file.size,
          mime_type:    file.type || 'application/octet-stream',
          storage_path: storagePath,
          updated_at:   new Date().toISOString(),
        })
        .select()
        .single()

      if (dbErr) {
        // Roll back the uploaded file
        await sb.storage.from(STORAGE_BUCKET).remove([storagePath])
        skipped.push(file.name)
        continue
      }

      added.push(norm<Attachment>(row as Record<string, unknown>))
    }

    return { added, skipped }
  })
}

async function attachmentsAddFolder(
  _taskId: number,
  _src: string,
  _name: string
): Promise<IpcResult<{ folder: Attachment; children: Attachment[] }>> {
  return err('Загрузка папок недоступна в веб-версии')
}

async function attachmentsDelete(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const sb = getSupabase()!
    // Fetch the storage_path first
    const { data: row } = await sb.from('attachments').select('storage_path').eq('id', id).single()
    const storagePath = (row as { storage_path: string | null } | null)?.storage_path

    const { error } = await sb
      .from('attachments')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error

    if (storagePath) {
      await sb.storage.from(STORAGE_BUCKET).remove([storagePath])
    }
    return null
  })
}

/** Opens an attachment by creating a signed URL and navigating to it. */
async function attachmentsOpen(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const sb = getSupabase()!
    const { data: row } = await sb.from('attachments').select('storage_path, filename').eq('id', id).single()
    const r = row as { storage_path: string | null; filename: string } | null
    if (!r?.storage_path) throw new Error('Файл не найден в облаке')

    const { data: signed, error } = await sb.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(r.storage_path, 60 * 60) // 1 hour
    if (error) throw error
    window.open(signed.signedUrl, '_blank', 'noopener,noreferrer')
    return null
  })
}

async function attachmentsExport(
  _files: Array<{ filepath: string; filename: string }>,
  _destDir: string
): Promise<IpcResult<{ count: number; destDir: string }>> {
  return err('Экспорт файлов недоступен в веб-версии')
}

// ── Subtasks ──────────────────────────────────────────────────────────────────

async function subtasksGetByTask(taskId: number): Promise<IpcResult<Subtask[]>> {
  return wrap(async () => {
    const { data, error } = await getSupabase()!
      .from('subtasks')
      .select('*')
      .eq('task_id', taskId)
      .eq('is_deleted', false)
      .order('sort_order')
    if (error) throw error
    return normAll<Subtask>(data as Record<string, unknown>[])
  })
}

async function subtasksCreate(taskId: number, title: string): Promise<IpcResult<Subtask>> {
  return wrap(async () => {
    // Determine next sort_order
    const { count } = await getSupabase()!
      .from('subtasks')
      .select('*', { count: 'exact', head: true })
      .eq('task_id', taskId)
      .eq('is_deleted', false)

    const { data: row, error } = await getSupabase()!
      .from('subtasks')
      .insert({ task_id: taskId, title, sort_order: count ?? 0, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return norm<Subtask>(row as Record<string, unknown>)
  })
}

async function subtasksUpdate(id: number, data: { title?: string; is_done?: boolean }): Promise<IpcResult<Subtask>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('subtasks')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return norm<Subtask>(row as Record<string, unknown>)
  })
}

async function subtasksDelete(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const { error } = await getSupabase()!
      .from('subtasks')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return null
  })
}

async function subtasksReorder(taskId: number, orderedIds: number[]): Promise<IpcResult<null>> {
  return wrap(async () => {
    const sb = getSupabase()!
    await Promise.all(
      orderedIds.map((id, i) =>
        sb.from('subtasks')
          .update({ sort_order: i, updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('task_id', taskId)
      )
    )
    return null
  })
}

// ── Tags ──────────────────────────────────────────────────────────────────────

async function tagsGetAll(): Promise<IpcResult<Tag[]>> {
  return wrap(async () => {
    const userId = uid()
    const { data, error } = await getSupabase()!
      .from('tags')
      .select('*')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('name')
    if (error) throw error
    return data as Tag[]
  })
}

async function tagsCreate(name: string, color: string): Promise<IpcResult<Tag>> {
  return wrap(async () => {
    const userId = uid()
    const { data: row, error } = await getSupabase()!
      .from('tags')
      .insert({ name, color, user_id: userId, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return row as Tag
  })
}

async function tagsUpdate(id: number, data: { name?: string; color?: string }): Promise<IpcResult<Tag>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('tags')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return row as Tag
  })
}

async function tagsDelete(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const { error } = await getSupabase()!
      .from('tags')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return null
  })
}

async function tagsSetTaskTags(taskId: number, tagIds: number[]): Promise<IpcResult<null>> {
  return wrap(async () => {
    const sb = getSupabase()!
    // Delete all existing links for this task
    await sb.from('task_tags').delete().eq('task_id', taskId)
    if (tagIds.length > 0) {
      const { error } = await sb
        .from('task_tags')
        .insert(tagIds.map((tag_id) => ({ task_id: taskId, tag_id })))
      if (error) throw error
    }
    return null
  })
}

// ── Schedule ──────────────────────────────────────────────────────────────────

async function scheduleGetAll(): Promise<IpcResult<ScheduleEntry[]>> {
  return wrap(async () => {
    const userId = uid()
    const { data, error } = await getSupabase()!
      .from('schedule_entries')
      .select('*, subjects!left(user_id)')
      .or(`subject_id.is.null,subjects.user_id.eq.${userId}`)
      .eq('is_deleted', false)
      .order('day_of_week')
      .order('start_time')
    if (error) throw error
    const cleaned = (data as Record<string, unknown>[]).map(({ subjects: _s, ...rest }) => rest)
    return normAll<ScheduleEntry>(cleaned)
  })
}

async function scheduleCreate(data: Omit<ScheduleEntry, 'id' | 'created_at'>): Promise<IpcResult<ScheduleEntry>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('schedule_entries')
      .insert({ ...data, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return norm<ScheduleEntry>(row as Record<string, unknown>)
  })
}

async function scheduleUpdate(id: number, data: Partial<Omit<ScheduleEntry, 'id' | 'created_at'>>): Promise<IpcResult<ScheduleEntry>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('schedule_entries')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return norm<ScheduleEntry>(row as Record<string, unknown>)
  })
}

async function scheduleDelete(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const { error } = await getSupabase()!
      .from('schedule_entries')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return null
  })
}

async function scheduleBatchImport(entries: BatchImportEntry[], replace: boolean): Promise<IpcResult<BatchImportResult>> {
  return wrap(async () => {
    const userId = uid()
    const sb = getSupabase()!

    if (replace) {
      // Soft-delete all schedule entries belonging to this user
      await sb
        .from('schedule_entries')
        .update({ is_deleted: true, updated_at: new Date().toISOString() })
        .eq('user_id', userId)
    }

    // Fetch existing subjects to resolve subject_name → subject_id
    const { data: existingSubjects } = await sb
      .from('subjects')
      .select('id, name')
      .eq('user_id', userId)
      .eq('is_deleted', false)

    const subjectMap = new Map(
      (existingSubjects ?? []).map((s: { id: number; name: string }) => [s.name.toLowerCase().trim(), s.id])
    )

    const rows = entries.map((e) => {
      const subject_id = e.subject_name
        ? (subjectMap.get(e.subject_name.toLowerCase().trim()) ?? null)
        : null
      return {
        user_id:     userId,
        subject_id,
        title:       e.title,
        day_of_week: e.day_of_week,
        start_time:  e.start_time,
        end_time:    e.end_time,
        location:    e.location ?? null,
        teacher:     e.teacher  ?? null,
        entry_date:  e.date     ?? null,
        updated_at:  new Date().toISOString(),
      }
    })

    const { error } = await sb.from('schedule_entries').insert(rows)
    if (error) throw error

    return { created: rows.length, subjectsCreated: 0 } satisfies BatchImportResult
  })
}

// ── Notes ─────────────────────────────────────────────────────────────────────

async function notesGetBySubject(subjectId: number): Promise<IpcResult<Note[]>> {
  return wrap(async () => {
    const { data, error } = await getSupabase()!
      .from('notes')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('is_deleted', false)
      .order('updated_at', { ascending: false })
    if (error) throw error
    return data as Note[]
  })
}

async function notesCreate(subjectId: number, title: string): Promise<IpcResult<Note>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('notes')
      .insert({ subject_id: subjectId, title, content: '', updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return row as Note
  })
}

async function notesUpdate(id: number, data: { title?: string; content?: string }): Promise<IpcResult<Note>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('notes')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return row as Note
  })
}

async function notesDelete(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const { error } = await getSupabase()!
      .from('notes')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return null
  })
}

async function notesSearch(query: string): Promise<IpcResult<Note[]>> {
  return wrap(async () => {
    const userId = uid()
    const { data, error } = await getSupabase()!
      .from('notes')
      .select('*, subjects!inner(user_id)')
      .eq('subjects.user_id', userId)
      .eq('is_deleted', false)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .order('updated_at', { ascending: false })
    if (error) throw error
    const cleaned = (data as Record<string, unknown>[]).map(({ subjects: _s, ...rest }) => rest)
    return cleaned as Note[]
  })
}

// ── Grades ────────────────────────────────────────────────────────────────────

async function gradesGetBySubject(subjectId: number): Promise<IpcResult<Grade[]>> {
  return wrap(async () => {
    const { data, error } = await getSupabase()!
      .from('grades')
      .select('*')
      .eq('subject_id', subjectId)
      .eq('is_deleted', false)
      .order('date', { ascending: false })
    if (error) throw error
    return data as Grade[]
  })
}

async function gradesGetAll(): Promise<IpcResult<Grade[]>> {
  return wrap(async () => {
    const userId = uid()
    const { data, error } = await getSupabase()!
      .from('grades')
      .select('*, subjects!inner(user_id)')
      .eq('subjects.user_id', userId)
      .eq('is_deleted', false)
      .order('date', { ascending: false })
    if (error) throw error
    const cleaned = (data as Record<string, unknown>[]).map(({ subjects: _s, ...rest }) => rest)
    return cleaned as Grade[]
  })
}

async function gradesCreate(data: Omit<Grade, 'id' | 'created_at'>): Promise<IpcResult<Grade>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('grades')
      .insert({ ...data, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return row as Grade
  })
}

async function gradesUpdate(id: number, data: Partial<Omit<Grade, 'id' | 'created_at' | 'subject_id'>>): Promise<IpcResult<Grade>> {
  return wrap(async () => {
    const { data: row, error } = await getSupabase()!
      .from('grades')
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()
    if (error) throw error
    return row as Grade
  })
}

async function gradesDelete(id: number): Promise<IpcResult<null>> {
  return wrap(async () => {
    const { error } = await getSupabase()!
      .from('grades')
      .update({ is_deleted: true, updated_at: new Date().toISOString() })
      .eq('id', id)
    if (error) throw error
    return null
  })
}

async function gradesGetSubjectStats(): Promise<IpcResult<SubjectGradeStat[]>> {
  return wrap(async () => {
    const userId = uid()
    const { data, error } = await getSupabase()!
      .from('grades')
      .select('subject_id, value, max_value, weight, subjects!inner(name, color, user_id)')
      .eq('subjects.user_id', userId)
      .eq('is_deleted', false)
    if (error) throw error

    // Client-side aggregation
    const map = new Map<number, {
      subject_id: number; subject_name: string; subject_color: string
      totalWeightedRatio: number; totalWeight: number; count: number
    }>()

    for (const r of (data ?? []) as Array<{
      subject_id: number; value: number; max_value: number; weight: number
      subjects: { name: string; color: string }
    }>) {
      const entry = map.get(r.subject_id) ?? {
        subject_id:    r.subject_id,
        subject_name:  r.subjects.name,
        subject_color: r.subjects.color,
        totalWeightedRatio: 0, totalWeight: 0, count: 0,
      }
      const ratio = r.max_value > 0 ? r.value / r.max_value : 0
      entry.totalWeightedRatio += ratio * r.weight
      entry.totalWeight        += r.weight
      entry.count++
      map.set(r.subject_id, entry)
    }

    return Array.from(map.values()).map((e) => ({
      subject_id:    e.subject_id,
      subject_name:  e.subject_name,
      subject_color: e.subject_color,
      weighted_avg:  e.totalWeight > 0 ? e.totalWeightedRatio / e.totalWeight : 0,
      grade_count:   e.count,
    })) satisfies SubjectGradeStat[]
  })
}

// ── Sessions ──────────────────────────────────────────────────────────────────

async function sessionsCreate(data: Omit<StudySession, 'id' | 'created_at'>): Promise<IpcResult<StudySession>> {
  return wrap(async () => {
    const userId = uid()
    const { data: row, error } = await getSupabase()!
      .from('study_sessions')
      .insert({ ...data, user_id: userId, updated_at: new Date().toISOString() })
      .select()
      .single()
    if (error) throw error
    return row as StudySession
  })
}

async function sessionsGetStats(): Promise<IpcResult<SessionStats>> {
  return wrap(async () => {
    const userId = uid()
    const { data, error } = await getSupabase()!
      .from('study_sessions')
      .select('*, subjects(name, color)')
      .eq('user_id', userId)
      .eq('is_deleted', false)
      .order('started_at', { ascending: false })
    if (error) throw error

    const sessions = (data ?? []) as Array<StudySession & { subjects: { name: string; color: string } | null }>

    // Aggregate by subject
    const subMap = new Map<number, { subject_id: number; subject_name: string; subject_color: string; total_seconds: number; session_count: number }>()
    // Aggregate by day
    const dayMap = new Map<string, { date: string; total_seconds: number; session_count: number }>()
    let todaySeconds  = 0
    let totalSeconds  = 0
    const todayStr    = new Date().toISOString().slice(0, 10)

    for (const s of sessions) {
      const dur  = s.duration_seconds
      const day  = s.started_at.slice(0, 10)
      totalSeconds += dur
      if (day === todayStr) todaySeconds += dur

      if (s.subject_id) {
        const e = subMap.get(s.subject_id) ?? {
          subject_id:    s.subject_id,
          subject_name:  s.subjects?.name  ?? '',
          subject_color: s.subjects?.color ?? '#6366f1',
          total_seconds: 0, session_count: 0,
        }
        e.total_seconds  += dur
        e.session_count++
        subMap.set(s.subject_id, e)
      }

      const de = dayMap.get(day) ?? { date: day, total_seconds: 0, session_count: 0 }
      de.total_seconds  += dur
      de.session_count++
      dayMap.set(day, de)
    }

    return {
      bySubject:     Array.from(subMap.values()).sort((a, b) => b.total_seconds - a.total_seconds),
      byDay:         Array.from(dayMap.values()).sort((a, b) => a.date.localeCompare(b.date)),
      todaySeconds,
      totalSeconds,
      totalSessions: sessions.length,
    } satisfies SessionStats
  })
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

async function dashboardGetData(semesterId?: number | null): Promise<IpcResult<DashboardData>> {
  return wrap(async () => {
    const userId = uid()
    const sb = getSupabase()!

    // Fetch tasks and subjects in parallel
    let subjectQ = sb.from('subjects').select('id, name, color, semester_id').eq('user_id', userId).eq('is_deleted', false).eq('is_archived', false)
    if (semesterId) subjectQ = subjectQ.eq('semester_id', semesterId)

    const [
      { data: subjectData },
      { data: taskData },
      { data: sessionData },
      { data: gradeData },
    ] = await Promise.all([
      subjectQ,
      sb.from('tasks')
        .select('id, subject_id, status, due_date, priority, title, subjects!inner(user_id, name, color)')
        .eq('subjects.user_id', userId)
        .eq('is_deleted', false),
      sb.from('study_sessions')
        .select('subject_id, duration_seconds, started_at')
        .eq('user_id', userId)
        .eq('is_deleted', false)
        .gte('started_at', new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString()),
      sb.from('grades')
        .select('subject_id, value, max_value, weight')
        .eq('is_deleted', false),
    ])

    const subjects = (subjectData ?? []) as Array<{ id: number; name: string; color: string; semester_id: number | null }>
    const subjectIds = new Set(subjects.map((s) => s.id))

    const tasks = ((taskData ?? []) as Array<{
      id: number; subject_id: number; status: string; due_date: string | null
      priority: string; title: string
      subjects: { name: string; color: string }
    }>).filter((t) => subjectIds.has(t.subject_id))

    const now = new Date()

    // Task stats
    let total = 0, done = 0, inProgress = 0, notStarted = 0, overdue = 0
    for (const t of tasks) {
      total++
      if (t.status === 'done')          done++
      else if (t.status === 'in_progress') inProgress++
      else                               notStarted++
      if (t.status !== 'done' && t.due_date && new Date(t.due_date) < now) overdue++
    }

    // Subject progress
    const progressMap = new Map<number, { total: number; done: number }>()
    for (const t of tasks) {
      const e = progressMap.get(t.subject_id) ?? { total: 0, done: 0 }
      e.total++
      if (t.status === 'done') e.done++
      progressMap.set(t.subject_id, e)
    }
    const subjectProgress = subjects.map((s) => {
      const p = progressMap.get(s.id) ?? { total: 0, done: 0 }
      return {
        subject_id:    s.id,
        subject_name:  s.name,
        subject_color: s.color,
        total:         p.total,
        done:          p.done,
        pct:           p.total > 0 ? Math.round((p.done / p.total) * 100) : 0,
      }
    })

    // Upcoming deadlines (next 14 days, not done)
    const in14 = new Date(Date.now() + 14 * 24 * 3600 * 1000)
    const upcomingDeadlines = tasks
      .filter((t) => t.status !== 'done' && t.due_date && new Date(t.due_date) <= in14)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
      .slice(0, 10)
      .map((t) => ({
        id:            t.id,
        subject_id:    t.subject_id,
        title:         t.title,
        due_date:      t.due_date!,
        priority:      t.priority,
        status:        t.status,
        subject_name:  t.subjects.name,
        subject_color: t.subjects.color,
      }))

    // Week study seconds
    const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString()
    const sessions = (sessionData ?? []) as Array<{ subject_id: number | null; duration_seconds: number; started_at: string }>
    const weekStudySeconds = sessions
      .filter((s) => s.started_at >= weekAgo)
      .reduce((acc, s) => acc + s.duration_seconds, 0)

    // Activity by day (last 30 days)
    const activityMap = new Map<string, number>()
    for (const s of sessions) {
      const day = s.started_at.slice(0, 10)
      activityMap.set(day, (activityMap.get(day) ?? 0) + s.duration_seconds)
    }
    const activityByDay = Array.from(activityMap.entries())
      .map(([date, total_seconds]) => ({ date, total_seconds }))
      .sort((a, b) => a.date.localeCompare(b.date))

    // Streak (consecutive days with any study session)
    const daySet = new Set(sessions.map((s) => s.started_at.slice(0, 10)))
    let streak = 0
    const d = new Date()
    while (daySet.has(d.toISOString().slice(0, 10))) {
      streak++
      d.setDate(d.getDate() - 1)
    }

    // Overall GPA
    const grades = ((gradeData ?? []) as Array<{ subject_id: number; value: number; max_value: number; weight: number }>)
      .filter((g) => subjectIds.has(g.subject_id))
    let totalWeighted = 0, totalWeight = 0
    for (const g of grades) {
      if (g.max_value > 0) {
        totalWeighted += (g.value / g.max_value) * g.weight
        totalWeight   += g.weight
      }
    }
    const overallGpa = totalWeight > 0 ? totalWeighted / totalWeight : null

    return {
      taskStats: { total, done, inProgress, notStarted, overdue },
      subjectProgress,
      upcomingDeadlines,
      weekStudySeconds,
      activityByDay,
      overallGpa,
      streak,
    } satisfies DashboardData
  })
}

// ── Notifications ─────────────────────────────────────────────────────────────

async function notificationsShow(title: string, body: string): Promise<IpcResult<null>> {
  return wrap(async () => {
    if (!('Notification' in window)) return null
    if (Notification.permission === 'granted') {
      new Notification(title, { body })
    } else if (Notification.permission !== 'denied') {
      const perm = await Notification.requestPermission()
      if (perm === 'granted') new Notification(title, { body })
    }
    return null
  })
}

// ── Dialog ────────────────────────────────────────────────────────────────────

/**
 * Opens a hidden <input type="file"> and stores selected File objects in
 * `pendingFiles` map.  Returns fake keys that attachmentsAddMultiple() uses
 * to look up the real File objects.
 */
function dialogOpenFile(): Promise<IpcResult<string[] | null>> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.multiple = true
    input.style.display = 'none'
    document.body.appendChild(input)

    input.onchange = () => {
      const files = Array.from(input.files ?? [])
      document.body.removeChild(input)

      if (files.length === 0) { resolve(ok(null)); return }

      const keys = files.map((file) => {
        const key = `web-file://${crypto.randomUUID()}/${file.name}`
        pendingFiles.set(key, file)
        return key
      })
      resolve(ok(keys))
    }

    input.oncancel = () => { document.body.removeChild(input); resolve(ok(null)) }
    input.click()
  })
}

async function dialogOpenDirectory(): Promise<IpcResult<string | null>> {
  return ok(null) // Not supported in browsers
}

// ── TulGU ─────────────────────────────────────────────────────────────────────
// The fetchTulsuSchedule function makes cross-origin requests to tulsu.ru.
// In the browser this will fail due to CORS unless the server allows it.
// We attempt a direct fetch; on CORS failure we try corsproxy.io.

async function tulguFetchTulsuSchedule(groupNumber: string): Promise<IpcResult<BatchImportEntry[]>> {
  return wrap(async () => {
    const { fetchTulsuSchedule } = await import('@main/tulgu')
    return fetchTulsuSchedule(groupNumber)
  })
}

async function tulguFetchGroups(baseUrl: string, token: string, entityType: 'group' | 'teacher'): Promise<IpcResult<{ id: string; name: string }[]>> {
  return wrap(async () => {
    const { fetchTulguGroups } = await import('@main/tulgu')
    return fetchTulguGroups(baseUrl, token, entityType)
  })
}

async function tulguFetchSchedule(
  baseUrl: string,
  token: string,
  groupId: string,
  entityType: 'group' | 'teacher',
  dateFrom?: string,
  dateTo?: string
): Promise<IpcResult<BatchImportEntry[]>> {
  return wrap(async () => {
    const { fetchTulguSchedule } = await import('@main/tulgu')
    return fetchTulguSchedule(baseUrl, token, groupId, entityType, dateFrom, dateTo)
  })
}

const tulguStubStatus: TulguStatus = {
  isSyncing: false, lastUpdated: null, lastError: null, lastErrorAt: null,
}

// ── Updater stubs ─────────────────────────────────────────────────────────────

function updaterStub() { return Promise.resolve(ok(null)) }

// ── Sync stubs (no-ops in web version — Supabase is the source of truth) ──────

function syncUpsertRow(_table: string, _row: unknown) { return Promise.resolve(ok(null)) }
function syncGetLocalChanges(_since: string | null) {
  return Promise.resolve(ok({} as Record<string, unknown[]>))
}
function syncReplaceTaskTags(_taskId: number, _tagIds: number[]) {
  return Promise.resolve(ok(null))
}

// ── Build the full window.api object ─────────────────────────────────────────

export function buildWebApi(): Window['api'] {
  // Eagerly initialise Supabase from env vars if available — App.tsx will also
  // call initSupabase via initAuth(), but doing it here ensures any early API
  // call (before auth check completes) still has a client.
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined
  const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
  if (supabaseUrl && supabaseKey) initSupabase(supabaseUrl, supabaseKey)

  return {
    subjects: {
      getAll:   subjectsGetAll,
      create:   subjectsCreate,
      update:   subjectsUpdate,
      delete:   subjectsDelete,
      archive:  subjectsArchive,
    },
    semesters: {
      getAll:    semestersGetAll,
      create:    semestersCreate,
      update:    semestersUpdate,
      delete:    semestersDelete,
      setActive: semestersSetActive,
    },
    tasks: {
      getBySubject:      tasksGetBySubject,
      getAllWithDeadline: tasksGetAllWithDeadline,
      create:            tasksCreate,
      update:            tasksUpdate,
      delete:            tasksDelete,
      completeRecurring: tasksCompleteRecurring,
    },
    attachments: {
      getByTask:    attachmentsGetByTask,
      getBySubject: attachmentsGetBySubject,
      add:         attachmentsAdd,
      addMultiple: attachmentsAddMultiple,
      addFolder:   attachmentsAddFolder,
      delete:      attachmentsDelete,
      open:        attachmentsOpen,
      export:      attachmentsExport,
    },
    subtasks: {
      getByTask: subtasksGetByTask,
      create:    subtasksCreate,
      update:    subtasksUpdate,
      delete:    subtasksDelete,
      reorder:   subtasksReorder,
    },
    tags: {
      getAll:      tagsGetAll,
      create:      tagsCreate,
      update:      tagsUpdate,
      delete:      tagsDelete,
      setTaskTags: tagsSetTaskTags,
    },
    schedule: {
      getAll:      scheduleGetAll,
      create:      scheduleCreate,
      update:      scheduleUpdate,
      delete:      scheduleDelete,
      batchImport: scheduleBatchImport,
    },
    notes: {
      getBySubject: notesGetBySubject,
      create:       notesCreate,
      update:       notesUpdate,
      delete:       notesDelete,
      search:       notesSearch,
    },
    grades: {
      getBySubject:    gradesGetBySubject,
      getAll:          gradesGetAll,
      create:          gradesCreate,
      update:          gradesUpdate,
      delete:          gradesDelete,
      getSubjectStats: gradesGetSubjectStats,
    },
    sessions: {
      create:   sessionsCreate,
      getStats: sessionsGetStats,
    },
    dashboard: {
      getData: dashboardGetData,
    },
    notifications: {
      show: notificationsShow,
    },
    settings: {
      get: (key) => Promise.resolve(ok(settingsGet(key))),
      set: (key, value) => { settingsSet(key, value); return Promise.resolve(ok(null)) },
    },
    sync: {
      upsertRow:       syncUpsertRow,
      getLocalChanges: syncGetLocalChanges,
      replaceTaskTags: syncReplaceTaskTags,
    },
    dialog: {
      openFile:      dialogOpenFile,
      openDirectory: dialogOpenDirectory,
    },
    moodle: {
      login:       (_u, _p) => Promise.resolve(err('Синхронизация с Moodle доступна только в десктоп-версии')),
      logout:      ()       => Promise.resolve(ok(null)),
      getStatus:   ()       => Promise.resolve(ok<import('@renderer/types').MoodleStatus>({ isLoggedIn: false, userId: null, fullname: null, lastSyncAt: null, lastError: null })),
      getCourses:  ()       => Promise.resolve(err('Недоступно в веб-версии')),
      mapCourse:   ()       => Promise.resolve(ok(null)),
      unmapCourse: ()       => Promise.resolve(ok(null)),
      syncAll:     ()       => Promise.resolve(err('Синхронизация с Moodle доступна только в десктоп-версии')),
      onSyncProgress:     (_cb) => { /* no-op */ },
      removeAllListeners: (_ch) => { /* no-op */ },
    },
    tulgu: {
      fetchTulsuSchedule: tulguFetchTulsuSchedule,
      getConfig:          () => Promise.resolve(ok<TulguConfig>({ groupNumber: '', interval: 'manual' })),
      saveConfig:         (_) => Promise.resolve(ok(null)),
      getStatus:          () => Promise.resolve(ok(tulguStubStatus)),
      syncNow:            () => Promise.resolve(ok<TulguSyncResult>({ changed: false, diff: { added: [], removed: [], moved: [] } })),
      onStatusChanged:    (_cb) => { /* no-op */ },
      onScheduleUpdated:  (_cb) => { /* no-op */ },
      removeAllListeners: (_ch) => { /* no-op */ },
      fetchGroups:        tulguFetchGroups,
      fetchSchedule:      tulguFetchSchedule,
    },
    updater: {
      checkForUpdates:      updaterStub,
      downloadUpdate:       updaterStub,
      quitAndInstall:       updaterStub,
      getVersion:           () => Promise.resolve(ok('web')),
      onUpdateAvailable:    (_cb) => { /* no-op */ },
      onUpdateNotAvailable: (cb)  => { setTimeout(cb, 0) }, // immediately signal "no update"
      onDownloadProgress:   (_cb) => { /* no-op */ },
      onUpdateDownloaded:   (_cb) => { /* no-op */ },
      onError:              (_cb) => { /* no-op */ },
      removeAllListeners:   (_ch) => { /* no-op */ },
    },
  }
}
