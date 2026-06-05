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

import { getSupabase, getActiveUserId } from './supabase'

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

// ── SQLite → Supabase type normalization ─────────────────────────────────────
// SQLite stores booleans as integers (0/1). Supabase boolean columns require
// actual JS booleans; Supabase timestamptz requires ISO-8601 strings.

function normalizeBool(v: unknown): boolean | undefined {
  if (v === undefined || v === null) return undefined
  return !!v
}

function normalizeRow(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...row }

  // Boolean columns — convert 0/1 integers to true/false
  const boolCols = [
    'is_deleted', 'is_archived', 'is_active', 'is_done', 'is_folder',
  ]
  for (const col of boolCols) {
    if (col in out) {
      const v = normalizeBool(out[col])
      if (v !== undefined) out[col] = v
    }
  }

  return out
}

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

  const payload = { ...normalizeRow(row), user_id: userId }

  sb.from(table)
    .upsert(payload, { onConflict: 'user_id,id' })
    .then(({ error }) => {
      if (error) {
        console.error(`[sync] pushRow error [${table}]:`, error.message,
          '| code:', error.code, '| details:', error.details, '| hint:', error.hint)
      } else {
        console.log(`[sync] pushRow OK [${table}] id=${row.id}`)
      }
    })
}

/**
 * Mark a row as soft-deleted in Supabase. Fire-and-forget.
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
    .upsert({ id, user_id: userId, is_deleted: true, updated_at: now }, { onConflict: 'user_id,id' })
    .then(({ error }) => {
      if (error) {
        console.error(`[sync] pushDelete error [${table}] id=${id}:`, error.message,
          '| code:', error.code, '| details:', error.details)
      } else {
        console.log(`[sync] pushDelete OK [${table}] id=${id}`)
      }
    })
}

/**
 * Replace the full set of tag associations for a task in Supabase.
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
    if (delErr) {
      console.error('[sync] pushTaskTags delete error:', delErr.message, '| details:', delErr.details)
      return
    }
    if (tagIds.length === 0) return
    const { error } = await sb.from('task_tags').upsert(
      tagIds.map((tagId) => ({
        task_id: taskId, tag_id: tagId,
        user_id: userId,
        created_at: now, updated_at: now,
      })),
      { onConflict: 'user_id,task_id,tag_id' }
    )
    if (error) {
      console.error('[sync] pushTaskTags upsert error:', error.message, '| details:', error.details)
    }
  })()
}

// ── Pull helpers ─────────────────────────────────────────────────────────────

export async function pullAll(
  userId: string,
  since: string | null,
): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  // ── Session check ──
  const activeId = await getActiveUserId()
  if (!activeId) {
    console.error('[sync] pullAll пропущен: нет активной сессии')
    return
  }

  console.log(`[sync] pullAll userId=${userId} since=${since ?? 'full'}`)

  for (const table of SYNC_TABLES) {
    try {
      const base = sb.from(table).select('*').eq('user_id', userId)
      const q    = since ? base.gt('updated_at', since) : base
      const { data, error } = await q
      if (error) {
        console.error(`[sync] pull error [${table}]:`, error.message,
          '| code:', error.code, '| details:', error.details, '| hint:', error.hint)
        continue
      }
      if (!data || data.length === 0) {
        console.log(`[sync] pull [${table}]: 0 строк`)
        continue
      }
      console.log(`[sync] pull [${table}]: ${data.length} строк`)
      for (const row of data) {
        const r = await window.api.sync.upsertRow(table, row)
        if (!r.success) console.error(`[sync] upsertRow error [${table}]:`, r.error)
      }
    } catch (e) {
      console.error(`[sync] pull exception [${table}]:`, e)
    }
  }

  // Pull task_tags on full sync
  if (!since) {
    try {
      const { data, error } = await sb
        .from('task_tags')
        .select('task_id, tag_id')
        .eq('user_id', userId)
      if (error) {
        console.error('[sync] pull task_tags error:', error.message)
      } else if (data && data.length > 0) {
        console.log(`[sync] pull [task_tags]: ${data.length} строк`)
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
      console.error('[sync] pull task_tags exception:', e)
    }
  }
}

// ── Initial upload ───────────────────────────────────────────────────────────

export async function uploadLocalData(userId: string): Promise<void> {
  const sb = getSupabase()
  if (!sb) return

  // ── Session check ──
  const activeId = await getActiveUserId()
  if (!activeId) {
    console.error('[sync] uploadLocalData пропущен: нет активной сессии')
    return
  }

  console.log('[sync] uploadLocalData start, userId=', userId)

  const r = await window.api.sync.getLocalChanges(null)
  if (!r.success) {
    console.error('[sync] uploadLocalData: getLocalChanges failed', r.error)
    return
  }

  for (const [table, rows] of Object.entries(r.data)) {
    if (!rows || (rows as unknown[]).length === 0) continue
    const batch = (rows as Record<string, unknown>[]).map((row) => ({
      ...normalizeRow(row),
      user_id: userId,
    }))
    console.log(`[sync] upload [${table}]: ${batch.length} строк`)
    try {
      const { error } = await sb.from(table).upsert(batch, { onConflict: 'user_id,id' })
      if (error) {
        console.error(`[sync] upload error [${table}]:`, error.message,
          '| code:', error.code, '| details:', error.details, '| hint:', error.hint)
      } else {
        console.log(`[sync] upload OK [${table}]`)
      }
    } catch (e) {
      console.error(`[sync] upload exception [${table}]:`, e)
    }
  }
}

// ── Full sync (push local changes + pull remote changes) ─────────────────────

export async function runSync(
  userId: string,
  lastSyncAt: string | null,
): Promise<string> {
  console.log('[sync] runSync START userId=', userId, 'lastSyncAt=', lastSyncAt)

  // ── Session check ──
  const activeId = await getActiveUserId()
  if (!activeId) {
    console.error('[sync] runSync пропущен: нет активной сессии')
    throw new Error('Нет активной сессии Supabase. Войдите в аккаунт.')
  }

  // 1. Push local changes that happened since lastSyncAt
  const changesR = await window.api.sync.getLocalChanges(lastSyncAt)
  if (changesR.success) {
    const sb = getSupabase()
    if (sb && navigator.onLine) {
      for (const [table, rows] of Object.entries(changesR.data)) {
        if (!rows || (rows as unknown[]).length === 0) continue
        const batch = (rows as Record<string, unknown>[]).map((row) => ({
          ...normalizeRow(row),
          user_id: userId,
        }))
        console.log(`[sync] push [${table}]: ${batch.length} строк`)
        try {
          const { error } = await sb
            .from(table)
            .upsert(batch as Record<string, unknown>[], { onConflict: 'user_id,id' })
          if (error) {
            console.error(`[sync] push error [${table}]:`, error.message,
              '| code:', error.code, '| details:', error.details, '| hint:', error.hint)
          } else {
            console.log(`[sync] push OK [${table}]`)
          }
        } catch (e) {
          console.error(`[sync] push exception [${table}]:`, e)
        }
      }
    } else {
      console.warn('[sync] push пропущен: нет Supabase клиента или нет сети')
    }
  } else {
    console.error('[sync] getLocalChanges failed:', changesR.error)
  }

  // 2. Pull remote changes
  await pullAll(userId, lastSyncAt)

  const now = new Date().toISOString()
  await window.api.settings.set('sync.last_sync_at', now)
  console.log('[sync] runSync DONE, now=', now)
  return now
}
