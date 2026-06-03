import { getDb } from './database'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export interface TagRow {
  id:         number
  name:       string
  color:      string
  is_deleted: number   // 0 | 1
  created_at: string
  updated_at: string
}

export function getAllTags(): TagRow[] {
  return getDb()
    .prepare('SELECT * FROM tags WHERE is_deleted = 0 ORDER BY name COLLATE NOCASE ASC')
    .all() as TagRow[]
}

export function createTag(name: string, color: string): TagRow {
  const db = getDb()
  const result = db
    .prepare(`INSERT INTO tags (name, color, updated_at) VALUES (?, ?, ${NOW})`)
    .run(name.trim(), color)
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(result.lastInsertRowid) as TagRow
}

export function updateTag(id: number, data: { name?: string; color?: string }): TagRow {
  const db = getDb()
  const fields: string[] = [`updated_at = ${NOW}`]
  const values: unknown[] = []
  if (data.name !== undefined)  { fields.push('name = ?');  values.push(data.name.trim()) }
  if (data.color !== undefined) { fields.push('color = ?'); values.push(data.color) }
  values.push(id)
  db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return db.prepare('SELECT * FROM tags WHERE id = ?').get(id) as TagRow
}

export function deleteTag(id: number): void {
  getDb()
    .prepare(`UPDATE tags SET is_deleted = 1, updated_at = ${NOW} WHERE id = ?`)
    .run(id)
}

export function setTaskTags(taskId: number, tagIds: number[]): void {
  const db = getDb()
  const apply = db.transaction(() => {
    db.prepare('DELETE FROM task_tags WHERE task_id = ?').run(taskId)
    const ins = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')
    for (const tagId of tagIds) ins.run(taskId, tagId)
  })
  apply()
}
