import { getDb } from './database'

export interface SubjectRow {
  id: number
  name: string
  color: string
  description: string | null
  created_at: string
}

export interface CreateSubjectData {
  name: string
  color: string
  description?: string | null
}

export interface UpdateSubjectData {
  name?: string
  color?: string
  description?: string | null
}

export function getAllSubjects(): SubjectRow[] {
  return getDb()
    .prepare('SELECT * FROM subjects ORDER BY name COLLATE NOCASE ASC')
    .all() as SubjectRow[]
}

export function createSubject(data: CreateSubjectData): SubjectRow {
  const db = getDb()
  const result = db
    .prepare(
      'INSERT INTO subjects (name, color, description) VALUES (?, ?, ?)'
    )
    .run(data.name, data.color, data.description ?? null)

  return db
    .prepare('SELECT * FROM subjects WHERE id = ?')
    .get(result.lastInsertRowid) as SubjectRow
}

export function updateSubject(id: number, data: UpdateSubjectData): SubjectRow {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (data.name !== undefined) {
    fields.push('name = ?')
    values.push(data.name)
  }
  if (data.color !== undefined) {
    fields.push('color = ?')
    values.push(data.color)
  }
  if (data.description !== undefined) {
    fields.push('description = ?')
    values.push(data.description)
  }

  if (fields.length > 0) {
    values.push(id)
    db.prepare(`UPDATE subjects SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  return db.prepare('SELECT * FROM subjects WHERE id = ?').get(id) as SubjectRow
}

export function deleteSubject(id: number): void {
  getDb().prepare('DELETE FROM subjects WHERE id = ?').run(id)
}
