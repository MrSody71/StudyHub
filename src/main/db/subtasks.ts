import { getDb } from './database'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export interface SubtaskRow {
  id:         number
  task_id:    number
  title:      string
  is_done:    number   // SQLite stores booleans as 0/1
  sort_order: number
  is_deleted: number   // 0 | 1
  created_at: string
  updated_at: string
}

export function getSubtasksByTask(taskId: number): SubtaskRow[] {
  return getDb()
    .prepare('SELECT * FROM subtasks WHERE task_id = ? AND is_deleted = 0 ORDER BY sort_order ASC, id ASC')
    .all(taskId) as SubtaskRow[]
}

export function createSubtask(taskId: number, title: string): SubtaskRow {
  const db = getDb()
  const maxOrder = (db
    .prepare('SELECT COALESCE(MAX(sort_order), -1) AS m FROM subtasks WHERE task_id = ? AND is_deleted = 0')
    .get(taskId) as { m: number }).m

  const result = db
    .prepare(`INSERT INTO subtasks (task_id, title, sort_order, updated_at) VALUES (?, ?, ?, ${NOW})`)
    .run(taskId, title, maxOrder + 1)

  return db
    .prepare('SELECT * FROM subtasks WHERE id = ?')
    .get(result.lastInsertRowid) as SubtaskRow
}

export function updateSubtask(
  id: number,
  data: { title?: string; is_done?: boolean }
): SubtaskRow {
  const db = getDb()
  const fields: string[] = [`updated_at = ${NOW}`]
  const values: unknown[] = []

  if (data.title !== undefined)   { fields.push('title = ?');   values.push(data.title) }
  if (data.is_done !== undefined) { fields.push('is_done = ?'); values.push(data.is_done ? 1 : 0) }

  values.push(id)
  db.prepare(`UPDATE subtasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  return db.prepare('SELECT * FROM subtasks WHERE id = ?').get(id) as SubtaskRow
}

export function deleteSubtask(id: number): void {
  getDb()
    .prepare(`UPDATE subtasks SET is_deleted = 1, updated_at = ${NOW} WHERE id = ?`)
    .run(id)
}

export function reorderSubtasks(taskId: number, orderedIds: number[]): void {
  const db = getDb()
  const stmt = db.prepare(`UPDATE subtasks SET sort_order = ?, updated_at = ${NOW} WHERE id = ? AND task_id = ?`)
  const apply = db.transaction(() => {
    orderedIds.forEach((id, index) => stmt.run(index, id, taskId))
  })
  apply()
}
