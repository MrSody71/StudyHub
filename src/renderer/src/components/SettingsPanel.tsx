import { useState } from 'react'
import type { Tag, Theme } from '../types'

const TAG_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#06b6d4','#84cc16','#f43f5e','#6366f1',
]

interface Props {
  theme:         Theme
  tags:          Tag[]
  onThemeChange: (t: Theme) => void
  onCreateTag:   (name: string, color: string) => Promise<Tag>
  onUpdateTag:   (id: number, data: { name?: string; color?: string }) => Promise<void>
  onDeleteTag:   (id: number) => Promise<void>
  onClose:       () => void
}

export default function SettingsPanel({ theme, tags, onThemeChange, onCreateTag, onUpdateTag, onDeleteTag, onClose }: Props) {
  // ── New tag form ────────────────────────────────────────────────────────
  const [newName, setNewName]   = useState('')
  const [newColor, setNewColor] = useState(TAG_COLORS[5])
  const [creating, setCreating] = useState(false)

  async function handleCreateTag() {
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    try {
      await onCreateTag(name, newColor)
      setNewName('')
      setNewColor(TAG_COLORS[5])
    } finally {
      setCreating(false)
    }
  }

  // ── Tag editing ─────────────────────────────────────────────────────────
  const [editingId, setEditingId]     = useState<number | null>(null)
  const [editName, setEditName]       = useState('')
  const [editColor, setEditColor]     = useState(TAG_COLORS[5])
  const [savingEdit, setSavingEdit]   = useState(false)

  function startEdit(tag: Tag) {
    setEditingId(tag.id)
    setEditName(tag.name)
    setEditColor(tag.color)
  }

  function cancelEdit() {
    setEditingId(null)
  }

  async function commitEdit(id: number) {
    setSavingEdit(true)
    try {
      await onUpdateTag(id, { name: editName.trim() || undefined, color: editColor })
      setEditingId(null)
    } finally {
      setSavingEdit(false)
    }
  }

  async function handleDelete(id: number) {
    if (!confirm('Удалить тег? Он будет убран со всех заданий.')) return
    await onDeleteTag(id)
    if (editingId === id) setEditingId(null)
  }

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-header">
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>⚙ Настройки</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* Theme section */}
        <div className="settings-section">
          <div className="settings-section-title">Оформление</div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              Тема
            </label>
            <div className="theme-toggle">
              <button
                className={`theme-option${theme === 'light' ? ' active' : ''}`}
                onClick={() => onThemeChange('light')}
              >
                ☀ Светлая
              </button>
              <button
                className={`theme-option${theme === 'dark' ? ' active' : ''}`}
                onClick={() => onThemeChange('dark')}
              >
                🌙 Тёмная
              </button>
            </div>
          </div>
        </div>

        {/* Tag management section */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Управление тегами</div>

          {/* Existing tags */}
          {tags.length > 0 && (
            <div className="tag-mgmt-list">
              {tags.map((tag) => (
                <div key={tag.id} className="tag-mgmt-item">
                  {editingId === tag.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
                      <input
                        className="form-input"
                        autoFocus
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); void commitEdit(tag.id) }
                          if (e.key === 'Escape') cancelEdit()
                        }}
                        maxLength={40}
                      />
                      <div className="tag-create-colors">
                        {TAG_COLORS.map((c) => (
                          <button
                            key={c}
                            className={`tag-color-dot${editColor === c ? ' selected' : ''}`}
                            style={{ background: c }}
                            onClick={() => setEditColor(c)}
                          />
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-primary btn-sm" onClick={() => void commitEdit(tag.id)} disabled={savingEdit || !editName.trim()}>
                          Сохранить
                        </button>
                        <button className="btn btn-ghost btn-sm" onClick={cancelEdit}>Отмена</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <span className="tag-mgmt-dot" style={{ background: tag.color }} />
                      <span className="tag-mgmt-name">{tag.name}</span>
                      <span className="subject-actions" style={{ opacity: 1 }}>
                        <button className="icon-btn" onClick={() => startEdit(tag)} title="Редактировать">✏</button>
                        <button className="icon-btn danger" onClick={() => void handleDelete(tag.id)} title="Удалить">🗑</button>
                      </span>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Create new tag */}
          <div className="tag-mgmt-create">
            <input
              className="form-input"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateTag() } }}
              placeholder="Название нового тега…"
              maxLength={40}
            />
            <div className="tag-create-colors" style={{ marginTop: 6 }}>
              {TAG_COLORS.map((c) => (
                <button
                  key={c}
                  className={`tag-color-dot${newColor === c ? ' selected' : ''}`}
                  style={{ background: c }}
                  onClick={() => setNewColor(c)}
                />
              ))}
            </div>
            <button
              className="btn btn-primary btn-sm"
              style={{ marginTop: 8, width: '100%' }}
              onClick={() => void handleCreateTag()}
              disabled={creating || !newName.trim()}
            >
              {creating ? 'Создаём…' : '+ Создать тег'}
            </button>
          </div>
        </div>

        <div style={{ padding: '0 22px 20px', borderTop: '1px solid var(--border)' }}>
          <div style={{ paddingTop: 16, fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            <strong style={{ color: 'var(--text-secondary)' }}>StudyHub</strong> v1.0.0<br />
            Данные хранятся локально на вашем компьютере.
          </div>
        </div>
      </div>
    </div>
  )
}
