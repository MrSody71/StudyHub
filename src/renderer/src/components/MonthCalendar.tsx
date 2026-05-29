import { useState } from 'react'
import type { Task, Subject } from '../types'

interface Props {
  allTasks:           Task[]
  subjects:           Subject[]
  onNavigateToTask:   (subjectId: number, taskId: number) => void
}

// ── Date helpers ──────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function todayStr(): string {
  return toDateStr(new Date())
}

/** Build the 42-cell (6×7) grid starting from the Monday of the week that contains the 1st. */
function buildGrid(year: number, month: number): Date[] {
  const first = new Date(year, month, 1)
  const startDow = (first.getDay() + 6) % 7   // 0 = Mon
  const start = new Date(year, month, 1 - startDow)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

const MONTH_NAMES_RU = [
  'Январь','Февраль','Март','Апрель','Май','Июнь',
  'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь',
]
const DOW_SHORT = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс']

const STATUS_LABELS: Record<string, string> = {
  not_started: 'Не начато',
  in_progress: 'В процессе',
  done:        'Выполнено',
}

// ─────────────────────────────────────────────────────────────────────────────

export default function MonthCalendar({ allTasks, subjects, onNavigateToTask }: Props) {
  const now = new Date()
  const [year, setYear]               = useState(now.getFullYear())
  const [month, setMonth]             = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const today = todayStr()

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11) }
    else setMonth(m => m - 1)
    setSelectedDate(null)
  }

  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0) }
    else setMonth(m => m + 1)
    setSelectedDate(null)
  }

  function goToday() {
    const n = new Date()
    setYear(n.getFullYear())
    setMonth(n.getMonth())
    setSelectedDate(today)
  }

  // Active tasks (not done) with deadline on a given date
  const activeTasks = allTasks.filter((t) => t.status !== 'done')

  function tasksForDate(dateStr: string): Task[] {
    return activeTasks.filter((t) => t.due_date === dateStr)
  }

  function subjectColor(subjectId: number): string {
    return subjects.find((s) => s.id === subjectId)?.color ?? '#6366f1'
  }

  function subjectName(subjectId: number): string {
    return subjects.find((s) => s.id === subjectId)?.name ?? ''
  }

  // Determine if we need to trim the 6th row (all days outside current month)
  const grid = buildGrid(year, month)
  const showSixthRow = grid.slice(35).some((d) => d.getMonth() === month)
  const cells = showSixthRow ? grid : grid.slice(0, 35)

  const selectedTasks = selectedDate ? tasksForDate(selectedDate) : []

  // Format selected date for panel header
  const selectedDateLabel = selectedDate
    ? new Date(selectedDate + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })
    : null

  return (
    <div className="calendar-outer">
      {/* ── Main calendar area ──────────────────────────────────────────── */}
      <div className="calendar-main">
        {/* Header */}
        <div className="calendar-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button className="cal-nav-btn" onClick={prevMonth} title="Предыдущий месяц">‹</button>
            <span className="calendar-month-title">
              {MONTH_NAMES_RU[month]} {year}
            </span>
            <button className="cal-nav-btn" onClick={nextMonth} title="Следующий месяц">›</button>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={goToday}>Сегодня</button>
        </div>

        {/* Day-of-week header */}
        <div className="calendar-dow-row">
          {DOW_SHORT.map((d, i) => (
            <div key={i} className={`calendar-dow-cell${i >= 5 ? ' weekend' : ''}`}>{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div className="calendar-grid" style={{ gridTemplateRows: `repeat(${cells.length / 7}, 1fr)` }}>
          {cells.map((date) => {
            const ds = toDateStr(date)
            const inMonth = date.getMonth() === month
            const isToday = ds === today
            const isSelected = ds === selectedDate
            const dayTasks = tasksForDate(ds)
            const visibleTasks = dayTasks.slice(0, 3)
            const extra = dayTasks.length - visibleTasks.length

            return (
              <div
                key={ds}
                className={[
                  'calendar-day',
                  !inMonth   ? 'other-month' : '',
                  isToday    ? 'today'        : '',
                  isSelected ? 'selected'     : '',
                ].filter(Boolean).join(' ')}
                onClick={() => setSelectedDate(isSelected ? null : ds)}
              >
                <div className={`calendar-day-num${isToday ? ' today-num' : ''}`}>
                  {date.getDate()}
                </div>

                {visibleTasks.length > 0 && (
                  <div className="calendar-day-tasks">
                    {visibleTasks.map((t) => {
                      const color = subjectColor(t.subject_id)
                      return (
                        <div
                          key={t.id}
                          className="calendar-task-chip"
                          style={{ background: color + '22', color, borderLeft: `3px solid ${color}` }}
                          title={t.title}
                          onClick={(e) => { e.stopPropagation(); onNavigateToTask(t.subject_id, t.id) }}
                        >
                          {t.title}
                        </div>
                      )
                    })}
                    {extra > 0 && (
                      <div className="calendar-task-more">+{extra} ещё</div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* ── Day detail panel ────────────────────────────────────────────── */}
      <div className="calendar-day-panel">
        {selectedDate ? (
          <>
            <div className="calendar-day-panel-header">
              <div className="calendar-day-panel-title">{selectedDateLabel}</div>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setSelectedDate(null)}
                title="Закрыть"
              >✕</button>
            </div>

            {selectedTasks.length === 0 ? (
              <div className="calendar-day-empty">
                <div style={{ fontSize: 32, opacity: .4 }}>✅</div>
                <div>Нет заданий на эту дату</div>
              </div>
            ) : (
              <div className="calendar-day-task-list">
                {selectedTasks.map((t) => {
                  const color = subjectColor(t.subject_id)
                  const sname = subjectName(t.subject_id)
                  return (
                    <div
                      key={t.id}
                      className="calendar-day-task-item"
                      onClick={() => onNavigateToTask(t.subject_id, t.id)}
                      title="Открыть задание"
                    >
                      <span className="calendar-task-subject-dot" style={{ background: color }} />
                      <div className="calendar-task-info">
                        <div className="calendar-task-title">{t.title}</div>
                        {sname && (
                          <div className="calendar-task-subject" style={{ color }}>{sname}</div>
                        )}
                      </div>
                      <span className={`badge badge-${t.status}`} style={{ fontSize: 10, flexShrink: 0 }}>
                        {STATUS_LABELS[t.status]}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </>
        ) : (
          <div className="calendar-day-empty" style={{ color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 36, opacity: .3 }}>📅</div>
            <div>Выберите день для просмотра заданий</div>
          </div>
        )}
      </div>
    </div>
  )
}
