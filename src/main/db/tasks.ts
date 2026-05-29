import { getDb } from './database'

export interface TaskRow {
  id: number
  subject_id: number
  title: string
  description: string | null
  status: 'not_started' | 'in_progress' | 'done'
  priority: 'low' | 'medium' | 'high'
  due_date: string | null
  created_at: string
}

export interface CreateTaskData {
  subject_id: number
  title: string
  description?: string | null
  status?: 'not_started' | 'in_progress' | 'done'
  priority?: 'low' | 'medium' | 'high'
  due_date?: string | null
}

export interface UpdateTaskData {
  title?: string
  description?: string | null
  status?: 'not_started' | 'in_progress' | 'done'
  priority?: 'low' | 'medium' | 'high'
  due_date?: string | null
}

export function getTasksBySubject(subjectId: number): TaskRow[] {
  return getDb()
    .prepare('SELECT * FROM tasks WHERE subject_id = ? ORDER BY created_at DESC')
    .all(subjectId) as TaskRow[]
}

export function createTask(data: CreateTaskData): TaskRow {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO tasks (subject_id, title, description, status, priority, due_date)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.subject_id,
      data.title,
      data.description ?? null,
      data.status ?? 'not_started',
      data.priority ?? 'medium',
      data.due_date ?? null
    )

  return db
    .prepare('SELECT * FROM tasks WHERE id = ?')
    .get(result.lastInsertRowid) as TaskRow
}

export function updateTask(id: number, data: UpdateTaskData): TaskRow {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (data.title !== undefined) {
    fields.push('title = ?')
    values.push(data.title)
  }
  if (data.description !== undefined) {
    fields.push('description = ?')
    values.push(data.description)
  }
  if (data.status !== undefined) {
    fields.push('status = ?')
    values.push(data.status)
  }
  if (data.priority !== undefined) {
    fields.push('priority = ?')
    values.push(data.priority)
  }
  if (data.due_date !== undefined) {
    fields.push('due_date = ?')
    values.push(data.due_date)
  }

  if (fields.length > 0) {
    values.push(id)
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  return db.prepare('SELECT * FROM tasks WHERE id = ?').get(id) as TaskRow
}

export function deleteTask(id: number): void {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
}
