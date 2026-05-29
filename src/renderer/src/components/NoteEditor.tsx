import { useState, useEffect, useRef, useCallback } from 'react'
import type { Note } from '../types'
import { renderMarkdown } from '../utils/markdown'

interface Props {
  note:      Note
  color:     string
  onUpdate:  (id: number, data: { title?: string; content?: string }) => void
  onDelete:  (id: number) => void
  onClose:   () => void
}

type EditorMode = 'edit' | 'split' | 'preview'

const TOOLBAR_ITEMS = [
  { label: 'B',   title: 'Жирный (Ctrl+B)',   wrap: ['**', '**'],      style: { fontWeight: 700 } },
  { label: 'I',   title: 'Курсив (Ctrl+I)',    wrap: ['*', '*'],        style: { fontStyle: 'italic' } },
  { label: 'S',   title: 'Зачёркнутый',        wrap: ['~~', '~~'],      style: { textDecoration: 'line-through' } },
  { label: '`',   title: 'Код',                wrap: ['`', '`'],        style: { fontFamily: 'monospace' } },
  { label: 'H1',  title: 'Заголовок 1',        prefix: '# ',            style: {} },
  { label: 'H2',  title: 'Заголовок 2',        prefix: '## ',           style: {} },
  { label: 'H3',  title: 'Заголовок 3',        prefix: '### ',          style: {} },
  { label: '—',   title: 'Разделитель',        insert: '\n---\n',       style: {} },
  { label: '• ',  title: 'Список',             prefix: '- ',            style: {} },
  { label: '1.',  title: 'Нумерованный список', prefix: '1. ',          style: {} },
  { label: '"',   title: 'Цитата',             prefix: '> ',            style: {} },
] as const

function fmtDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export default function NoteEditor({ note, color, onUpdate, onDelete, onClose }: Props) {
  const [title,   setTitle]   = useState(note.title)
  const [content, setContent] = useState(note.content)
  const [mode,    setMode]    = useState<EditorMode>('split')
  const [saving,  setSaving]  = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  const titleTimer   = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const textareaRef  = useRef<HTMLTextAreaElement>(null)

  // Sync when note changes (different note selected)
  useEffect(() => {
    setTitle(note.title)
    setContent(note.content)
    setSavedAt(null)
  }, [note.id])

  const doSave = useCallback(async (t: string, c: string) => {
    setSaving(true)
    try {
      await window.api.notes.update(note.id, { title: t, content: c })
      setSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
    } finally {
      setSaving(false)
    }
  }, [note.id])

  function handleTitleChange(val: string) {
    setTitle(val)
    if (titleTimer.current) clearTimeout(titleTimer.current)
    titleTimer.current = setTimeout(() => {
      onUpdate(note.id, { title: val.trim() || 'Без названия' })
      setSavedAt(new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))
    }, 600)
  }

  function handleContentChange(val: string) {
    setContent(val)
    if (contentTimer.current) clearTimeout(contentTimer.current)
    contentTimer.current = setTimeout(() => void doSave(title, val), 1000)
  }

  // ── Toolbar actions ───────────────────────────────────────────────────────

  function applyWrap(before: string, after: string) {
    const ta = textareaRef.current
    if (!ta) return
    const start = ta.selectionStart
    const end   = ta.selectionEnd
    const selected = content.slice(start, end)
    const newContent =
      content.slice(0, start) + before + selected + after + content.slice(end)
    setContent(newContent)
    handleContentChange(newContent)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + before.length, end + before.length)
    }, 0)
  }

  function applyPrefix(prefix: string) {
    const ta = textareaRef.current
    if (!ta) return
    const start  = ta.selectionStart
    const lineStart = content.lastIndexOf('\n', start - 1) + 1
    const newContent = content.slice(0, lineStart) + prefix + content.slice(lineStart)
    setContent(newContent)
    handleContentChange(newContent)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(start + prefix.length, start + prefix.length)
    }, 0)
  }

  function applyInsert(text: string) {
    const ta = textareaRef.current
    if (!ta) return
    const pos = ta.selectionStart
    const newContent = content.slice(0, pos) + text + content.slice(pos)
    setContent(newContent)
    handleContentChange(newContent)
    setTimeout(() => {
      ta.focus()
      ta.setSelectionRange(pos + text.length, pos + text.length)
    }, 0)
  }

  function handleToolbarClick(item: typeof TOOLBAR_ITEMS[number]) {
    if ('wrap' in item)   applyWrap(item.wrap[0], item.wrap[1])
    if ('prefix' in item) applyPrefix(item.prefix)
    if ('insert' in item) applyInsert(item.insert)
  }

  // Keyboard shortcuts in textarea
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.ctrlKey || e.metaKey) {
      if (e.key === 'b') { e.preventDefault(); applyWrap('**', '**') }
      if (e.key === 'i') { e.preventDefault(); applyWrap('*', '*') }
      if (e.key === 's') { e.preventDefault(); void doSave(title, content) }
    }
    // Tab → insert 2 spaces
    if (e.key === 'Tab') {
      e.preventDefault()
      const ta = e.currentTarget
      const pos = ta.selectionStart
      const newContent = content.slice(0, pos) + '  ' + content.slice(pos)
      setContent(newContent)
      handleContentChange(newContent)
      setTimeout(() => ta.setSelectionRange(pos + 2, pos + 2), 0)
    }
  }

  const html = renderMarkdown(content)

  return (
    <div className="note-editor">
      {/* Editor header */}
      <div className="note-editor-header">
        <input
          className="note-editor-title"
          value={title}
          onChange={(e) => handleTitleChange(e.target.value)}
          placeholder="Название заметки…"
          maxLength={200}
        />
        <div className="note-editor-meta">
          {saving ? (
            <span className="note-save-indicator saving">Сохраняем…</span>
          ) : savedAt ? (
            <span className="note-save-indicator saved">Сохранено в {savedAt}</span>
          ) : (
            <span className="note-save-indicator">Изменено: {fmtDate(note.updated_at)}</span>
          )}
          <div className="note-mode-btns">
            <button className={`note-mode-btn${mode === 'edit'    ? ' active' : ''}`} onClick={() => setMode('edit')}    title="Редактор">✏</button>
            <button className={`note-mode-btn${mode === 'split'   ? ' active' : ''}`} onClick={() => setMode('split')}   title="Редактор + предпросмотр">⊟</button>
            <button className={`note-mode-btn${mode === 'preview' ? ' active' : ''}`} onClick={() => setMode('preview')} title="Предпросмотр">👁</button>
          </div>
          <button
            className="btn btn-ghost btn-sm"
            style={{ color: 'var(--danger)' }}
            onClick={() => { if (confirm(`Удалить заметку «${note.title}»?`)) { onDelete(note.id); onClose() } }}
            title="Удалить заметку"
          >
            🗑
          </button>
        </div>
      </div>

      {/* Toolbar */}
      {mode !== 'preview' && (
        <div className="note-toolbar">
          {TOOLBAR_ITEMS.map((item, idx) => (
            <button
              key={idx}
              className="note-toolbar-btn"
              title={item.title}
              style={item.style}
              onMouseDown={(e) => { e.preventDefault(); handleToolbarClick(item) }}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}

      {/* Body */}
      <div className={`note-body note-body-${mode}`}>
        {mode !== 'preview' && (
          <textarea
            ref={textareaRef}
            className="note-textarea"
            value={content}
            onChange={(e) => handleContentChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={'# Заголовок\n\nНачните писать…\n\nИспользуйте **жирный**, *курсив*, `код`, - списки, > цитаты'}
            spellCheck
          />
        )}
        {mode !== 'edit' && (
          <div
            className="note-preview markdown-body"
            style={mode === 'preview' ? { borderLeft: `3px solid ${color}` } : {}}
            dangerouslySetInnerHTML={{ __html: html || '<p class="md-p" style="color:var(--text-tertiary)">Предпросмотр появится здесь…</p>' }}
          />
        )}
      </div>
    </div>
  )
}
