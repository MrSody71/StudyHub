import { useState, useEffect } from 'react'
import type { DashboardData, Semester } from '../types'

interface Props {
  refreshKey:  number
  gradeScale:  number
  semesters:   Semester[]
  onNavigate:  (subjectId: number, taskId: number) => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtSeconds(s: number): string {
  if (s === 0) return '0 мин'
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (h === 0) return `${m} мин`
  return m > 0 ? `${h} ч ${m} мин` : `${h} ч`
}

function deadlineLabel(due: string): string {
  const today    = new Date().toISOString().slice(0, 10)
  const tomorrow = new Date(Date.now() + 86400_000).toISOString().slice(0, 10)
  if (due === today)    return 'Сегодня'
  if (due === tomorrow) return 'Завтра'
  return new Date(due + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function daysUntil(due: string): number {
  const d = new Date(due + 'T00:00:00').getTime()
  const n = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00').getTime()
  return Math.round((d - n) / 86400_000)
}

function deadlineColor(daysLeft: number): string {
  if (daysLeft <= 1) return 'var(--danger)'
  if (daysLeft <= 3) return 'var(--warning)'
  return 'var(--success)'
}

const PRIORITY_RU: Record<string, string> = { high: 'Высокий', medium: 'Средний', low: 'Низкий' }
const PRIORITY_COLOR: Record<string, string> = { high: 'var(--danger)', medium: 'var(--warning)', low: 'var(--success)' }

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ value, label, color, sub }: { value: string | number; label: string; color?: string; sub?: string }) {
  return (
    <div className="dash-stat-card">
      <div className="dash-stat-value" style={color ? { color } : {}}>{value}</div>
      <div className="dash-stat-label">{label}</div>
      {sub && <div className="dash-stat-sub">{sub}</div>}
    </div>
  )
}

function StreakCard({ streak }: { streak: number }) {
  const fire = streak >= 7 ? '🔥' : streak >= 3 ? '⚡' : '📅'
  return (
    <div className="dash-streak-card">
      <div className="dash-streak-fire">{fire}</div>
      <div className="dash-streak-num">{streak}</div>
      <div className="dash-streak-label">
        {streak === 0 ? 'Начни серию сегодня!' : streak === 1 ? 'день подряд' : streak < 5 ? 'дня подряд' : 'дней подряд'}
      </div>
    </div>
  )
}

function ActivityChart({ days, maxSeconds }: { days: DashboardData['activityByDay']; maxSeconds: number }) {
  const today = new Date().toISOString().slice(0, 10)
  const max   = Math.max(maxSeconds, 1)
  return (
    <div className="dash-activity-chart">
      {days.map((d) => {
        const pct     = (d.total_seconds / max) * 100
        const isToday = d.date === today
        return (
          <div key={d.date} className="dash-activity-col" title={`${shortDate(d.date)}: ${fmtSeconds(d.total_seconds)}`}>
            <div className="dash-activity-bar-wrap">
              <div
                className={`dash-activity-bar${isToday ? ' today' : ''}`}
                style={{ height: `${Math.max(pct, d.total_seconds > 0 ? 6 : 0)}%` }}
              />
            </div>
            {isToday && <div className="dash-activity-dot" />}
          </div>
        )
      })}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function Dashboard({ refreshKey, gradeScale, semesters, onNavigate }: Props) {
  const [data,               setData]               = useState<DashboardData | null>(null)
  const [loading,            setLoading]            = useState(true)
  const [error,              setError]              = useState<string | null>(null)
  const [filterSemesterId,   setFilterSemesterId]   = useState<number | null>(null)

  // When semesters load, default to active semester if one exists
  useEffect(() => {
    const active = semesters.find((s) => s.is_active === 1)
    if (active && filterSemesterId === null) {
      setFilterSemesterId(active.id)
    }
  }, [semesters])

  useEffect(() => {
    setLoading(true)
    window.api.dashboard.getData(filterSemesterId).then((r) => {
      if (r.success) { setData(r.data); setError(null) }
      else setError(r.error)
      setLoading(false)
    }).catch((e) => { setError(String(e)); setLoading(false) })
  }, [refreshKey, filterSemesterId])

  if (loading) return <div className="dash-loading">Загрузка дашборда…</div>
  if (error)   return <div className="dash-loading" style={{ color: 'var(--danger)' }}>Ошибка: {error}</div>
  if (!data)   return null

  const { taskStats, subjectProgress, upcomingDeadlines, weekStudySeconds, activityByDay, overallGpa, streak } = data
  const maxActivity = Math.max(...activityByDay.map((d) => d.total_seconds), 1)
  const doneRatio   = taskStats.total > 0 ? taskStats.done / taskStats.total : 0

  return (
    <div className="dash-outer">
      {/* ── Header ──────────────────────────────────────────────────── */}
      <div className="dash-header">
        <div className="panel-title">🏠 Дашборд</div>

        {/* Semester filter */}
        {semesters.length > 0 && (
          <div className="dash-semester-filter">
            <select
              className="dash-semester-select"
              value={filterSemesterId ?? ''}
              onChange={(e) => setFilterSemesterId(e.target.value === '' ? null : Number(e.target.value))}
            >
              <option value="">Все семестры</option>
              {semesters.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}{s.is_active ? ' ★' : ''}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <div className="dash-scroll">
        {/* ── Row 1: Key stats + streak ──────────────────────────────── */}
        <div className="dash-row dash-stats-row">
          <StreakCard streak={streak} />
          <StatCard value={taskStats.total}      label="Всего заданий" />
          <StatCard
            value={taskStats.done}
            label="Выполнено"
            color="var(--success)"
            sub={taskStats.total > 0 ? `${Math.round(doneRatio * 100)}%` : undefined}
          />
          <StatCard value={taskStats.inProgress} label="В процессе"   color="var(--accent)" />
          <StatCard
            value={taskStats.overdue}
            label="Просрочено"
            color={taskStats.overdue > 0 ? 'var(--danger)' : undefined}
          />
          {overallGpa !== null && (
            <StatCard
              value={(overallGpa * gradeScale).toFixed(gradeScale <= 10 ? 2 : 1)}
              label={`Ср. балл / ${gradeScale}`}
              color="var(--accent)"
            />
          )}
          <StatCard
            value={fmtSeconds(weekStudySeconds)}
            label="Учёба за 7 дней"
            color={weekStudySeconds > 0 ? 'var(--accent)' : undefined}
          />
        </div>

        {/* ── Row 2: Subject progress + Upcoming deadlines ──────────── */}
        <div className="dash-row dash-main-row">
          {/* Subject progress */}
          <div className="dash-card dash-progress-card">
            <div className="dash-card-title">Прогресс по предметам</div>
            {subjectProgress.length === 0 ? (
              <div className="dash-empty">Нет предметов</div>
            ) : (
              <div className="dash-progress-list">
                {subjectProgress.map((s) => (
                  <div key={s.subject_id} className="dash-progress-item">
                    <div className="dash-progress-header">
                      <span className="dash-progress-dot" style={{ background: s.subject_color }} />
                      <span className="dash-progress-name">{s.subject_name}</span>
                      <span className="dash-progress-pct" style={{ color: s.subject_color }}>
                        {s.pct}%
                      </span>
                      <span className="dash-progress-count">{s.done}/{s.total}</span>
                    </div>
                    <div className="dash-progress-track">
                      <div
                        className="dash-progress-fill"
                        style={{ width: `${s.pct}%`, background: s.subject_color }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Upcoming deadlines */}
          <div className="dash-card dash-deadlines-card">
            <div className="dash-card-title">Ближайшие дедлайны (7 дней)</div>
            {upcomingDeadlines.length === 0 ? (
              <div className="dash-empty">
                <span style={{ fontSize: 28, opacity: .25 }}>✅</span>
                <span>Дедлайнов нет — отличная работа!</span>
              </div>
            ) : (
              <div className="dash-deadline-list">
                {upcomingDeadlines.map((t) => {
                  const days = daysUntil(t.due_date)
                  const dc   = deadlineColor(days)
                  return (
                    <div
                      key={t.id}
                      className="dash-deadline-item"
                      onClick={() => onNavigate(t.subject_id, t.id)}
                      title="Перейти к заданию"
                    >
                      <div className="dash-deadline-date" style={{ color: dc }}>
                        {deadlineLabel(t.due_date)}
                      </div>
                      <div className="dash-deadline-info">
                        <div className="dash-deadline-title">{t.title}</div>
                        <div className="dash-deadline-subject" style={{ color: t.subject_color }}>
                          {t.subject_name}
                        </div>
                      </div>
                      <span
                        className="dash-deadline-priority"
                        style={{ color: PRIORITY_COLOR[t.priority] }}
                        title={PRIORITY_RU[t.priority]}
                      >
                        {t.priority === 'high' ? '▲' : t.priority === 'medium' ? '▶' : '▽'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Row 3: Activity chart ──────────────────────────────────── */}
        <div className="dash-row">
          <div className="dash-card dash-activity-card">
            <div className="dash-card-title">
              Активность за 14 дней
              {weekStudySeconds > 0 && (
                <span className="dash-activity-week-total">
                  {fmtSeconds(weekStudySeconds)} за неделю
                </span>
              )}
            </div>
            {activityByDay.every((d) => d.total_seconds === 0) ? (
              <div className="dash-empty" style={{ padding: '20px 0' }}>
                Запусти Помодоро-таймер, чтобы видеть активность
              </div>
            ) : (
              <ActivityChart days={activityByDay} maxSeconds={maxActivity} />
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
