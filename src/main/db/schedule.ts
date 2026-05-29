import { getDb } from './database'

export interface ScheduleEntryRow {
  id:          number
  subject_id:  number | null
  title:       string
  day_of_week: number   // 0 = Monday … 6 = Sunday
  start_time:  string   // 'HH:MM'
  end_time:    string   // 'HH:MM'
  location:    string | null
  created_at:  string
}

export interface CreateScheduleEntryData {
  subject_id?:  number | null
  title:        string
  day_of_week:  number
  start_time:   string
  end_time:     string
  location?:    string | null
}

export interface UpdateScheduleEntryData {
  subject_id?:  number | null
  title?:       string
  day_of_week?: number
  start_time?:  string
  end_time?:    string
  location?:    string | null
}

export function getAllScheduleEntries(): ScheduleEntryRow[] {
  return getDb()
    .prepare('SELECT * FROM schedule_entries ORDER BY day_of_week, start_time')
    .all() as ScheduleEntryRow[]
}

export function createScheduleEntry(data: CreateScheduleEntryData): ScheduleEntryRow {
  const db = getDb()
  const result = db
    .prepare(
      `INSERT INTO schedule_entries (subject_id, title, day_of_week, start_time, end_time, location)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.subject_id ?? null,
      data.title,
      data.day_of_week,
      data.start_time,
      data.end_time,
      data.location ?? null
    )
  return db
    .prepare('SELECT * FROM schedule_entries WHERE id = ?')
    .get(result.lastInsertRowid) as ScheduleEntryRow
}

export function updateScheduleEntry(id: number, data: UpdateScheduleEntryData): ScheduleEntryRow {
  const db = getDb()
  const fields: string[] = []
  const values: unknown[] = []

  if (data.subject_id  !== undefined) { fields.push('subject_id = ?');  values.push(data.subject_id) }
  if (data.title       !== undefined) { fields.push('title = ?');       values.push(data.title) }
  if (data.day_of_week !== undefined) { fields.push('day_of_week = ?'); values.push(data.day_of_week) }
  if (data.start_time  !== undefined) { fields.push('start_time = ?');  values.push(data.start_time) }
  if (data.end_time    !== undefined) { fields.push('end_time = ?');    values.push(data.end_time) }
  if (data.location    !== undefined) { fields.push('location = ?');    values.push(data.location) }

  if (fields.length > 0) {
    values.push(id)
    db.prepare(`UPDATE schedule_entries SET ${fields.join(', ')} WHERE id = ?`).run(...values)
  }

  return db
    .prepare('SELECT * FROM schedule_entries WHERE id = ?')
    .get(id) as ScheduleEntryRow
}

export function deleteScheduleEntry(id: number): void {
  getDb().prepare('DELETE FROM schedule_entries WHERE id = ?').run(id)
}
