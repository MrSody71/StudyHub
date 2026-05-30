import { getDb } from './database'

export interface GradeRow {
  id:         number
  subject_id: number
  title:      string
  value:      number
  max_value:  number
  weight:     number
  date:       string | null
  created_at: string
}

export interface CreateGradeData {
  subject_id: number
  title:      string
  value:      number
  max_value:  number
  weight:     number
  date?:      string | null
}

export interface UpdateGradeData {
  title?:     string
  value?:     number
  max_value?: number
  weight?:    number
  date?:      string | null
}

export interface SubjectGradeStat {
  subject_id:      number
  subject_name:    string
  subject_color:   string
  weighted_avg:    number   // 0–1 (ratio), display by multiplying with scale
  grade_count:     number
}

export function getGradesBySubject(subjectId: number): GradeRow[] {
  return getDb()
    .prepare('SELECT * FROM grades WHERE subject_id = ? ORDER BY date DESC, created_at DESC')
    .all(subjectId) as GradeRow[]
}

export function createGrade(data: CreateGradeData): GradeRow {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO grades (subject_id, title, value, max_value, weight, date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(data.subject_id, data.title, data.value, data.max_value, data.weight, data.date ?? null)
  return db.prepare('SELECT * FROM grades WHERE id = ?').get(result.lastInsertRowid) as GradeRow
}

export function updateGrade(id: number, data: UpdateGradeData): GradeRow {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (data.title     !== undefined) { fields.push('title = ?');     values.push(data.title) }
  if (data.value     !== undefined) { fields.push('value = ?');     values.push(data.value) }
  if (data.max_value !== undefined) { fields.push('max_value = ?'); values.push(data.max_value) }
  if (data.weight    !== undefined) { fields.push('weight = ?');    values.push(data.weight) }
  if (data.date      !== undefined) { fields.push('date = ?');      values.push(data.date) }

  if (fields.length > 0) {
    values.push(id)
    db.prepare(`UPDATE grades SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }
  return db.prepare('SELECT * FROM grades WHERE id = ?').get(id) as GradeRow
}

export function deleteGrade(id: number): void {
  getDb().prepare('DELETE FROM grades WHERE id = ?').run(id)
}

/** All grades across all subjects (for client-side stats like median). */
export function getAllGrades(): GradeRow[] {
  return getDb()
    .prepare('SELECT * FROM grades ORDER BY subject_id, date DESC, created_at DESC')
    .all() as GradeRow[]
}

/** Weighted average per subject (ratio 0–1), only subjects that have at least one grade. */
export function getSubjectGradeStats(): SubjectGradeStat[] {
  return getDb().prepare(`
    SELECT
      g.subject_id,
      s.name  AS subject_name,
      s.color AS subject_color,
      SUM((g.value / g.max_value) * g.weight) / SUM(g.weight) AS weighted_avg,
      COUNT(*) AS grade_count
    FROM grades g
    JOIN subjects s ON s.id = g.subject_id
    GROUP BY g.subject_id
    ORDER BY s.name
  `).all() as SubjectGradeStat[]
}
