/**
 * Main-process sync helpers.
 *
 * upsertRowFromRemote — applies one row pulled from Supabase into local SQLite.
 *   - Table name is validated against a whitelist to prevent SQL injection.
 *   - Booleans and bigints from Supabase are converted to SQLite-compatible types.
 *   - The user_id UUID column is stripped (not present in local schema).
 *   - Conflict resolution: local row wins if its updated_at >= remote updated_at.
 *   - study_sessions are INSERT-only (never overwrite an existing session row).
 *
 * getLocalChangesSince — returns all rows from every sync table whose updated_at
 *   is newer than the given ISO timestamp (or all rows if since is null/empty).
 *   Used to push local-only changes to Supabase on initial upload or manual sync.
 */

import { getDb } from './database'

type Row = Record<string, unknown>

// Tables that participate in sync.
// IMPORTANT: only table names listed here can be passed to upsertRowFromRemote /
// getLocalChangesSince. Any other name will be rejected with an error.
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
const SYNC_TABLE_SET = new Set<string>(SYNC_TABLES)

// Sessions are append-only — never update an existing row pulled from remote.
const IMMUTABLE_TABLES = new Set<string>(['study_sessions'])

function assertSyncTable(table: string): asserts table is SyncTable {
  if (!SYNC_TABLE_SET.has(table)) {
    throw new Error(`Sync not allowed for table: "${table}"`)
  }
}

/** Normalise a value coming from Supabase to a SQLite-compatible scalar. */
function normalise(key: string, value: unknown): unknown {
  if (value === null || value === undefined) return null
  if (typeof value === 'boolean') return value ? 1 : 0
  if (typeof value === 'bigint')  return Number(value)
  // Normalise all timestamp columns to canonical ISO-8601 UTC so SQLite string
  // comparison works correctly when resolving sync conflicts.
  if (typeof value === 'string' && (
    key === 'updated_at' || key === 'created_at' ||
    key === 'started_at' || key === 'ended_at'
  )) {
    const d = new Date(value)
    return isNaN(d.getTime()) ? value : d.toISOString()
  }
  return value
}

export function upsertRowFromRemote(table: string, row: Row): void {
  assertSyncTable(table)
  const db = getDb()

  const id = row['id']
  if (id === undefined || id === null) return

  // Strip Supabase-only columns and normalise types
  const clean: Row = {}
  for (const [k, v] of Object.entries(row)) {
    if (k === 'user_id') continue   // not in local schema
    clean[k] = normalise(k, v)
  }

  // Sessions: INSERT OR IGNORE — never overwrite an existing session
  if (IMMUTABLE_TABLES.has(table)) {
    const cols = Object.keys(clean)
    const placeholders = cols.map((c) => `@${c}`).join(', ')
    db.prepare(
      `INSERT OR IGNORE INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})`
    ).run(clean)
    return
  }

  // Conflict resolution: skip if local row is already equal or newer
  if (clean['updated_at']) {
    const existing = db
      .prepare(`SELECT updated_at FROM ${table} WHERE id = ?`)
      .get(id) as { updated_at: string } | undefined
    if (existing?.updated_at) {
      const localMs  = new Date(existing.updated_at).getTime()
      const remoteMs = new Date(clean['updated_at'] as string).getTime()
      if (!isNaN(localMs) && !isNaN(remoteMs) && localMs >= remoteMs) return
    }
  }

  // Upsert
  const cols        = Object.keys(clean)
  const placeholders = cols.map((c) => `@${c}`).join(', ')
  const updateSet   = cols
    .filter((c) => c !== 'id')
    .map((c) => `${c} = excluded.${c}`)
    .join(', ')

  db.prepare(
    `INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders})
     ON CONFLICT(id) DO UPDATE SET ${updateSet}`
  ).run(clean)
}

/** Returns rows from all sync tables whose updated_at > since (or all rows if since is falsy). */
export function getLocalChangesSince(since: string | null): Record<string, unknown[]> {
  const db = getDb()
  const result: Record<string, unknown[]> = {}

  for (const table of SYNC_TABLES) {
    result[table] = since
      ? db.prepare(`SELECT * FROM ${table} WHERE updated_at > ?`).all(since)
      : db.prepare(`SELECT * FROM ${table}`).all()
  }

  return result
}

/** Replace all task_tags for a given task with the supplied tag ids (used on pull). */
export function replaceTaskTagsFromRemote(taskId: number, tagIds: number[]): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId)
    const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')
    for (const tagId of tagIds) ins.run(taskId, tagId)
  })()
}
