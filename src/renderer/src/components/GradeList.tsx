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

/** Display value on the current scale, rounded to appropriate precision. */
function displayVal(g: Grade, scale: number): number {
  const raw = (g.value / g.max_value) * scale
  return scale <= 10 ? Math.round(raw * 10) / 10 : Math.round(raw)
}

function buildHistogram(grades: Grade[], scale: number): { value: number; count: number }[] {
  const counts = new Map<number, number>()
  for (const g of grades) {
    const v = displayVal(g, scale)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return Array.from(counts.entries())
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => a.value - b.value)
}

function calcMedian(grades: Grade[], scale: number): number | null {
  if (!grades.length) return null
  const sorted = [...grades].map((g) => displayVal(g, scale)).sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid]
}

function calcMode(grades: Grade[], scale: number): number | null {
  if (grades.length < 2) return null
  const counts = new Map<number, number>()
  for (const g of grades) {
    const v = displayVal(g, scale)
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  const maxCount = Math.max(...counts.values())
  // No mode if all values appear equally often
  if ([...counts.values()].every((c) => c === maxCount)) return null
  // Return the highest-count value; ties broken by highest grade (modal "good score")
  let best = -Infinity
  for (const [v, c] of counts) {
    if (c === maxCount && v > best) best = v
  }
  return best
}

// ── Histogram sub-component ───────────────────────────────────────────────────

function GradeHistogram({ grades, scale }: { grades: Grade[]; scale: number }) {
  const bars = buildHistogram(grades, scale)
  if (bars.length < 2) return null
  const maxCount = Math.max(...bars.map((b) => b.count))
  const fmtVal = (v: number) => scale <= 10 ? v.toFixed(1).replace('.0', '') : String(v)
  return (
    <div className="grade-histogram">
      <div className="grade-histogram-title">Распределение оценок</div>
      <div className="grade-histogram-bars">
        {bars.map((b) => {
          const heightPct = (b.count / maxCount) * 100
          const ratio = b.value / scale
          const color = gradeColor(ratio)
          return (
            <div key={b.value} className="grade-histogram-col">
              <div className="grade-histogram-count" style={{ color }}>{b.count}</div>
              <div className="grade-histogram-bar-wrap">
                <div
                  className="grade-histogram-bar"
                  style={{ height: `${Math.max(heightPct, 8)}%`, background: color }}
                  title={`${fmtVal(b.value)}: ${b.count} раз`}
                />
              </div>
              <div className="grade-histogram-label">{fmtVal(b.value)}</div>
            </div>
          )
        })}
      </div>
    </div>
  )
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

  const avg    = weightedAvg(grades)
  const median = calcMedian(grades, scale)
  const mode   = calcMode(grades, scale)
  const color  = subject.color
  const fmtV   = (v: number) => scale <= 10 ? v.toFixed(1).replace('.0', '') : String(v)

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

      {/* Stats: histogram + median / mode */}
      {grades.length >= 2 && (
        <div className="grade-stats-section">
          <GradeHistogram grades={grades} scale={scale} />
          <div className="grade-stat-pills">
            {median !== null && (
              <div className="grade-stat-pill">
                <span className="grade-stat-pill-label">Медиана</span>
                <span className="grade-stat-pill-value" style={{ color: gradeColor(median / scale) }}>
                  {fmtV(median)}
                </span>
              </div>
            )}
            {mode !== null && (
              <div className="grade-stat-pill">
                <span className="grade-stat-pill-label">Мода</span>
                <span className="grade-stat-pill-value" style={{ color: gradeColor(mode / scale) }}>
                  {fmtV(mode)}
                </span>
              </div>
            )}
            <div className="grade-stat-pill">
              <span className="grade-stat-pill-label">Оценок</span>
              <span className="grade-stat-pill-value">{grades.length}</span>
            </div>
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
