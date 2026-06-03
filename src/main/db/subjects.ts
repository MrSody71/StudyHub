import { getDb } from './database'

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export interface SubjectRow {
  id:          number
  name:        string
  color:       string
  description: string | null
  semester_id: number | null
  is_archived: number   // 0 | 1
  is_deleted:  number   // 0 | 1
  created_at:  string
  updated_at:  string
}

export interface CreateSubjectData {
  name:        string
  color:       string
  description?: string | null
  semester_id?: number | null
}

export interface UpdateSubjectData {
  name?:        string
  color?:       string
  description?: string | null
  semester_id?: number | null
  is_archived?: number
}

export interface SubjectFilter {
  archived?:   boolean
  semesterId?: number
}

export function getAllSubjects(filter?: SubjectFilter): SubjectRow[] {
  const archived = filter?.archived ?? false
  const params: unknown[] = [archived ? 1 : 0]
  let sql = 'SELECT * FROM subjects WHERE is_archived = ? AND is_deleted = 0'
  if (filter?.semesterId !== undefined) {
    sql += ' AND semester_id = ?'
    params.push(filter.semesterId)
  }
  sql += ' ORDER BY name COLLATE NOCASE ASC'
  return getDb().prepare(sql).all(...params) as SubjectRow[]
}

export function createSubject(data: CreateSubjectData): SubjectRow {
  const db = getDb()
  const r = db.prepare(
    `INSERT INTO subjects (name, color, description, semester_id, updated_at)
     VALUES (?, ?, ?, ?, ${NOW})`
  ).run(data.name, data.color, data.description ?? null, data.semester_id ?? null)
  return db.prepare('SELECT * FROM subjects WHERE id = ?').get(r.lastInsertRowid) as SubjectRow
}

export function updateSubject(id: number, data: UpdateSubjectData): SubjectRow {
  const db = getDb()
  const fields: string[] = [`updated_at = ${NOW}`]
  const values: unknown[] = []

  if (data.name        !== undefined) { fields.push('name = ?');        values.push(data.name) }
  if (data.color       !== undefined) { fields.push('color = ?');       values.push(data.color) }
  if (data.description !== undefined) { fields.push('description = ?'); values.push(data.description) }
  if (data.semester_id !== undefined) { fields.push('semester_id = ?'); values.push(data.semester_id) }
  if (data.is_archived !== undefined) { fields.push('is_archived = ?'); values.push(data.is_archived) }

  values.push(id)
  db.prepare(`UPDATE subjects SET ${fields.join(', ')} WHERE id = ?`).run(...values)

  return db.prepare('SELECT * FROM subjects WHERE id = ?').get(id) as SubjectRow
}

export function deleteSubject(id: number): void {
  getDb()
    .prepare(`UPDATE subjects SET is_deleted = 1, updated_at = ${NOW} WHERE id = ?`)
    .run(id)
}

export function archiveSubject(id: number, archive: boolean): SubjectRow {
  return updateSubject(id, { is_archived: archive ? 1 : 0 })
}
