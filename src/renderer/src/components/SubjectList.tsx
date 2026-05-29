import { useState } from 'react'
import type { Subject } from '../types'

const COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#06b6d4','#84cc16','#f43f5e','#6366f1',
]

interface Props {
  subjects:          Subject[]
  selectedSubjectId: number | null
  onSelect:          (id: number) => void
  onCreate:          (data: { name: string; color: string; description?: string | null }) => void
  onUpdate:          (id: number, data: Partial<Omit<Subject, 'id' | 'created_at'>>) => void
  onDelete:          (id: number) => void
}

interface ModalState {
  open:    boolean
  editing: Subject | null
}

export default function SubjectList({ subjects, selectedSubjectId, onSelect, onCreate, onUpdate, onDelete }: Props) {
  const [modal, setModal]       = useState<ModalState>({ open: false, editing: null })
  const [name, setName]         = useState('')
  const [color, setColor]       = useState(COLORS[5])
  const [desc, setDesc]         = useState('')
  const [saving, setSaving]     = useState(false)

  function openCreate() {
    setName(''); setColor(COLORS[5]); setDesc('')
    setModal({ open: true, editing: null })
  }

  function openEdit(e: React.MouseEvent, s: Subject) {
    e.stopPropagation()
    setName(s.name); setColor(s.color); setDesc(s.description ?? '')
    setModal({ open: true, editing: s })
  }

  function close() { setModal({ open: false, editing: null }) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      if (modal.editing) {
        await onUpdate(modal.editing.id, { name: name.trim(), color, description: desc.trim() || null })
      } else {
        await onCreate({ name: name.trim(), color, description: desc.trim() || null })
      }
      close()
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <div className="sidebar-section-label">Предметы</div>

      <div className="subjects-list">
        {subjects.map((s) => (
          <div
            key={s.id}
            className={`subject-item${selectedSubjectId === s.id ? ' selected' : ''}`}
            onClick={() => onSelect(s.id)}
          >
            <span className="subject-dot" style={{ background: s.color }} />
            <span className="subject-name">{s.name}</span>
            <span className="subject-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn" title="Редактировать" onClick={(e) => openEdit(e, s)}>✏</button>
              <button className="icon-btn danger" title="Удалить" onClick={(e) => { e.stopPropagation(); onDelete(s.id) }}>🗑</button>
            </span>
          </div>
        ))}

        {subjects.length === 0 && (
          <div style={{ padding: '12px 10px', color: 'rgba(255,255,255,.25)', fontSize: 12 }}>
            Нет предметов. Добавьте первый!
          </div>
        )}
      </div>

      <div style={{ padding: '4px 8px 8px' }}>
        <button className="add-subject-btn" onClick={openCreate}>
          <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
          Добавить предмет
        </button>
      </div>

      {modal.open && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">
                {modal.editing ? 'Редактировать предмет' : 'Новый предмет'}
              </span>
              <button className="btn btn-ghost btn-sm" onClick={close}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Название *</label>
                  <input
                    className="form-input"
                    autoFocus
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Математика, Физика…"
                    maxLength={80}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Цвет</label>
                  <div className="color-palette">
                    {COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={`color-swatch${color === c ? ' selected' : ''}`}
                        style={{ background: c }}
                        onClick={() => setColor(c)}
                        title={c}
                      />
                    ))}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Описание (необязательно)</label>
                  <textarea
                    className="form-textarea"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Краткое описание предмета…"
                    rows={2}
                    maxLength={300}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={close}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !name.trim()}>
                  {saving ? 'Сохраняем…' : modal.editing ? 'Сохранить' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
