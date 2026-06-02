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

/** Extract sorted unique time slots from entries */
function getTimeSlots(entries: ScheduleEntry[]): Array<{ start: string; end: string }> {
  const seen = new Set<string>()
  const slots: Array<{ start: string; end: string }> = []
  for (const e of entries) {
    const key = `${e.start_time}|${e.end_time}`
    if (!seen.has(key)) {
      seen.add(key)
      slots.push({ start: e.start_time, end: e.end_time })
    }
  }
  return slots.sort((a, b) => a.start.localeCompare(b.start))
}

/** Cell accent color derived from lesson type keyword in the title */
function lessonTypeStyle(title: string): { bg: string; accent: string } {
  const t = title.toLowerCase()
  if (/лекц/.test(t))  return { bg: 'rgba(59,130,246,.10)',  accent: '#3b82f6' }
  if (/лаб/.test(t))   return { bg: 'rgba(249,115,22,.10)',  accent: '#f97316' }
  if (/практ/.test(t)) return { bg: 'rgba(34,197,94,.10)',   accent: '#22c55e' }
  return                       { bg: 'rgba(107,114,128,.08)', accent: '#9ca3af' }
}

// ─────────────────────────────────────────────────────────────────────────────

export default function WeeklySchedule({ entries, subjects, onCreate, onUpdate, onDelete, onBatchImport }: Props) {
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

  const todayIndex = todayDow()
  const slots = getTimeSlots(entries)

  return (
    <>
      <div className="schedule-outer">
        {/* Header */}
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

        {/* Table */}
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
                    {/* Time slot label */}
                    <td className="sched-td sched-time-td">
                      <span className="sched-slot-start">{slot.start}</span>
                      <span className="sched-slot-sep">–</span>
                      <span className="sched-slot-end">{slot.end}</span>
                    </td>

                    {/* Day cells */}
                    {DAYS_SHORT.map((_, dow) => {
                      const cellEntries = entries.filter(
                        (e) => e.day_of_week === dow && e.start_time === slot.start && e.end_time === slot.end
                      )
                      const isToday = dow === todayIndex

                      return (
                        <td
                          key={dow}
                          className={`sched-td sched-cell${isToday ? ' sched-today' : ''}`}
                          onClick={() => {
                            if (cellEntries.length === 0) openCreate(dow, slot.start, slot.end)
                          }}
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
                                  onClick={(e) => { e.stopPropagation(); openEdit(entry) }}
                                >
                                  <div className="sched-lesson-title">{entry.title}</div>
                                  {entry.location && (
                                    <div className="sched-lesson-meta">📍 {entry.location}</div>
                                  )}
                                  {entry.teacher && (
                                    <div className="sched-lesson-meta">👤 {entry.teacher}</div>
                                  )}
                                  <button
                                    className="sched-lesson-del"
                                    onClick={(e) => { e.stopPropagation(); handleDelete(entry) }}
                                    title="Удалить"
                                  >
                                    ✕
                                  </button>
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
