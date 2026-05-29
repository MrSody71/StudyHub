import { getDb } from './database'

export interface SemesterRow {
  id:         number
  name:       string
  start_date: string | null
  end_date:   string | null
  is_active:  number   // 0 | 1
  created_at: string
}

export function getAllSemesters(): SemesterRow[] {
  return getDb()
    .prepare('SELECT * FROM semesters ORDER BY start_date DESC, created_at DESC')
    .all() as SemesterRow[]
}

export function createSemester(data: {
  name: string
  start_date?: string | null
  end_date?: string | null
}): SemesterRow {
  const db = getDb()
  const r = db.prepare(
    'INSERT INTO semesters (name, start_date, end_date) VALUES (?, ?, ?)'
  ).run(data.name, data.start_date ?? null, data.end_date ?? null)
  return db.prepare('SELECT * FROM semesters WHERE id = ?').get(r.lastInsertRowid) as SemesterRow
}

export function updateSemester(
  id: number,
  data: { name?: string; start_date?: string | null; end_date?: string | null }
): SemesterRow {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []
  if (data.name       !== undefined) { fields.push('name = ?');       values.push(data.name) }
  if (data.start_date !== undefined) { fields.push('start_date = ?'); values.push(data.start_date) }
  if (data.end_date   !== undefined) { fields.push('end_date = ?');   values.push(data.end_date) }
  if (fields.length > 0) {
    values.push(id)
    db.prepare(`UPDATE semesters SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }
  return db.prepare('SELECT * FROM semesters WHERE id = ?').get(id) as SemesterRow
}

export function deleteSemester(id: number): void {
  // subjects.semester_id will be set to NULL via ON DELETE SET NULL
  getDb().prepare('DELETE FROM semesters WHERE id = ?').run(id)
}

export function setActiveSemester(id: number | null): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare('UPDATE semesters SET is_active = 0').run()
    if (id !== null) {
      db.prepare('UPDATE semesters SET is_active = 1 WHERE id = ?').run(id)
    }
  })()
}
