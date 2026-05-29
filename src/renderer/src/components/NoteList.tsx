import { useState } from 'react'
import type { Note, Subject } from '../types'
import NoteEditor from './NoteEditor'

interface Props {
  subject:   Subject
  notes:     Note[]
  onCreate:  (subjectId: number, title: string) => Promise<Note>
  onUpdate:  (id: number, data: { title?: string; content?: string }) => void
  onDelete:  (id: number) => void
}

function fmtDate(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diffMs = now.getTime() - d.getTime()
  const diffH  = diffMs / 1000 / 3600

  if (diffH < 1)   return 'только что'
  if (diffH < 24)  return d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  if (diffH < 48)  return 'вчера'
  return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function excerpt(content: string): string {
  const cleaned = content.replace(/^#{1,6}\s+/gm, '').replace(/[*_`~>#-]/g, '').trim()
  return cleaned.length > 80 ? cleaned.slice(0, 80) + '…' : cleaned
}

export default function NoteList({ subject, notes, onCreate, onUpdate, onDelete }: Props) {
  const [selectedId, setSelectedId] = useState<number | null>(notes[0]?.id ?? null)
  const [search, setSearch]         = useState('')
  const [creating, setCreating]     = useState(false)

  const filtered = search.trim()
    ? notes.filter((n) =>
        n.title.toLowerCase().includes(search.toLowerCase()) ||
        n.content.toLowerCase().includes(search.toLowerCase())
      )
    : notes

  const selectedNote = notes.find((n) => n.id === selectedId) ?? null

  async function handleCreate() {
    setCreating(true)
    try {
      const note = await onCreate(subject.id, 'Без названия')
      setSelectedId(note.id)
    } finally {
      setCreating(false)
    }
  }

  function handleDelete(id: number) {
    onDelete(id)
    // Select adjacent note
    const idx = notes.findIndex((n) => n.id === id)
    const next = notes[idx + 1] ?? notes[idx - 1] ?? null
    setSelectedId(next?.id ?? null)
  }

  // Sync selectedId when notes list changes (e.g., new note created)
  const noteIds = notes.map((n) => n.id).join(',')
  if (notes.length > 0 && selectedId !== null && !notes.find((n) => n.id === selectedId)) {
    setSelectedId(notes[0].id)
  }

  return (
    <div className="notes-layout">
      {/* ── Left: note list ─────────────────────────────────────────── */}
      <div className="notes-sidebar">
        <div className="notes-sidebar-header">
          <div className="panel-title" style={{ padding: '14px 14px 10px', fontSize: 14 }}>
            <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: subject.color, marginRight: 6, verticalAlign: 'middle' }} />
            Заметки
          </div>
          <div style={{ padding: '0 10px 10px' }}>
            <input
              className="search-input"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Поиск по заметкам…"
            />
          </div>
        </div>

        <div className="notes-list">
          {filtered.length === 0 && (
            <div style={{ padding: '20px 14px', color: 'var(--text-tertiary)', fontSize: 13, textAlign: 'center' }}>
              {search ? 'Ничего не найдено' : 'Нет заметок'}
            </div>
          )}
          {filtered.map((n) => (
            <div
              key={n.id}
              className={`note-list-item${selectedId === n.id ? ' selected' : ''}`}
              style={selectedId === n.id ? { borderLeftColor: subject.color } : {}}
              onClick={() => setSelectedId(n.id)}
            >
              <div className="note-list-title">{n.title || 'Без названия'}</div>
              <div className="note-list-excerpt">{excerpt(n.content) || 'Нет содержимого'}</div>
              <div className="note-list-date">{fmtDate(n.updated_at)}</div>
            </div>
          ))}
        </div>

        <div style={{ padding: '10px' }}>
          <button
            className="btn btn-primary btn-sm"
            style={{ width: '100%' }}
            onClick={() => void handleCreate()}
            disabled={creating}
          >
            {creating ? 'Создаём…' : '+ Новая заметка'}
          </button>
        </div>
      </div>

      {/* ── Right: editor ───────────────────────────────────────────── */}
      <div className="notes-editor-area">
        {selectedNote ? (
          <NoteEditor
            key={selectedNote.id}
            note={selectedNote}
            color={subject.color}
            onUpdate={(id, data) => {
              onUpdate(id, data)
            }}
            onDelete={handleDelete}
            onClose={() => setSelectedId(null)}
          />
        ) : (
          <div className="notes-empty">
            <div style={{ fontSize: 48, opacity: .2 }}>📝</div>
            <div>Выберите заметку или создайте новую</div>
            <button className="btn btn-primary" onClick={() => void handleCreate()} disabled={creating}>
              + Новая заметка
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
