import { getDb } from './database'

export interface ScheduleEntryRow {
  id:          number
  subject_id:  number | null
  title:       string
  day_of_week: number   // 0 = Monday … 6 = Sunday
  start_time:  string   // 'HH:MM'
  end_time:    string   // 'HH:MM'
  location:    string | null
  teacher:     string | null
  created_at:  string
}

export interface CreateScheduleEntryData {
  subject_id?:  number | null
  title:        string
  day_of_week:  number
  start_time:   string
  end_time:     string
  location?:    string | null
  teacher?:     string | null
}

export interface UpdateScheduleEntryData {
  subject_id?:  number | null
  title?:       string
  day_of_week?: number
  start_time?:  string
  end_time?:    string
  location?:    string | null
  teacher?:     string | null
}

export interface BatchImportEntry {
  subject_name: string | null
  title:        string
  day_of_week:  number   // 0 = Mon … 6 = Sun
  start_time:   string   // 'HH:MM'
  end_time:     string   // 'HH:MM'
  location:     string | null
  teacher:      string | null
}

export interface BatchImportResult {
  created:         number
  subjectsCreated: number
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
      `INSERT INTO schedule_entries (subject_id, title, day_of_week, start_time, end_time, location, teacher)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      data.subject_id ?? null,
      data.title,
      data.day_of_week,
      data.start_time,
      data.end_time,
      data.location ?? null,
      data.teacher ?? null
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
  if (data.teacher     !== undefined) { fields.push('teacher = ?');     values.push(data.teacher) }

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

export function batchImportScheduleEntries(
  entries: BatchImportEntry[],
  replace: boolean
): BatchImportResult {
  const db = getDb()

  if (replace) {
    db.prepare('DELETE FROM schedule_entries').run()
  }

  // Match entries to existing subjects by name — never auto-create subjects
  const existingSubjects = db
    .prepare('SELECT id, name FROM subjects WHERE is_archived = 0')
    .all() as { id: number; name: string }[]

  const subjectMap = new Map(existingSubjects.map((s) => [s.name.toLowerCase().trim(), s.id]))
  let created = 0

  const doInsert = db.transaction(() => {
    for (const entry of entries) {
      let subject_id: number | null = null

      if (entry.subject_name) {
        const key = entry.subject_name.toLowerCase().trim()
        if (subjectMap.has(key)) subject_id = subjectMap.get(key)!
        // Not found → leave subject_id = null (no auto-creation)
      }

      db.prepare(
        `INSERT INTO schedule_entries (subject_id, title, day_of_week, start_time, end_time, location, teacher)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(
        subject_id,
        entry.title,
        entry.day_of_week,
        entry.start_time,
        entry.end_time,
        entry.location ?? null,
        entry.teacher ?? null
      )
      created++
    }
  })

  doInsert()
  return { created, subjectsCreated: 0 }
}
