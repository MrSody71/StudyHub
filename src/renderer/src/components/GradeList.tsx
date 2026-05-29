import { useState } from 'react'
import type { Grade, Subject } from '../types'

interface Props {
  subject:    Subject
  grades:     Grade[]
  scale:      number          // display scale (5 or 100)
  onCreate:   (data: Omit<Grade, 'id' | 'created_at'>) => void
  onUpdate:   (id: number, data: Partial<Omit<Grade, 'id' | 'created_at' | 'subject_id'>>) => void
  onDelete:   (id: number) => void
}

// ── Math helpers ──────────────────────────────────────────────────────────────

function weightedAvg(grades: Grade[]): number | null {
  if (grades.length === 0) return null
  const totalWeight = grades.reduce((s, g) => s + g.weight, 0)
  if (totalWeight === 0) return null
  const sum = grades.reduce((s, g) => s + (g.value / g.max_value) * g.weight, 0)
  return sum / totalWeight
}

function fmtScore(ratio: number, scale: number): string {
  return (ratio * scale).toFixed(scale <= 10 ? 2 : 1)
}

function gradeColor(ratio: number): string {
  if (ratio >= 0.85) return '#22c55e'
  if (ratio >= 0.70) return '#3b82f6'
  if (ratio >= 0.55) return '#f59e0b'
  return '#ef4444'
}

// ── Modal ─────────────────────────────────────────────────────────────────────

interface ModalProps {
  editing:    Grade | null
  subject:    Subject
  scale:      number
  onSubmit:   (data: Omit<Grade, 'id' | 'created_at'>) => void
  onDelete?:  () => void
  onClose:    () => void
}

function GradeModal({ editing, subject, scale, onSubmit, onDelete, onClose }: ModalProps) {
  const [title,    setTitle]    = useState(editing?.title     ?? '')
  const [value,    setValue]    = useState(String(editing?.value    ?? ''))
  const [maxValue, setMaxValue] = useState(String(editing?.max_value ?? scale))
  const [weight,   setWeight]   = useState(String(editing?.weight   ?? 1))
  const [date,     setDate]     = useState(editing?.date ?? '')
  const [saving,   setSaving]   = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const v  = parseFloat(value)
    const mv = parseFloat(maxValue)
    const w  = parseFloat(weight)
    if (!title.trim() || isNaN(v) || isNaN(mv) || mv <= 0 || isNaN(w) || w <= 0) return
    if (v < 0 || v > mv) return
    setSaving(true)
    try {
      onSubmit({
        subject_id: subject.id,
        title:      title.trim(),
        value:      v,
        max_value:  mv,
        weight:     w,
        date:       date || null,
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  const v  = parseFloat(value)
  const mv = parseFloat(maxValue)
  const valid = title.trim() && !isNaN(v) && !isNaN(mv) && mv > 0 && v >= 0 && v <= mv
  const previewRatio = valid ? v / mv : null

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 420 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">{editing ? 'Редактировать оценку' : 'Новая оценка'}</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="modal-body">
            <div className="form-group">
              <label className="form-label">Название *</label>
              <input
                className="form-input"
                autoFocus
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Контрольная работа, Экзамен, Доклад…"
                maxLength={120}
                required
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Оценка *</label>
                <input
                  className="form-input"
                  type="number"
                  step="any"
                  min={0}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder={`0–${maxValue}`}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Максимум *</label>
                <input
                  className="form-input"
                  type="number"
                  step="any"
                  min={0.01}
                  value={maxValue}
                  onChange={(e) => setMaxValue(e.target.value)}
                  required
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label className="form-label">Вес</label>
                <input
                  className="form-input"
                  type="number"
                  step="0.5"
                  min={0.1}
                  max={10}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Дата</label>
                <input
                  className="form-input"
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </div>
            </div>

            {previewRatio !== null && (
              <div className="grade-modal-preview" style={{ color: gradeColor(previewRatio) }}>
                {fmtScore(previewRatio, scale)} / {scale} по шкале {scale}
                <span style={{ opacity: .6, marginLeft: 6 }}>({Math.round(previewRatio * 100)}%)</span>
              </div>
            )}
          </div>

          <div className="modal-footer">
            {editing && onDelete && (
              <button
                type="button"
                className="btn btn-danger"
                style={{ marginRight: 'auto' }}
                onClick={() => { onDelete(); onClose() }}
              >
                Удалить
              </button>
            )}
            <button type="button" className="btn btn-secondary" onClick={onClose}>Отмена</button>
            <button type="submit" className="btn btn-primary" disabled={saving || !valid}>
              {saving ? 'Сохраняем…' : editing ? 'Сохранить' : 'Добавить'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GradeList({ subject, grades, scale, onCreate, onUpdate, onDelete }: Props) {
  const [editing, setEditing] = useState<Grade | null>(null)
  const [showModal, setShowModal] = useState(false)

  const avg = weightedAvg(grades)
  const color = subject.color

  function openCreate() { setEditing(null); setShowModal(true) }
  function openEdit(g: Grade) { setEditing(g); setShowModal(true) }
  function closeModal() { setShowModal(false); setEditing(null) }

  function handleSubmit(data: Omit<Grade, 'id' | 'created_at'>) {
    if (editing) onUpdate(editing.id, { title: data.title, value: data.value, max_value: data.max_value, weight: data.weight, date: data.date })
    else onCreate(data)
  }

  return (
    <div className="grade-panel">
      {showModal && (
        <GradeModal
          editing={editing}
          subject={subject}
          scale={scale}
          onSubmit={handleSubmit}
          onDelete={editing ? () => onDelete(editing.id) : undefined}
          onClose={closeModal}
        />
      )}

      {/* Header */}
      <div className="panel-header">
        <div className="panel-title" style={{ color }}>
          <span style={{ display: 'inline-block', width: 10, height: 10, borderRadius: '50%', background: color, marginRight: 8, verticalAlign: 'middle' }} />
          {subject.name} — Оценки
        </div>
        <div className="panel-actions">
          <button className="btn btn-primary btn-sm" onClick={openCreate}>+ Оценка</button>
        </div>
      </div>

      {/* Weighted average card */}
      {avg !== null && (
        <div className="grade-avg-card" style={{ borderColor: gradeColor(avg) }}>
          <div className="grade-avg-label">Средневзвешенный балл</div>
          <div className="grade-avg-value" style={{ color: gradeColor(avg) }}>
            {fmtScore(avg, scale)}
            <span className="grade-avg-scale"> / {scale}</span>
          </div>
          <div className="grade-avg-pct">{Math.round(avg * 100)}%</div>
          <div className="grade-avg-bar-track">
            <div className="grade-avg-bar-fill" style={{ width: `${avg * 100}%`, background: gradeColor(avg) }} />
          </div>
        </div>
      )}

      {/* Grade list */}
      {grades.length === 0 ? (
        <div className="grade-empty">
          <div style={{ fontSize: 36, opacity: .3 }}>★</div>
          <div>Нет оценок. Добавьте первую!</div>
        </div>
      ) : (
        <div className="grade-list">
          {grades.map((g) => {
            const ratio = g.value / g.max_value
            const gc    = gradeColor(ratio)
            return (
              <div key={g.id} className="grade-item" onClick={() => openEdit(g)}>
                <div className="grade-item-score" style={{ color: gc }}>
                  <span className="grade-item-value">{g.value}</span>
                  <span className="grade-item-max">/{g.max_value}</span>
                </div>
                <div className="grade-item-info">
                  <div className="grade-item-title">{g.title}</div>
                  <div className="grade-item-meta">
                    {g.date && (
                      <span>{new Date(g.date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    )}
                    {g.weight !== 1 && (
                      <span className="grade-item-weight">вес {g.weight}</span>
                    )}
                  </div>
                </div>
                <div className="grade-item-scaled" style={{ color: gc }}>
                  {fmtScore(ratio, scale)}
                  <div className="grade-item-pct">{Math.round(ratio * 100)}%</div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
