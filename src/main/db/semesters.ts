import { getDb } from './database'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export interface SemesterRow {
  id:         number
  name:       string
  start_date: string | null
  end_date:   string | null
  is_active:  number   // 0 | 1
  is_deleted: number   // 0 | 1
  created_at: string
  updated_at: string
}

export function getAllSemesters(): SemesterRow[] {
  return getDb()
    .prepare('SELECT * FROM semesters WHERE is_deleted = 0 ORDER BY start_date DESC, created_at DESC')
    .all() as SemesterRow[]
}

export function createSemester(data: {
  name: string
  start_date?: string | null
  end_date?: string | null
}): SemesterRow {
  const db = getDb()
  const r = db.prepare(
    `INSERT INTO semesters (name, start_date, end_date, updated_at) VALUES (?, ?, ?, ${NOW})`
  ).run(data.name, data.start_date ?? null, data.end_date ?? null)
  return db.prepare('SELECT * FROM semesters WHERE id = ?').get(r.lastInsertRowid) as SemesterRow
}

export function updateSemester(
  id: number,
  data: { name?: string; start_date?: string | null; end_date?: string | null }
): SemesterRow {
  const db = getDb()
  const fields: string[] = [`updated_at = ${NOW}`]
  const values: unknown[] = []
  if (data.name       !== undefined) { fields.push('name = ?');       values.push(data.name) }
  if (data.start_date !== undefined) { fields.push('start_date = ?'); values.push(data.start_date) }
  if (data.end_date   !== undefined) { fields.push('end_date = ?');   values.push(data.end_date) }
  values.push(id)
  db.prepare(`UPDATE semesters SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return db.prepare('SELECT * FROM semesters WHERE id = ?').get(id) as SemesterRow
}

export function deleteSemester(id: number): void {
  // subjects.semester_id is left pointing to the soft-deleted semester;
  // the app filters by is_deleted=0 so the semester won't appear in lists.
  getDb()
    .prepare(`UPDATE semesters SET is_deleted = 1, updated_at = ${NOW} WHERE id = ?`)
    .run(id)
}

export function setActiveSemester(id: number | null): void {
  const db = getDb()
  db.transaction(() => {
    db.prepare(`UPDATE semesters SET is_active = 0, updated_at = ${NOW}`).run()
    if (id !== null) {
      db.prepare(`UPDATE semesters SET is_active = 1, updated_at = ${NOW} WHERE id = ?`).run(id)
    }
  })()
}
