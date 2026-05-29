import { useState } from 'react'
import type { Semester } from '../types'

interface Props {
  semesters:     Semester[]
  onCreate:      (data: { name: string; start_date?: string | null; end_date?: string | null }) => Promise<void>
  onUpdate:      (id: number, data: { name?: string; start_date?: string | null; end_date?: string | null }) => Promise<void>
  onDelete:      (id: number) => Promise<void>
  onSetActive:   (id: number | null) => Promise<void>
  onClose:       () => void
}

interface FormState {
  name:       string
  start_date: string
  end_date:   string
}

const EMPTY: FormState = { name: '', start_date: '', end_date: '' }

function fmtDate(d: string | null): string {
  if (!d) return '—'
  return new Date(d + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function SemesterManager({ semesters, onCreate, onUpdate, onDelete, onSetActive, onClose }: Props) {
  const [form,    setForm]    = useState<FormState>(EMPTY)
  const [editing, setEditing] = useState<Semester | null>(null)
  const [saving,  setSaving]  = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)

  function openEdit(s: Semester) {
    setEditing(s)
    setForm({ name: s.name, start_date: s.start_date ?? '', end_date: s.end_date ?? '' })
  }

  function closeForm() {
    setEditing(null)
    setForm(EMPTY)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const payload = {
        name:       form.name.trim(),
        start_date: form.start_date || null,
        end_date:   form.end_date   || null,
      }
      if (editing) {
        await onUpdate(editing.id, payload)
      } else {
        await onCreate(payload)
      }
      closeForm()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: number) {
    setConfirm(null)
    await onDelete(id)
  }

  const active = semesters.find((s) => s.is_active === 1)

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal semester-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Семестры</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body">
          {/* Active semester banner */}
          {active && (
            <div className="semester-active-banner">
              <span className="semester-active-dot" />
              Активный: <strong>{active.name}</strong>
              <button
                className="btn btn-ghost btn-sm"
                style={{ marginLeft: 'auto', fontSize: 11 }}
                onClick={() => onSetActive(null)}
                title="Снять активный семестр"
              >
                Сбросить
              </button>
            </div>
          )}

          {/* List */}
          <div className="semester-list">
            {semesters.length === 0 && (
              <div className="dash-empty" style={{ padding: '16px 0' }}>Семестров нет</div>
            )}
            {semesters.map((s) => (
              <div key={s.id} className={`semester-item${s.is_active ? ' active' : ''}`}>
                <div className="semester-item-main">
                  {s.is_active === 1 && <span className="semester-active-dot" />}
                  <div>
                    <div className="semester-item-name">{s.name}</div>
                    <div className="semester-item-dates">
                      {fmtDate(s.start_date)} — {fmtDate(s.end_date)}
                    </div>
                  </div>
                </div>
                <div className="semester-item-actions">
                  {s.is_active === 0 && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ fontSize: 11 }}
                      onClick={() => onSetActive(s.id)}
                      title="Сделать активным"
                    >
                      Активный
                    </button>
                  )}
                  <button className="icon-btn" title="Редактировать" onClick={() => openEdit(s)}>✏</button>
                  {confirm === s.id ? (
                    <>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(s.id)}>Да</button>
                      <button className="btn btn-ghost btn-sm"  onClick={() => setConfirm(null)}>Нет</button>
                    </>
                  ) : (
                    <button className="icon-btn danger" title="Удалить" onClick={() => setConfirm(s.id)}>🗑</button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Create / edit form */}
          <div className="semester-form-section">
            <div className="semester-form-title">{editing ? 'Редактировать семестр' : 'Новый семестр'}</div>
            <form onSubmit={handleSubmit} className="semester-form">
              <input
                className="form-input"
                placeholder="Название (например «Осень 2025»)"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                maxLength={80}
                required
              />
              <div className="semester-form-dates">
                <div>
                  <label className="form-label">Начало</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.start_date}
                    onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="form-label">Конец</label>
                  <input
                    type="date"
                    className="form-input"
                    value={form.end_date}
                    onChange={(e) => setForm((f) => ({ ...f, end_date: e.target.value }))}
                  />
                </div>
              </div>
              <div className="semester-form-actions">
                {editing && (
                  <button type="button" className="btn btn-ghost btn-sm" onClick={closeForm}>Отмена</button>
                )}
                <button type="submit" className="btn btn-primary btn-sm" disabled={saving || !form.name.trim()}>
                  {saving ? 'Сохраняем…' : editing ? 'Сохранить' : 'Добавить'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
