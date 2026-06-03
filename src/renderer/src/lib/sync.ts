/**
 * Renderer-side sync engine.
 *
 * Push: after every local mutation the App calls pushRow / pushDelete /
 *   pushTaskTags to replicate the change to Supabase immediately (fire-and-forget).
 *
 * Pull: on startup (or on manual sync) pullAll fetches every table from Supabase
 *   for rows newer than lastSyncAt and applies them locally via IPC.
 *
 * Initial upload: uploadLocalData pushes everything that exists locally to
 *   Supabase — used when a user logs in after having worked locally.
 */

import { getSupabase } from './supabase'

export type SyncStatus = 'idle' | 'syncing' | 'error'

// Tables pulled/pushed in order (dependency order: semesters before subjects, etc.)
const SYNC_TABLES = [
  'semesters',
  'subjects',
  'tasks',
  'subtasks',
  'tags',
  'attachments',
  'grades',
  'notes',
  'study_sessions',
  'schedule_entries',
] as const

type SyncTable = typeof SYNC_TABLES[number]

// ── Push helpers ─────────────────────────────────────────────────────────────

/**
 * Upsert a single row to Supabase. Fire-and-forget — logs but never throws.
 * `row` must already have all local fields; user_id is added here.
 */
export function pushRow(
  table: SyncTable,
  row: Record<string, unknown>,
  userId: string
): void {
  const sb = getSupabase()
  if (!sb || !navigator.onLine) return
  sb.from(table)
    .upsert({ ...row, user_id: userId }, { onConflict: 'id' })
    .then(({ error }) => {
      if (error) console.warn('[sync] push error', table, error.message)
    })
}

/**
 * Mark a row as soft-deleted in Supabase. Fire-and-forget.
 * The local DB has already done the soft-delete; we replicate it.
 */
export function pushDelete(
  table: SyncTable,
  id: number,
  userId: string
): void {
  const sb = getSupabase()
  if (!sb || !navigator.onLine) return
  const now = new Date().toISOString()
  sb.from(table)
    .upsert({ id, user_id: userId, is_deleted: true, updated_at: now }, { onConflict: 'id' })
    .then(({ error }) => {
      if (error) console.warn('[sync] push delete error', table, id, error.message)
    })
}

/**
 * Replace the full set of tag associations for a task in Supabase.
 * Called after setTaskTags — mirrors the local delete-all-then-reinsert pattern.
 */
export function pushTaskTags(
  taskId: number,
  tagIds: number[],
  userId: string
): void {
  const sb = getSupabase()
  if (!sb || !navigator.onLine) return
  const now = new Date().toISOString()
  void (async () => {
    const { error: delErr } = await sb
      .from('task_tags')
      .delete()
      .eq('task_id', taskId)
      .eq('user_id', userId)
    if (delErr) { console.warn('[sync] push task_tags delete error', delErr.message); return }
    if (tagIds.length === 0) return
    const { error } = await sb.from('task_tags').upsert(
      tagIds.map((tagId) => ({
        task_id: taskId, tag_id: tagId,
        user_id: userId,
        created_at: now, updated_at: now,
      })),
      { onConflict: 'task_id,tag_id' }
    )
    if (error) console.warn('[sync] push task_tags error', error.message)
  })()
}

// ── Pull helpers ─────────────────────────────────────────────────────────────

/**
 * Pull all rows from Supabase that changed after `since`.
 * Applies each row locally (conflict resolution is done in main process).
 * Also pulls task_tags when since is null (full initial sync).
 */
export async function pullAll(
  userId: string,
  since: string | null,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  for (const table of SYNC_TABLES) {
    try {
      const base = sb.from(table).select('*').eq('user_id', userId)
      const q    = since ? base.gt('updated_at', since) : base
      const { data, error } = await q
      if (error) { console.warn('[sync] pull error', table, error.message); continue }
      if (!data || data.length === 0) continue

      for (const row of data) {
        const r = await window.api.sync.upsertRow(table, row)
        if (!r.success) console.warn('[sync] upsert error', table, r.error)
      }
    } catch (e) {
      console.warn('[sync] pull exception', table, e)
    }
  }

  // Pull task_tags: on full sync (no since) replace all; on incremental skip
  // (we push task_tags immediately on setTaskTags, so they stay in sync)
  if (!since) {
    try {
      const { data, error } = await sb
        .from('task_tags')
        .select('task_id, tag_id')
        .eq('user_id', userId)
      if (!error && data && data.length > 0) {
        // Group by task_id and replace locally
        const byTask = new Map<number, number[]>()
        for (const { task_id, tag_id } of data as { task_id: number; tag_id: number }[]) {
          if (!byTask.has(task_id)) byTask.set(task_id, [])
          byTask.get(task_id)!.push(tag_id)
        }
        for (const [taskId, tagIds] of byTask) {
          await window.api.sync.replaceTaskTags(taskId, tagIds)
        }
      }
    } catch (e) {
      console.warn('[sync] pull task_tags exception', e)
    }
  }
}

// ── Initial upload ───────────────────────────────────────────────────────────

/**
 * Push ALL local data to Supabase (used when user logs in after working locally).
 * Fetches every record from local DB and upserts it.
 */
export async function uploadLocalData(userId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  const r = await window.api.sync.getLocalChanges(null)
  if (!r.success) {
    console.warn('[sync] uploadLocalData: getLocalChanges failed', r.error)
    return
  }

  for (const [table, rows] of Object.entries(r.data)) {
    if (!rows || (rows as unknown[]).length === 0) continue
    const batch = (rows as Record<string, unknown>[]).map((row) => ({
      ...row,
      user_id:    userId,
      // Convert SQLite integers to booleans for Supabase
      is_deleted: !!row.is_deleted,
      is_archived: row.is_archived !== undefined ? !!row.is_archived : undefined,
      is_active:  row.is_active   !== undefined ? !!row.is_active   : undefined,
      is_done:    row.is_done     !== undefined ? !!row.is_done     : undefined,
      is_folder:  row.is_folder   !== undefined ? !!row.is_folder   : undefined,
    }))
    try {
      const { error } = await sb.from(table).upsert(batch, { onConflict: 'id' })
      if (error) console.warn('[sync] upload error', table, error.message)
    } catch (e) {
      console.warn('[sync] upload exception', table, e)
    }
  }

  // Push task_tags (no id column, different handling)
  // task_tags are uploaded implicitly via subject/task relationship —
  // the user can retag after sync if needed.
}

// ── Full sync (push local changes + pull remote changes) ─────────────────────

export async function runSync(
  userId: string,
  lastSyncAt: string | null,
): Promise<string> {
  // 1. Push local changes that happened since lastSyncAt
  const changesR = await window.api.sync.getLocalChanges(lastSyncAt)
  if (changesR.success) {
    const sb = getSupabase()
    if (sb && navigator.onLine) {
      for (const [table, rows] of Object.entries(changesR.data)) {
        if (!rows || (rows as unknown[]).length === 0) continue
        const batch = (rows as Record<string, unknown>[]).map((row) => ({
          ...row,
          user_id:     userId,
          is_deleted:  !!row.is_deleted,
          is_archived: row.is_archived !== undefined ? !!row.is_archived : undefined,
          is_active:   row.is_active   !== undefined ? !!row.is_active   : undefined,
          is_done:     row.is_done     !== undefined ? !!row.is_done     : undefined,
          is_folder:   row.is_folder   !== undefined ? !!row.is_folder   : undefined,
        })).filter(r => r !== undefined)
        try {
          await sb.from(table).upsert(batch as Record<string, unknown>[], { onConflict: 'id' })
        } catch { /* non-fatal */ }
      }
    }
  }

  // 2. Pull remote changes
  await pullAll(userId, lastSyncAt)

  const now = new Date().toISOString()
  await window.api.settings.set('sync.last_sync_at', now)
  return now
}
