import { useState, useEffect } from 'react'
import type { SessionStats } from '../types'

interface Props {
  sessionVersion: number   // increment to trigger reload
}

function fmtSeconds(s: number): string {
  if (s < 60) return `${s} с`
  const m = Math.floor(s / 60)
  if (m < 60) return `${m} мин`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem > 0 ? `${h} ч ${rem} мин` : `${h} ч`
}

function shortDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export default function StudyStats({ sessionVersion }: Props) {
  const [stats, setStats] = useState<SessionStats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    window.api.sessions.getStats().then((r) => {
      if (r.success) setStats(r.data)
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [sessionVersion])

  if (loading) {
    return <div className="stats-loading">Загрузка статистики…</div>
  }

  if (!stats) {
    return <div className="stats-loading">Нет данных</div>
  }

  const maxDay = Math.max(...stats.byDay.map((d) => d.total_seconds), 1)
  const maxSubject = Math.max(...stats.bySubject.map((s) => s.total_seconds), 1)

  return (
    <div className="stats-outer">
      {/* Summary cards */}
      <div className="stats-cards">
        <div className="stats-card">
          <div className="stats-card-value">{fmtSeconds(stats.todaySeconds)}</div>
          <div className="stats-card-label">Сегодня</div>
        </div>
        <div className="stats-card">
          <div className="stats-card-value">{fmtSeconds(stats.totalSeconds)}</div>
          <div className="stats-card-label">Всего</div>
        </div>
        <div className="stats-card">
          <div className="stats-card-value">{stats.totalSessions}</div>
          <div className="stats-card-label">Сессий</div>
        </div>
      </div>

      {/* Day chart — last 14 days */}
      <div className="stats-section">
        <div className="stats-section-title">Активность за 14 дней</div>
        <div className="stats-day-chart">
          {stats.byDay.map((d) => {
            const pct = maxDay > 0 ? (d.total_seconds / maxDay) * 100 : 0
            const isToday = d.date === new Date().toISOString().slice(0, 10)
            return (
              <div key={d.date} className="stats-day-col" title={`${shortDate(d.date)}: ${fmtSeconds(d.total_seconds)}`}>
                <div className="stats-day-bar-wrap">
                  <div
                    className={`stats-day-bar${isToday ? ' today' : ''}`}
                    style={{ height: `${Math.max(pct, d.total_seconds > 0 ? 4 : 0)}%` }}
                  />
                </div>
                <div className={`stats-day-label${isToday ? ' today' : ''}`}>
                  {shortDate(d.date).split(' ')[0]}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Subject breakdown */}
      <div className="stats-section">
        <div className="stats-section-title">По предметам</div>
        {stats.bySubject.length === 0 ? (
          <div className="stats-empty">Нет данных по предметам</div>
        ) : (
          <div className="stats-subject-list">
            {stats.bySubject.map((s) => {
              const pct = (s.total_seconds / maxSubject) * 100
              return (
                <div key={s.subject_id} className="stats-subject-row">
                  <div className="stats-subject-info">
                    <span className="stats-subject-dot" style={{ background: s.subject_color }} />
                    <span className="stats-subject-name">{s.subject_name}</span>
                    <span className="stats-subject-time">{fmtSeconds(s.total_seconds)}</span>
                  </div>
                  <div className="stats-subject-bar-track">
                    <div
                      className="stats-subject-bar-fill"
                      style={{ width: `${pct}%`, background: s.subject_color }}
                    />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
