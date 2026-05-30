import { useState } from 'react'
import type { Subject, SubjectGradeStat, Semester } from '../types'

const COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#06b6d4','#84cc16','#f43f5e','#6366f1',
]

interface Props {
  subjects:           Subject[]
  archivedSubjects:   Subject[]
  selectedSubjectId:  number | null
  semesters:          Semester[]
  gradeStats?:        SubjectGradeStat[]
  gradeScale?:        number
  onSelect:           (id: number) => void
  onCreate:           (data: { name: string; color: string; description?: string | null; semester_id?: number | null }) => void
  onUpdate:           (id: number, data: Partial<Omit<Subject, 'id' | 'created_at'>>) => void
  onDelete:           (id: number) => void
  onArchive:          (id: number, archive: boolean) => void
}

interface ModalState {
  open:    boolean
  editing: Subject | null
}

export default function SubjectList({
  subjects, archivedSubjects, selectedSubjectId, semesters, gradeStats, gradeScale = 100,
  onSelect, onCreate, onUpdate, onDelete, onArchive,
}: Props) {
  const [modal,       setModal]      = useState<ModalState>({ open: false, editing: null })
  const [name,        setName]       = useState('')
  const [color,       setColor]      = useState(COLORS[5])
  const [desc,        setDesc]       = useState('')
  const [semesterId,  setSemesterId] = useState<number | ''>('')
  const [saving,      setSaving]     = useState(false)
  const [search,      setSearch]     = useState('')
  const [showArchive, setShowArchive] = useState(false)

  function openCreate() {
    setName(''); setColor(COLORS[5]); setDesc('')
    setSemesterId(semesters.find((s) => s.is_active === 1)?.id ?? '')
    setModal({ open: true, editing: null })
  }

  function openEdit(e: React.MouseEvent, s: Subject) {
    e.stopPropagation()
    setName(s.name); setColor(s.color); setDesc(s.description ?? '')
    setSemesterId(s.semester_id ?? '')
    setModal({ open: true, editing: s })
  }

  function close() { setModal({ open: false, editing: null }) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    try {
      const sid = semesterId !== '' ? (semesterId as number) : null
      if (modal.editing) {
        await onUpdate(modal.editing.id, {
          name: name.trim(), color,
          description: desc.trim() || null,
          semester_id: sid,
        })
      } else {
        await onCreate({ name: name.trim(), color, description: desc.trim() || null, semester_id: sid })
      }
      close()
    } finally {
      setSaving(false)
    }
  }

  const filtered = search.trim()
    ? subjects.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : subjects

  const filteredArchived = search.trim()
    ? archivedSubjects.filter((s) => s.name.toLowerCase().includes(search.toLowerCase()))
    : archivedSubjects

  const displayList   = showArchive ? filteredArchived : filtered
  const activeSemName = (id: number | null) => semesters.find((s) => s.id === id)?.name

  return (
    <>
      <div className="sidebar-section-label">
        Предметы
        {archivedSubjects.length > 0 && (
          <button
            className={`archive-toggle-btn${showArchive ? ' active' : ''}`}
            onClick={() => setShowArchive((v) => !v)}
            title={showArchive ? 'Показать активные' : 'Показать архив'}
          >
            {showArchive ? '← Активные' : `Архив (${archivedSubjects.length})`}
          </button>
        )}
      </div>

      <div style={{ padding: '0 8px 4px' }}>
        <input
          className="sidebar-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск предметов…"
        />
      </div>

      <div className="subjects-list">
        {displayList.map((s) => {
          const stat     = gradeStats?.find((g) => g.subject_id === s.id)
          const semName  = activeSemName(s.semester_id)
          const archived = s.is_archived === 1
          return (
            <div
              key={s.id}
              className={`subject-item${!archived && selectedSubjectId === s.id ? ' selected' : ''}${archived ? ' archived' : ''}`}
              onClick={() => !archived && onSelect(s.id)}
              title={archived ? s.name : undefined}
            >
              <span className="subject-dot" style={{ background: s.color }} />
              <span className="subject-name">
                <span className="subject-name-text">{s.name}</span>
                {semName && <span className="subject-sem-badge">{semName}</span>}
              </span>
              {stat && !archived && (
                <span className="subject-grade-badge" style={{ color: s.color }}>
                  {(stat.weighted_avg * gradeScale).toFixed(gradeScale <= 10 ? 1 : 0)}
                </span>
              )}
              <span className="subject-actions" onClick={(e) => e.stopPropagation()}>
                {archived ? (
                  <button
                    className="icon-btn"
                    title="Восстановить из архива"
                    onClick={() => onArchive(s.id, false)}
                  >↩</button>
                ) : (
                  <>
                    <button className="icon-btn" title="Редактировать" onClick={(e) => openEdit(e, s)}>✏</button>
                    <button
                      className="icon-btn"
                      title="В архив"
                      onClick={() => onArchive(s.id, true)}
                    >📦</button>
                    <button className="icon-btn danger" title="Удалить" onClick={(e) => { e.stopPropagation(); onDelete(s.id) }}>🗑</button>
                  </>
                )}
              </span>
            </div>
          )
        })}

        {displayList.length === 0 && (
          <div style={{ padding: '12px 10px', color: 'rgba(255,255,255,.25)', fontSize: 12 }}>
            {search
              ? 'Ничего не найдено'
              : showArchive
                ? 'Архив пуст'
                : 'Нет предметов. Добавьте первый!'}
          </div>
        )}
      </div>

      {!showArchive && (
        <div style={{ padding: '4px 8px 8px' }}>
          <button className="add-subject-btn" onClick={openCreate}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
            Добавить предмет
          </button>
        </div>
      )}

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

                {semesters.length > 0 && (
                  <div className="form-group">
                    <label className="form-label">Семестр</label>
                    <select
                      className="form-select"
                      value={semesterId}
                      onChange={(e) => setSemesterId(e.target.value === '' ? '' : Number(e.target.value))}
                    >
                      <option value="">— Без семестра —</option>
                      {semesters.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}{s.is_active ? ' (активный)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

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
