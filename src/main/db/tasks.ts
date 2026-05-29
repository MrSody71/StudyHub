import { getDb } from './database'

interface TagInTask {
  id:    number
  name:  string
  color: string
}

export interface TaskRow {
  id:                    number
  subject_id:            number
  title:                 string
  description:           string | null
  status:                'not_started' | 'in_progress' | 'done'
  priority:              'low' | 'medium' | 'high'
  due_date:              string | null
  created_at:            string
  subtask_total:         number
  subtask_done:          number
  tags:                  TagInTask[]
  recurrence_rule:       string | null
  recurrence_parent_id:  number | null
}

export interface CreateTaskData {
  subject_id:           number
  title:                string
  description?:         string | null
  status?:              'not_started' | 'in_progress' | 'done'
  priority?:            'low' | 'medium' | 'high'
  due_date?:            string | null
  recurrence_rule?:     string | null
  recurrence_parent_id?: number | null
}

export interface UpdateTaskData {
  title?:           string
  description?:     string | null
  status?:          'not_started' | 'in_progress' | 'done'
  priority?:        'low' | 'medium' | 'high'
  due_date?:        string | null
  recurrence_rule?: string | null
}

interface RawRow {
  id:                   number
  subject_id:           number
  title:                string
  description:          string | null
  status:               'not_started' | 'in_progress' | 'done'
  priority:             'low' | 'medium' | 'high'
  due_date:             string | null
  created_at:           string
  subtask_total:        number
  subtask_done:         number
  tags_json:            string
  recurrence_rule:      string | null
  recurrence_parent_id: number | null
}

const WITH_COUNTS_SQL = `
  SELECT
    t.*,
    COALESCE(sub.total, 0) AS subtask_total,
    COALESCE(sub.done,  0) AS subtask_done,
    COALESCE(tag_agg.tags_json, '[]') AS tags_json
  FROM tasks t
  LEFT JOIN (
    SELECT task_id, COUNT(*) AS total, SUM(is_done) AS done
    FROM subtasks GROUP BY task_id
  ) sub ON sub.task_id = t.id
  LEFT JOIN (
    SELECT tt.task_id,
      JSON_GROUP_ARRAY(
        JSON_OBJECT('id', tg.id, 'name', tg.name, 'color', tg.color)
      ) AS tags_json
    FROM task_tags tt
    JOIN tags tg ON tg.id = tt.tag_id
    GROUP BY tt.task_id
  ) tag_agg ON tag_agg.task_id = t.id
`

function parseRaw(row: RawRow): TaskRow {
  const { tags_json, ...rest } = row
  return { ...rest, tags: JSON.parse(tags_json) as TagInTask[] }
}

export function getTasksBySubject(subjectId: number): TaskRow[] {
  const rows = getDb()
    .prepare(`${WITH_COUNTS_SQL} WHERE t.subject_id = ? ORDER BY t.created_at DESC`)
    .all(subjectId) as RawRow[]
  return rows.map(parseRaw)
}

export function createTask(data: CreateTaskData): TaskRow {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO tasks (subject_id, title, description, status, priority, due_date, recurrence_rule, recurrence_parent_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.subject_id,
      data.title,
      data.description ?? null,
      data.status ?? 'not_started',
      data.priority ?? 'medium',
      data.due_date ?? null,
      data.recurrence_rule ?? null,
      data.recurrence_parent_id ?? null
    )
  const raw = db
    .prepare(`${WITH_COUNTS_SQL} WHERE t.id = ?`)
    .get(result.lastInsertRowid) as RawRow
  return parseRaw(raw)
}

export function updateTask(id: number, data: UpdateTaskData): TaskRow {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (data.title !== undefined)            { fields.push('title = ?');            values.push(data.title) }
  if (data.description !== undefined)      { fields.push('description = ?');      values.push(data.description) }
  if (data.status !== undefined)           { fields.push('status = ?');           values.push(data.status) }
  if (data.priority !== undefined)         { fields.push('priority = ?');         values.push(data.priority) }
  if (data.due_date !== undefined)         { fields.push('due_date = ?');         values.push(data.due_date) }
  if (data.recurrence_rule !== undefined)  { fields.push('recurrence_rule = ?');  values.push(data.recurrence_rule) }

  if (fields.length > 0) {
    values.push(id)
    db.prepare(`UPDATE tasks SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  const raw = db.prepare(`${WITH_COUNTS_SQL} WHERE t.id = ?`).get(id) as RawRow
  return parseRaw(raw)
}

export function deleteTask(id: number): void {
  getDb().prepare('DELETE FROM tasks WHERE id = ?').run(id)
}

export function getAllTasksWithDeadline(): TaskRow[] {
  const rows = getDb()
    .prepare(`${WITH_COUNTS_SQL} WHERE t.due_date IS NOT NULL ORDER BY t.due_date ASC`)
    .all() as RawRow[]
  return rows.map(parseRaw)
}

// ── Recurring task completion ──────────────────────────────────────────────────

function shiftDate(base: string | null, unit: string, interval: number): string {
  const d = base ? new Date(base) : new Date()
  if (unit === 'day')   d.setDate(d.getDate() + interval)
  if (unit === 'week')  d.setDate(d.getDate() + interval * 7)
  if (unit === 'month') d.setMonth(d.getMonth() + interval)
  return d.toISOString().slice(0, 10)
}

export function completeTaskAndSpawnNext(
  id: number
): { task: TaskRow; spawned: TaskRow | null } {
  const db = getDb()

  const raw = db
    .prepare(`${WITH_COUNTS_SQL} WHERE t.id = ?`)
    .get(id) as RawRow | undefined
  if (!raw) throw new Error(`Task ${id} not found`)

  // Mark as done
  db.prepare('UPDATE tasks SET status = ? WHERE id = ?').run('done', id)
  const updatedRaw = db.prepare(`${WITH_COUNTS_SQL} WHERE t.id = ?`).get(id) as RawRow
  const task = parseRaw(updatedRaw)

  if (!raw.recurrence_rule) return { task, spawned: null }

  const rule = JSON.parse(raw.recurrence_rule) as { unit: string; interval: number }
  const newDueDate = shiftDate(raw.due_date, rule.unit, rule.interval)

  const ins = db.prepare(
    `INSERT INTO tasks (subject_id, title, description, status, priority, due_date, recurrence_rule, recurrence_parent_id)
     VALUES (?, ?, ?, 'not_started', ?, ?, ?, ?)`
  )

  const copyTags = db.transaction(() => {
    const result = ins.run(
      raw.subject_id,
      raw.title,
      raw.description,
      raw.priority,
      newDueDate,
      raw.recurrence_rule,
      id
    )
    // Copy tags from completed task to new instance
    const tagRows = db
      .prepare('SELECT tag_id FROM task_tags WHERE task_id = ?')
      .all(id) as { tag_id: number }[]
    const insertTag = db.prepare('INSERT OR IGNORE INTO task_tags (task_id, tag_id) VALUES (?, ?)')
    for (const tr of tagRows) insertTag.run(result.lastInsertRowid, tr.tag_id)
    return result.lastInsertRowid as number
  })

  const newId = copyTags()
  const spawnedRaw = db
    .prepare(`${WITH_COUNTS_SQL} WHERE t.id = ?`)
    .get(newId) as RawRow
  return { task, spawned: parseRaw(spawnedRaw) }
}
