import { getDb } from './database'

export interface TaskStats {
  total:      number
  done:       number
  inProgress: number
  notStarted: number
  overdue:    number
}

export interface SubjectProgress {
  subject_id:   number
  subject_name: string
  subject_color: string
  total:        number
  done:         number
  pct:          number   // 0–100
}

export interface DeadlineTask {
  id:         number
  subject_id: number
  title:      string
  due_date:   string
  priority:   string
  status:     string
  subject_name:  string
  subject_color: string
}

export interface DayActivity {
  date:          string   // YYYY-MM-DD
  total_seconds: number
}

export interface DashboardData {
  taskStats:         TaskStats
  subjectProgress:   SubjectProgress[]
  upcomingDeadlines: DeadlineTask[]
  weekStudySeconds:  number
  activityByDay:     DayActivity[]   // last 14 days, gaps filled
  overallGpa:        number | null   // ratio 0–1, null if no grades
  streak:            number
}

// ─────────────────────────────────────────────────────────────────────────────

function calcStreak(dates: string[]): number {
  // dates: distinct YYYY-MM-DD strings sorted DESC
  if (dates.length === 0) return 0

  const toMs = (d: string) => new Date(d + 'T00:00:00').getTime()
  const DAY  = 86400_000

  const today     = new Date().toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() - DAY).toISOString().slice(0, 10)

  // Streak must touch today or yesterday (allows streak to survive until midnight)
  if (dates[0] !== today && dates[0] !== yesterday) return 0

  let streak = 1
  for (let i = 1; i < dates.length; i++) {
    if (toMs(dates[i - 1]) - toMs(dates[i]) === DAY) {
      streak++
    } else {
      break
    }
  }
  return streak
}

export function getDashboardData(semesterId?: number | null): DashboardData {
  const db = getDb()

  // Collect the subject IDs in scope (non-archived, optionally filtered by semester)
  let subjectRows: { id: number }[]
  if (semesterId != null) {
    subjectRows = db.prepare(
      'SELECT id FROM subjects WHERE is_archived = 0 AND semester_id = ?'
    ).all(semesterId) as { id: number }[]
  } else {
    subjectRows = db.prepare(
      'SELECT id FROM subjects WHERE is_archived = 0'
    ).all() as { id: number }[]
  }
  const subjectIds = subjectRows.map((r) => r.id)
  const inClause   = subjectIds.length > 0 ? `(${subjectIds.join(',')})` : '(NULL)'

  // ── Task stats ────────────────────────────────────────────────────────────
  const taskRows = db.prepare(`
    SELECT
      COUNT(*)                                                              AS total,
      SUM(CASE WHEN status = 'done'         THEN 1 ELSE 0 END)             AS done,
      SUM(CASE WHEN status = 'in_progress'  THEN 1 ELSE 0 END)             AS in_progress,
      SUM(CASE WHEN status = 'not_started'  THEN 1 ELSE 0 END)             AS not_started,
      SUM(CASE WHEN status != 'done' AND due_date IS NOT NULL
               AND due_date < DATE('now','localtime') THEN 1 ELSE 0 END)   AS overdue
    FROM tasks
    WHERE subject_id IN ${inClause}
  `).get() as { total: number; done: number; in_progress: number; not_started: number; overdue: number }

  const taskStats: TaskStats = {
    total:      taskRows.total,
    done:       taskRows.done,
    inProgress: taskRows.in_progress,
    notStarted: taskRows.not_started,
    overdue:    taskRows.overdue,
  }

  // ── Subject progress ──────────────────────────────────────────────────────
  const subjectProgress = (db.prepare(`
    SELECT
      s.id    AS subject_id,
      s.name  AS subject_name,
      s.color AS subject_color,
      COUNT(t.id)                                              AS total,
      SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END)      AS done
    FROM subjects s
    LEFT JOIN tasks t ON t.subject_id = s.id
    WHERE s.id IN ${inClause}
    GROUP BY s.id
    ORDER BY s.name
  `).all() as { subject_id: number; subject_name: string; subject_color: string; total: number; done: number }[])
    .map((r) => ({
      ...r,
      pct: r.total > 0 ? Math.round((r.done / r.total) * 100) : 0,
    }))

  // ── Upcoming deadlines (next 7 days, not done) ────────────────────────────
  const upcomingDeadlines = db.prepare(`
    SELECT t.id, t.subject_id, t.title, t.due_date, t.priority, t.status,
           s.name AS subject_name, s.color AS subject_color
    FROM tasks t
    JOIN subjects s ON s.id = t.subject_id
    WHERE t.subject_id IN ${inClause}
      AND t.status != 'done'
      AND t.due_date IS NOT NULL
      AND t.due_date >= DATE('now','localtime')
      AND t.due_date <= DATE('now', '+7 days','localtime')
    ORDER BY t.due_date ASC, t.priority DESC
    LIMIT 15
  `).all() as DeadlineTask[]

  // ── Study time — last 7 days (always global: personal habit metric) ───────
  const weekRow = db.prepare(`
    SELECT COALESCE(SUM(duration_seconds), 0) AS s
    FROM study_sessions
    WHERE DATE(started_at) >= DATE('now', '-6 days', 'localtime')
  `).get() as { s: number }

  // ── Activity — last 14 days (with gap fill, always global) ───────────────
  const rawActivity = db.prepare(`
    SELECT DATE(started_at) AS date, SUM(duration_seconds) AS total_seconds
    FROM study_sessions
    WHERE started_at >= DATE('now', '-13 days', 'localtime')
    GROUP BY DATE(started_at)
  `).all() as DayActivity[]

  const actMap = new Map(rawActivity.map((r) => [r.date, r.total_seconds]))
  const activityByDay: DayActivity[] = []
  for (let i = 13; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    const ds = d.toISOString().slice(0, 10)
    activityByDay.push({ date: ds, total_seconds: actMap.get(ds) ?? 0 })
  }

  // ── Overall GPA (filtered by semester scope) ──────────────────────────────
  const gpaRow = db.prepare(`
    SELECT SUM((g.value / g.max_value) * g.weight) / SUM(g.weight) AS avg
    FROM grades g
    WHERE g.subject_id IN ${inClause}
    HAVING COUNT(*) > 0
  `).get() as { avg: number } | undefined
  const overallGpa = gpaRow?.avg ?? null

  // ── Streak (global: personal study habit) ────────────────────────────────
  const studyDates = (db.prepare(`
    SELECT DISTINCT DATE(started_at) AS date
    FROM study_sessions
    ORDER BY date DESC
    LIMIT 400
  `).all() as { date: string }[]).map((r) => r.date)

  const streak = calcStreak(studyDates)

  return {
    taskStats,
    subjectProgress,
    upcomingDeadlines,
    weekStudySeconds:  weekRow.s,
    activityByDay,
    overallGpa,
    streak,
  }
}
