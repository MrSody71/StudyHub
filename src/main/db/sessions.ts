import { getDb } from './database'

export type SessionType = 'pomodoro' | 'short_break' | 'long_break' | 'manual'

export interface SessionRow {
  id:               number
  subject_id:       number | null
  task_id:          number | null
  type:             SessionType
  duration_seconds: number
  started_at:       string
  ended_at:         string | null
  created_at:       string
}

export interface CreateSessionData {
  subject_id:       number | null
  task_id:          number | null
  type:             SessionType
  duration_seconds: number
  started_at:       string
  ended_at?:        string | null
}

export interface SubjectStatRow {
  subject_id:       number
  subject_name:     string
  subject_color:    string
  total_seconds:    number
  session_count:    number
}

export interface DayStatRow {
  date:          string   // 'YYYY-MM-DD'
  total_seconds: number
  session_count: number
}

export interface SessionStats {
  bySubject:      SubjectStatRow[]
  byDay:          DayStatRow[]    // last 14 days, gaps filled
  todaySeconds:   number
  totalSeconds:   number
  totalSessions:  number
}

export function createSession(data: CreateSessionData): SessionRow {
  const db = getDb()
  const stmt = db.prepare(`
    INSERT INTO study_sessions (subject_id, task_id, type, duration_seconds, started_at, ended_at)
    VALUES (@subject_id, @task_id, @type, @duration_seconds, @started_at, @ended_at)
  `)
  const result = stmt.run({
    subject_id:       data.subject_id ?? null,
    task_id:          data.task_id   ?? null,
    type:             data.type,
    duration_seconds: data.duration_seconds,
    started_at:       data.started_at,
    ended_at:         data.ended_at ?? null,
  })
  return db.prepare('SELECT * FROM study_sessions WHERE id = ?').get(result.lastInsertRowid) as SessionRow
}

export function getSessionStats(): SessionStats {
  const db = getDb()

  const bySubject = db.prepare(`
    SELECT
      s.subject_id,
      sub.name  AS subject_name,
      sub.color AS subject_color,
      SUM(s.duration_seconds) AS total_seconds,
      COUNT(*)                AS session_count
    FROM study_sessions s
    LEFT JOIN subjects sub ON sub.id = s.subject_id
    WHERE s.subject_id IS NOT NULL
    GROUP BY s.subject_id
    ORDER BY total_seconds DESC
  `).all() as SubjectStatRow[]

  const rawByDay = db.prepare(`
    SELECT
      DATE(started_at) AS date,
      SUM(duration_seconds) AS total_seconds,
      COUNT(*)              AS session_count
    FROM study_sessions
    WHERE started_at >= DATE('now', '-13 days', 'localtime')
    GROUP BY DATE(started_at)
    ORDER BY date ASC
  `).all() as DayStatRow[]

  // Fill gaps for last 14 days
  const byDay: DayStatRow[] = []
  const dayMap = new Map(rawByDay.map((r) => [r.date, r]))
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const dateStr = d.toISOString().slice(0, 10)
    byDay.push(dayMap.get(dateStr) ?? { date: dateStr, total_seconds: 0, session_count: 0 })
  }

  const todayRow = db.prepare(`
    SELECT COALESCE(SUM(duration_seconds), 0) AS s
    FROM study_sessions
    WHERE DATE(started_at) = DATE('now', 'localtime')
  `).get() as { s: number }

  const totalRow = db.prepare(`
    SELECT
      COALESCE(SUM(duration_seconds), 0) AS total_seconds,
      COUNT(*) AS total_sessions
    FROM study_sessions
  `).get() as { total_seconds: number; total_sessions: number }

  return {
    bySubject,
    byDay,
    todaySeconds:  todayRow.s,
    totalSeconds:  totalRow.total_seconds,
    totalSessions: totalRow.total_sessions,
  }
}
