import { useState } from 'react'
import type { ScheduleEntry, Subject, BatchImportEntry, BatchImportResult } from '../types'
import TulguImportDialog from './TulguImportDialog'

interface Props {
  entries:       ScheduleEntry[]
  subjects:      Subject[]
  onCreate:      (data: Omit<ScheduleEntry, 'id' | 'created_at'>) => void
  onUpdate:      (id: number, data: Partial<Omit<ScheduleEntry, 'id' | 'created_at'>>) => void
  onDelete:      (id: number) => void
  onBatchImport: (entries: BatchImportEntry[], replace: boolean) => Promise<BatchImportResult>
}

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб']
const DAYS_FULL  = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']
const DAYS_ALL   = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const MONTHS_RU  = ['Январь','Февраль','Март','Апрель','Май','Июнь',
                    'Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь']

type ViewMode = 'week' | 'month'

// ── Helpers ───────────────────────────────────────────────────────────────────

function todayDow(): number {
  return (new Date().getDay() + 6) % 7
}

function weekDate(dow: number): Date {
  const today = new Date()
  const currentDow = (today.getDay() + 6) % 7
  const d = new Date(today)
  d.setDate(today.getDate() - currentDow + dow)
  return d
}

function getTimeSlots(entries: ScheduleEntry[]): Array<{ start: string; end: string }> {
  const seen = new Set<string>()
  const slots: Array<{ start: string; end: string }> = []
  for (const e of entries) {
    const key = `${e.start_time}|${e.end_time}`
    if (!seen.has(key)) { seen.add(key); slots.push({ start: e.start_time, end: e.end_time }) }
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start))
}

function lessonTypeStyle(title: string): { bg: string; accent: string } {
  const t = title.toLowerCase()
  if (/лекц/.test(t))  return { bg: 'rgba(59,130,246,.10)',  accent: '#3b82f6' }
  if (/лаб/.test(t))   return { bg: 'rgba(249,115,22,.10)',  accent: '#f97316' }
  if (/практ/.test(t)) return { bg: 'rgba(34,197,94,.10)',   accent: '#22c55e' }
  return                       { bg: 'rgba(107,114,128,.08)', accent: '#9ca3af' }
}

/** Build a 42-cell (6 weeks) flat array starting from Monday of the week
 *  that contains the 1st of the given month. */
function buildMonthGrid(year: number, month: number): Date[] {
  const firstDay = new Date(year, month, 1)
  const startDow = (firstDay.getDay() + 6) % 7   // shift so Mon=0
  const start = new Date(year, month, 1 - startDow)
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start)
    d.setDate(start.getDate() + i)
    return d
  })
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate()
}

// ─────────────────────────────────────────────────────────────────────────────

export default function WeeklySchedule({ entries, subjects, onCreate, onUpdate, onDelete, onBatchImport }: Props) {
  // ── View mode ──────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>('week')

  // ── Month navigation ───────────────────────────────────────────────────────
  const [monthDate, setMonthDate] = useState<Date>(() => {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d
  })
  const [dayPopup, setDayPopup] = useState<{ date: Date; entries: ScheduleEntry[] } | null>(null)

  function prevMonth() { setMonthDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1)) }
  function nextMonth() { setMonthDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1)) }
  function goToday()   {
    const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0)
    setMonthDate(d)
  }

  function getDayEntries(date: Date): ScheduleEntry[] {
    const dow = (date.getDay() + 6) % 7
    return entries.filter(e => e.day_of_week === dow)
  }

  function openDayPopup(date: Date) {
    setDayPopup({ date, entries: getDayEntries(date) })
  }

  // ── Add / edit modal state ─────────────────────────────────────────────────
  const [showModal, setShowModal]       = useState(false)
  const [showImport, setShowImport]     = useState(false)
  const [editing, setEditing]           = useState<ScheduleEntry | null>(null)
  const [formTitle, setFormTitle]       = useState('')
  const [formDay, setFormDay]           = useState(0)
  const [formStart, setFormStart]       = useState('09:00')
  const [formEnd, setFormEnd]           = useState('10:30')
  const [formSubject, setFormSubject]   = useState<number | ''>('')
  const [formLocation, setFormLocation] = useState('')
  const [formTeacher, setFormTeacher]   = useState('')
  const [saving, setSaving]             = useState(false)

  function openCreate(day?: number, start?: string, end?: string) {
    setEditing(null)
    setFormTitle('')
    setFormDay(day ?? todayDow())
    setFormStart(start ?? '09:00')
    setFormEnd(end ?? '10:30')
    setFormSubject('')
    setFormLocation('')
    setFormTeacher('')
    setShowModal(true)
  }

  function openEdit(e: ScheduleEntry) {
    setEditing(e)
    setFormTitle(e.title)
    setFormDay(e.day_of_week)
    setFormStart(e.start_time)
    setFormEnd(e.end_time)
    setFormSubject(e.subject_id ?? '')
    setFormLocation(e.location ?? '')
    setFormTeacher(e.teacher ?? '')
    setShowModal(true)
  }

  function closeModal() { setShowModal(false); setEditing(null) }

  async function handleSubmit(ev: React.FormEvent) {
    ev.preventDefault()
    if (!formTitle.trim()) return
    setSaving(true)
    try {
      const data = {
        subject_id:  formSubject === '' ? null : Number(formSubject),
        title:       formTitle.trim(),
        day_of_week: formDay,
        start_time:  formStart,
        end_time:    formEnd,
        location:    formLocation.trim() || null,
        teacher:     formTeacher.trim() || null,
      }
      if (editing) onUpdate(editing.id, data)
      else         onCreate(data)
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(e: ScheduleEntry) {
    if (!confirm(`Удалить занятие «${e.title}»?`)) return
    onDelete(e.id)
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const todayIndex = todayDow()
  const slots      = getTimeSlots(entries)
  const today      = new Date(); today.setHours(0, 0, 0, 0)

  // ── Month grid ─────────────────────────────────────────────────────────────
  const monthGrid  = buildMonthGrid(monthDate.getFullYear(), monthDate.getMonth())

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="schedule-outer">
        {/* Header */}
        <div className="panel-header">
          <div className="panel-title">🗓 Расписание</div>
          <div className="panel-actions">
            {/* View toggle */}
            <div className="sched-view-toggle">
              <button
                className={`sched-view-btn${viewMode === 'week' ? ' active' : ''}`}
                onClick={() => setViewMode('week')}
              >Неделя</button>
              <button
                className={`sched-view-btn${viewMode === 'month' ? ' active' : ''}`}
                onClick={() => setViewMode('month')}
              >Месяц</button>
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowImport(true)}
              title="Импортировать расписание из API ТулГУ"
            >
              ↓ Импорт из ТулГУ
            </button>
            <button className="btn btn-primary btn-sm" onClick={() => openCreate()}>+ Занятие</button>
          </div>
        </div>

        {/* ── Week view ───────────────────────────────────────────────────── */}
        {viewMode === 'week' && (
          <div className="sched-table-wrap">
            {entries.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📋</div>
                <div style={{ fontSize: 14 }}>Расписание пусто</div>
                <div style={{ fontSize: 12, marginTop: 6, color: 'var(--text-tertiary)' }}>
                  Добавьте занятие вручную или импортируйте из ТулГУ
                </div>
              </div>
            ) : (
              <table className="sched-table">
                <thead>
                  <tr>
                    <th className="sched-th sched-time-th">Время</th>
                    {DAYS_SHORT.map((d, i) => {
                      const date = weekDate(i)
                      const isToday = i === todayIndex
                      return (
                        <th key={i} className={`sched-th sched-day-th${isToday ? ' sched-today' : ''}`}>
                          <span className="sched-day-name">{d}</span>
                          <span className="sched-day-date">
                            {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                          </span>
                          {isToday && <span className="sched-today-pill">Сегодня</span>}
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody>
                  {slots.map((slot) => (
                    <tr key={`${slot.start}|${slot.end}`}>
                      <td className="sched-td sched-time-td">
                        <span className="sched-slot-start">{slot.start}</span>
                        <span className="sched-slot-sep">–</span>
                        <span className="sched-slot-end">{slot.end}</span>
                      </td>
                      {DAYS_SHORT.map((_, dow) => {
                        const cellEntries = entries.filter(
                          e => e.day_of_week === dow && e.start_time === slot.start && e.end_time === slot.end
                        )
                        const isToday = dow === todayIndex
                        return (
                          <td
                            key={dow}
                            className={`sched-td sched-cell${isToday ? ' sched-today' : ''}`}
                            onClick={() => { if (cellEntries.length === 0) openCreate(dow, slot.start, slot.end) }}
                            title={cellEntries.length === 0 ? 'Добавить занятие' : undefined}
                          >
                            {cellEntries.map((entry, idx) => {
                              const { bg, accent } = lessonTypeStyle(entry.title)
                              return (
                                <div key={entry.id}>
                                  {idx > 0 && <div className="sched-lesson-divider" />}
                                  <div
                                    className="sched-lesson"
                                    style={{ background: bg, borderLeftColor: accent }}
                                    onClick={e => { e.stopPropagation(); openEdit(entry) }}
                                  >
                                    <div className="sched-lesson-title">{entry.title}</div>
                                    {entry.location && <div className="sched-lesson-meta">📍 {entry.location}</div>}
                                    {entry.teacher  && <div className="sched-lesson-meta">👤 {entry.teacher}</div>}
                                    <button
                                      className="sched-lesson-del"
                                      onClick={e => { e.stopPropagation(); handleDelete(entry) }}
                                      title="Удалить"
                                    >✕</button>
                                  </div>
                                </div>
                              )
                            })}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── Month view ──────────────────────────────────────────────────── */}
        {viewMode === 'month' && (
          <div className="cal-wrap">
            {/* Month navigation */}
            <div className="cal-nav">
              <button className="btn btn-ghost btn-sm" onClick={prevMonth}>‹</button>
              <span className="cal-nav-title">
                {MONTHS_RU[monthDate.getMonth()]} {monthDate.getFullYear()}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={nextMonth}>›</button>
              <button
                className="btn btn-secondary btn-sm"
                style={{ marginLeft: 8 }}
                onClick={goToday}
              >
                Сегодня
              </button>
            </div>

            {/* Calendar grid */}
            <div className="cal-grid-wrap">
              <table className="cal-table">
                <thead>
                  <tr>
                    {DAYS_ALL.map(d => (
                      <th key={d} className="cal-hdr">{d}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 6 }, (_, row) => (
                    <tr key={row}>
                      {Array.from({ length: 7 }, (_, col) => {
                        const date      = monthGrid[row * 7 + col]
                        const inMonth   = date.getMonth() === monthDate.getMonth()
                        const isToday   = sameDay(date, today)
                        const dayEntries = getDayEntries(date)

                        return (
                          <td
                            key={col}
                            className={[
                              'cal-cell',
                              inMonth ? '' : 'cal-other-month',
                              isToday  ? 'cal-today' : '',
                            ].join(' ')}
                            onClick={() => openDayPopup(date)}
                          >
                            <div className="cal-date-num">{date.getDate()}</div>
                            {dayEntries.slice(0, 3).map(entry => {
                              const { accent } = lessonTypeStyle(entry.title)
                              const label = entry.title.split('(')[0].trim()
                              return (
                                <div
                                  key={entry.id}
                                  className="cal-chip"
                                  style={{ borderLeftColor: accent, background: accent + '18' }}
                                  onClick={e => { e.stopPropagation(); openDayPopup(date) }}
                                  title={entry.title}
                                >
                                  {label}
                                </div>
                              )
                            })}
                            {dayEntries.length > 3 && (
                              <div className="cal-chip-more">+{dayEntries.length - 3}</div>
                            )}
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* ── Day detail popup ──────────────────────────────────────────────── */}
      {dayPopup && (
        <div className="modal-overlay" onClick={() => setDayPopup(null)}>
          <div className="modal" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title" style={{ textTransform: 'capitalize' }}>
                {dayPopup.date.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={() => setDayPopup(null)}>✕</button>
            </div>
            <div className="modal-body" style={{ maxHeight: 420, overflowY: 'auto' }}>
              {dayPopup.entries.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Занятий нет</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {dayPopup.entries
                    .slice()
                    .sort((a, b) => a.start_time.localeCompare(b.start_time))
                    .map(entry => {
                      const { bg, accent } = lessonTypeStyle(entry.title)
                      return (
                        <div
                          key={entry.id}
                          style={{
                            background: bg,
                            borderLeft: `3px solid ${accent}`,
                            borderRadius: 6,
                            padding: '10px 12px',
                          }}
                        >
                          <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-primary)', marginBottom: 4 }}>
                            {entry.title}
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
                            <div>🕐 {entry.start_time}–{entry.end_time}</div>
                            {entry.location && <div>📍 {entry.location}</div>}
                            {entry.teacher  && <div>👤 {entry.teacher}</div>}
                          </div>
                        </div>
                      )
                    })}
                </div>
              )}
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => {
                  const dow = (dayPopup.date.getDay() + 6) % 7
                  setDayPopup(null)
                  openCreate(dow)
                }}
              >
                + Занятие
              </button>
              <button className="btn btn-primary" onClick={() => setDayPopup(null)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add / edit modal ──────────────────────────────────────────────── */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">{editing ? 'Редактировать занятие' : 'Новое занятие'}</span>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Название *</label>
                  <input
                    className="form-input"
                    autoFocus
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="Математика (Лекция), Физика (Лаб)…"
                    maxLength={120}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Предмет</label>
                  <select
                    className="form-select"
                    value={formSubject}
                    onChange={e => setFormSubject(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">— Без предмета —</option>
                    {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">День недели</label>
                  <select
                    className="form-select"
                    value={formDay}
                    onChange={e => setFormDay(Number(e.target.value))}
                  >
                    {DAYS_FULL.map((d, i) => <option key={i} value={i}>{d}</option>)}
                  </select>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Начало</label>
                    <input className="form-input" type="time" value={formStart}
                      onChange={e => setFormStart(e.target.value)} required />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Конец</label>
                    <input className="form-input" type="time" value={formEnd}
                      onChange={e => setFormEnd(e.target.value)} required />
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Аудитория / место</label>
                  <input className="form-input" value={formLocation}
                    onChange={e => setFormLocation(e.target.value)}
                    placeholder="Ауд. 301, Корпус А…" maxLength={80} />
                </div>
                <div className="form-group">
                  <label className="form-label">Преподаватель</label>
                  <input className="form-input" value={formTeacher}
                    onChange={e => setFormTeacher(e.target.value)}
                    placeholder="Иванов И.И." maxLength={120} />
                </div>
              </div>
              <div className="modal-footer">
                {editing && (
                  <button type="button" className="btn btn-danger" style={{ marginRight: 'auto' }}
                    onClick={() => { handleDelete(editing); closeModal() }}>
                    Удалить
                  </button>
                )}
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !formTitle.trim()}>
                  {saving ? 'Сохраняем…' : editing ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ТулГУ import dialog */}
      {showImport && (
        <TulguImportDialog onImport={onBatchImport} onClose={() => setShowImport(false)} />
      )}
    </>
  )
}
