import { getDb } from './database'

export interface NoteRow {
  id:         number
  subject_id: number
  title:      string
  content:    string
  updated_at: string
  created_at: string
}

export function getNotesBySubject(subjectId: number): NoteRow[] {
  return getDb()
    .prepare('SELECT * FROM notes WHERE subject_id = ? ORDER BY updated_at DESC')
    .all(subjectId) as NoteRow[]
}

export function getNoteById(id: number): NoteRow | null {
  return (getDb().prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow) ?? null
}

export function createNote(subjectId: number, title: string): NoteRow {
  const db = getDb()
  const result = db
    .prepare(`INSERT INTO notes (subject_id, title, content) VALUES (?, ?, '')`)
    .run(subjectId, title)
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid) as NoteRow
}

export function updateNote(id: number, data: { title?: string; content?: string }): NoteRow {
  const db = getDb()
  const fields: string[] = ['updated_at = datetime(\'now\',\'localtime\')']
  const values: unknown[] = []

  if (data.title   !== undefined) { fields.push('title = ?');   values.push(data.title) }
  if (data.content !== undefined) { fields.push('content = ?'); values.push(data.content) }

  values.push(id)
  db.prepare(`UPDATE notes SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  return db.prepare('SELECT * FROM notes WHERE id = ?').get(id) as NoteRow
}

export function deleteNote(id: number): void {
  getDb().prepare('DELETE FROM notes WHERE id = ?').run(id)
}

export function searchNotes(query: string): NoteRow[] {
  const like = `%${query}%`
  return getDb()
    .prepare(`
      SELECT * FROM notes
      WHERE title LIKE ? OR content LIKE ?
      ORDER BY updated_at DESC
      LIMIT 100
    `)
    .all(like, like) as NoteRow[]
}
