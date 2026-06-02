import { useState } from 'react'
import type { ScheduleEntry, Subject, BatchImportEntry, BatchImportResult } from '../types'
import TulguImportDialog from './TulguImportDialog'

interface Props {
  entries:        ScheduleEntry[]
  subjects:       Subject[]
  onCreate:       (data: Omit<ScheduleEntry, 'id' | 'created_at'>) => void
  onUpdate:       (id: number, data: Partial<Omit<ScheduleEntry, 'id' | 'created_at'>>) => void
  onDelete:       (id: number) => void
  onBatchImport:  (entries: BatchImportEntry[], replace: boolean) => Promise<BatchImportResult>
}

// ── Time helpers ──────────────────────────────────────────────────────────────

const HOUR_H    = 64   // px per hour
const START_H   = 7    // grid starts at 07:00
const END_H     = 22   // grid ends at 22:00 (exclusive)
const HOURS     = Array.from({ length: END_H - START_H }, (_, i) => START_H + i)

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']
const DAYS_FULL  = ['Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота', 'Воскресенье']

function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function minToTime(m: number): string {
  const h = Math.floor(m / 60)
  const min = m % 60
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`
}

function entryTop(e: ScheduleEntry): number {
  return Math.max(0, (timeToMin(e.start_time) - START_H * 60) / 60 * HOUR_H)
}

function entryHeight(e: ScheduleEntry): number {
  const dur = timeToMin(e.end_time) - timeToMin(e.start_time)
  return Math.max(28, dur / 60 * HOUR_H)
}

// Compute today's day-of-week index (0 = Mon … 6 = Sun)
function todayDow(): number {
  return (new Date().getDay() + 6) % 7
}

// Current week's date for a given dow index
function weekDate(dow: number): Date {
  const today = new Date()
  const currentDow = (today.getDay() + 6) % 7
  const d = new Date(today)
  d.setDate(today.getDate() - currentDow + dow)
  return d
}

// ── Entry color ───────────────────────────────────────────────────────────────

function entryColor(entry: ScheduleEntry, subjects: Subject[]): string {
  if (entry.subject_id) {
    const s = subjects.find((s) => s.id === entry.subject_id)
    if (s) return s.color
  }
  return '#6366f1'
}

// ── Overlap layout ────────────────────────────────────────────────────────────

interface LayoutEntry {
  entry:     ScheduleEntry
  col:       number
  totalCols: number
}

function layoutDay(entries: ScheduleEntry[]): LayoutEntry[] {
  const sorted = [...entries].sort((a, b) => a.start_time.localeCompare(b.start_time))
  const cols: number[] = []   // tracks end minute of the last entry in each column

  const result: LayoutEntry[] = sorted.map((entry) => {
    const startMin = timeToMin(entry.start_time)
    let col = cols.findIndex((endMin) => endMin <= startMin)
    if (col === -1) { col = cols.length; cols.push(0) }
    cols[col] = timeToMin(entry.end_time)
    return { entry, col, totalCols: 0 }
  })

  // Second pass: compute totalCols per overlap group
  for (let i = 0; i < result.length; i++) {
    const a = result[i]
    let maxCol = a.col
    for (let j = 0; j < result.length; j++) {
      if (i === j) continue
      const b = result[j]
      const overlapStart = Math.max(timeToMin(a.entry.start_time), timeToMin(b.entry.start_time))
      const overlapEnd   = Math.min(timeToMin(a.entry.end_time),   timeToMin(b.entry.end_time))
      if (overlapEnd > overlapStart) maxCol = Math.max(maxCol, b.col)
    }
    a.totalCols = maxCol + 1
  }

  return result
}

// ─────────────────────────────────────────────────────────────────────────────

export default function WeeklySchedule({ entries, subjects, onCreate, onUpdate, onDelete, onBatchImport }: Props) {
  const [showModal, setShowModal]         = useState(false)
  const [showImport, setShowImport]       = useState(false)
  const [editing, setEditing]             = useState<ScheduleEntry | null>(null)
  const [formTitle, setFormTitle]         = useState('')
  const [formDay, setFormDay]             = useState(0)
  const [formStart, setFormStart]         = useState('09:00')
  const [formEnd, setFormEnd]             = useState('10:30')
  const [formSubject, setFormSubject]     = useState<number | ''>('')
  const [formLocation, setFormLocation]   = useState('')
  const [formTeacher, setFormTeacher]     = useState('')
  const [saving, setSaving]               = useState(false)

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
      else onCreate(data)
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  function handleDelete(e: ScheduleEntry) {
    if (!confirm(`Удалить занятие «${e.title}»?`)) return
    onDelete(e.id)
  }

  function handleDayColumnClick(e: React.MouseEvent<HTMLDivElement>, dow: number) {
    if ((e.target as HTMLElement).closest('.schedule-entry')) return
    const rect = e.currentTarget.getBoundingClientRect()
    const y    = e.clientY - rect.top
    const rawMin  = Math.round((y / HOUR_H) * 60 / 15) * 15
    const startMin = START_H * 60 + rawMin
    const endMin   = startMin + 90
    openCreate(dow, minToTime(startMin), minToTime(Math.min(endMin, END_H * 60)))
  }

  const todayIndex = todayDow()

  return (
    <>
      <div className="schedule-outer">
        {/* Header row */}
        <div className="panel-header">
          <div className="panel-title">🗓 Расписание на неделю</div>
          <div className="panel-actions">
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

        {/* Day name headers */}
        <div className="schedule-col-headers">
          <div className="schedule-time-gutter" />
          {DAYS_SHORT.map((d, i) => {
            const date = weekDate(i)
            const isToday = i === todayIndex
            return (
              <div key={i} className={`schedule-col-hdr${isToday ? ' today' : ''}`}>
                <span className="schedule-col-hdr-day">{d}</span>
                <span className="schedule-col-hdr-date">
                  {date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}
                </span>
                {isToday && <span className="schedule-today-badge">Сегодня</span>}
              </div>
            )
          })}
        </div>

        {/* Scrollable body */}
        <div className="schedule-body">
          {/* Time axis */}
          <div className="schedule-time-axis">
            {HOURS.map((h) => (
              <div key={h} className="schedule-hour-label">
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>

          {/* Day columns */}
          {DAYS_SHORT.map((_, dow) => {
            const dayEntries = entries.filter((e) => e.day_of_week === dow)
            const laid = layoutDay(dayEntries)
            const isToday = dow === todayIndex

            return (
              <div
                key={dow}
                className={`schedule-day-col${isToday ? ' today' : ''}`}
                style={{ minHeight: (END_H - START_H) * HOUR_H }}
                onClick={(e) => handleDayColumnClick(e, dow)}
              >
                {/* Hour grid lines */}
                {HOURS.map((h) => (
                  <div key={h} className="schedule-grid-line" />
                ))}

                {/* Half-hour dividers */}
                {HOURS.map((h) => (
                  <div
                    key={`h${h}`}
                    className="schedule-half-line"
                    style={{ top: (h - START_H) * HOUR_H + HOUR_H / 2 }}
                  />
                ))}

                {/* Entries */}
                {laid.map(({ entry, col, totalCols }) => {
                  const color = entryColor(entry, subjects)
                  const width = totalCols > 1 ? `calc(${100 / totalCols}% - 4px)` : 'calc(100% - 4px)'
                  const left  = totalCols > 1 ? `calc(${(col / totalCols) * 100}% + 2px)` : '2px'

                  return (
                    <div
                      key={entry.id}
                      className="schedule-entry"
                      style={{
                        top:    entryTop(entry),
                        height: entryHeight(entry),
                        left,
                        width,
                        background:  color + '22',
                        borderColor: color,
                        color,
                      }}
                      onClick={(e) => { e.stopPropagation(); openEdit(entry) }}
                    >
                      <div className="schedule-entry-title">{entry.title}</div>
                      <div className="schedule-entry-time">
                        {entry.start_time}–{entry.end_time}
                      </div>
                      {entry.location && (
                        <div className="schedule-entry-location">📍 {entry.location}</div>
                      )}
                      {entry.teacher && (
                        <div className="schedule-entry-location">👤 {entry.teacher}</div>
                      )}
                      <button
                        className="schedule-entry-del"
                        onClick={(e) => { e.stopPropagation(); handleDelete(entry) }}
                        title="Удалить"
                      >✕</button>
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>

      {/* Add / edit modal */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
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
                    onChange={(e) => setFormTitle(e.target.value)}
                    placeholder="Математика, Лекция, Практика…"
                    maxLength={120}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Предмет</label>
                  <select
                    className="form-select"
                    value={formSubject}
                    onChange={(e) => setFormSubject(e.target.value === '' ? '' : Number(e.target.value))}
                  >
                    <option value="">— Без предмета —</option>
                    {subjects.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">День недели</label>
                  <select
                    className="form-select"
                    value={formDay}
                    onChange={(e) => setFormDay(Number(e.target.value))}
                  >
                    {DAYS_FULL.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Начало</label>
                    <input
                      className="form-input"
                      type="time"
                      value={formStart}
                      onChange={(e) => setFormStart(e.target.value)}
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label className="form-label">Конец</label>
                    <input
                      className="form-input"
                      type="time"
                      value={formEnd}
                      onChange={(e) => setFormEnd(e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Аудитория / место</label>
                  <input
                    className="form-input"
                    value={formLocation}
                    onChange={(e) => setFormLocation(e.target.value)}
                    placeholder="Ауд. 301, Корпус А…"
                    maxLength={80}
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Преподаватель</label>
                  <input
                    className="form-input"
                    value={formTeacher}
                    onChange={(e) => setFormTeacher(e.target.value)}
                    placeholder="Иванов И.И."
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="modal-footer">
                {editing && (
                  <button
                    type="button"
                    className="btn btn-danger"
                    style={{ marginRight: 'auto' }}
                    onClick={() => { handleDelete(editing); closeModal() }}
                  >
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
        <TulguImportDialog
          onImport={onBatchImport}
          onClose={() => setShowImport(false)}
        />
      )}
    </>
  )
}
