import { useState, useEffect, useRef } from 'react'
import type { Task, Attachment, Subtask, TaskStatus, TaskPriority } from '../types'

interface Props {
  task:                Task
  attachments:         Attachment[]
  subtasks:            Subtask[]
  onUpdate:            (id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id'>>) => void
  onAddAttachment:     (taskId: number) => void
  onDeleteAttachment:  (id: number) => void
  onOpenAttachment:    (id: number) => void
  onCreateSubtask:     (taskId: number, title: string) => void
  onUpdateSubtask:     (id: number, data: { title?: string; is_done?: boolean }) => void
  onDeleteSubtask:     (id: number) => void
  onReorderSubtasks:   (taskId: number, orderedIds: number[]) => void
  onClose:             () => void
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

function fileIcon(mime: string): string {
  if (mime.startsWith('image/'))      return '🖼'
  if (mime === 'application/pdf')     return '📄'
  if (mime.includes('word'))          return '📝'
  if (mime.includes('sheet') || mime.includes('excel'))        return '📊'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📊'
  if (mime.startsWith('video/'))      return '🎬'
  if (mime.startsWith('audio/'))      return '🎵'
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '🗜'
  if (mime.startsWith('text/'))       return '📃'
  return '📎'
}

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: 'not_started', label: 'Не начато' },
  { value: 'in_progress', label: 'В процессе' },
  { value: 'done',        label: 'Выполнено' },
]

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: 'low',    label: 'Низкий' },
  { value: 'medium', label: 'Средний' },
  { value: 'high',   label: 'Высокий' },
]

// ── Subtask item ──────────────────────────────────────────────────────────────

interface SubtaskItemProps {
  subtask:    Subtask
  isDragging: boolean
  isDragOver: boolean
  onToggle:   () => void
  onRename:   (title: string) => void
  onDelete:   () => void
  onDragStart: (e: React.DragEvent) => void
  onDragOver:  (e: React.DragEvent) => void
  onDrop:      (e: React.DragEvent) => void
  onDragEnd:   () => void
}

function SubtaskItem({
  subtask, isDragging, isDragOver,
  onToggle, onRename, onDelete,
  onDragStart, onDragOver, onDrop, onDragEnd,
}: SubtaskItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft]     = useState(subtask.title)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { setDraft(subtask.title) }, [subtask.title])

  function startEdit() {
    setDraft(subtask.title)
    setEditing(true)
    setTimeout(() => inputRef.current?.select(), 0)
  }

  function commitEdit() {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== subtask.title) onRename(trimmed)
    else setDraft(subtask.title)
    setEditing(false)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter')  { e.preventDefault(); commitEdit() }
    if (e.key === 'Escape') { setDraft(subtask.title); setEditing(false) }
  }

  const done = subtask.is_done === 1

  return (
    <div
      className={[
        'subtask-item',
        done        ? 'subtask-done'      : '',
        isDragging  ? 'subtask-dragging'  : '',
        isDragOver  ? 'subtask-drag-over' : '',
      ].filter(Boolean).join(' ')}
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragEnd={onDragEnd}
    >
      {/* Drag handle */}
      <span className="subtask-handle" title="Перетащить">⠿</span>

      {/* Checkbox */}
      <button
        className={`subtask-checkbox${done ? ' checked' : ''}`}
        onClick={onToggle}
        title={done ? 'Отметить невыполненным' : 'Отметить выполненным'}
      >
        {done ? '✓' : ''}
      </button>

      {/* Title / inline editor */}
      {editing ? (
        <input
          ref={inputRef}
          className="subtask-edit-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          maxLength={200}
        />
      ) : (
        <span
          className="subtask-title"
          onDoubleClick={startEdit}
          title="Двойной клик для редактирования"
        >
          {subtask.title}
        </span>
      )}

      {/* Delete */}
      <button className="subtask-del" onClick={onDelete} title="Удалить подзадачу">✕</button>
    </div>
  )
}

// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ total, done }: { total: number; done: number }) {
  if (total === 0) return null
  const pct = Math.round((done / total) * 100)
  const allDone = done === total

  return (
    <div className="subtask-progress">
      <div className="subtask-progress-header">
        <span className="subtask-progress-label">
          {done}/{total} выполнено
        </span>
        <span className={`subtask-progress-pct${allDone ? ' all-done' : ''}`}>
          {pct}%
        </span>
      </div>
      <div className="subtask-progress-track">
        <div
          className={`subtask-progress-fill${allDone ? ' all-done' : ''}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskDetail({
  task, attachments, subtasks,
  onUpdate,
  onAddAttachment, onDeleteAttachment, onOpenAttachment,
  onCreateSubtask, onUpdateSubtask, onDeleteSubtask, onReorderSubtasks,
  onClose,
}: Props) {
  // ── Task title / description editing ──────────────────────────────────────
  const [title, setTitle]           = useState(task.title)
  const [desc, setDesc]             = useState(task.description ?? '')
  const [titleDirty, setTitleDirty] = useState(false)
  const [descDirty, setDescDirty]   = useState(false)
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setTitle(task.title)
    setDesc(task.description ?? '')
    setTitleDirty(false)
    setDescDirty(false)
  }, [task.id])

  function handleTitleBlur() {
    if (!titleDirty) return
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) onUpdate(task.id, { title: trimmed })
    else setTitle(task.title)
    setTitleDirty(false)
  }

  function handleDescChange(val: string) {
    setDesc(val)
    setDescDirty(true)
    if (descTimer.current) clearTimeout(descTimer.current)
    descTimer.current = setTimeout(() => {
      onUpdate(task.id, { description: val.trim() || null })
      setDescDirty(false)
    }, 800)
  }

  // ── New subtask input ──────────────────────────────────────────────────────
  const [newSubtask, setNewSubtask] = useState('')
  const newSubtaskRef = useRef<HTMLInputElement>(null)

  function handleAddSubtask() {
    const t = newSubtask.trim()
    if (!t) return
    onCreateSubtask(task.id, t)
    setNewSubtask('')
    newSubtaskRef.current?.focus()
  }

  function handleNewSubtaskKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') { e.preventDefault(); handleAddSubtask() }
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  const [dragIdx, setDragIdx]     = useState<number | null>(null)
  const [dragOver, setDragOver]   = useState<number | null>(null)

  function handleDragStart(idx: number) {
    setDragIdx(idx)
  }

  function handleDrop(dropIdx: number) {
    if (dragIdx === null || dragIdx === dropIdx) return
    const arr = [...subtasks]
    const [item] = arr.splice(dragIdx, 1)
    arr.splice(dropIdx, 0, item)
    // Optimistic update: reorder locally, then persist
    onReorderSubtasks(task.id, arr.map((s) => s.id))
    setDragIdx(null)
    setDragOver(null)
  }

  const doneCnt  = subtasks.filter((s) => s.is_done === 1).length
  const totalCnt = subtasks.length

  return (
    <>
      <div className="detail-header">
        <span className="detail-header-title">Задание</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose} title="Закрыть">✕</button>
      </div>

      <div className="detail-body">
        {/* Task title */}
        <div>
          <input
            className="detail-task-title"
            value={title}
            onChange={(e) => { setTitle(e.target.value); setTitleDirty(true) }}
            onBlur={handleTitleBlur}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur() }}
            maxLength={200}
          />
        </div>

        {/* Meta */}
        <div>
          <div className="detail-section-label">Параметры</div>
          <div className="detail-meta-grid">
            <div className="detail-meta-item">
              <label>Статус</label>
              <select
                className="inline-select"
                value={task.status}
                onChange={(e) => onUpdate(task.id, { status: e.target.value as TaskStatus })}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="detail-meta-item">
              <label>Приоритет</label>
              <select
                className="inline-select"
                value={task.priority}
                onChange={(e) => onUpdate(task.id, { priority: e.target.value as TaskPriority })}
              >
                {PRIORITY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>

            <div className="detail-meta-item" style={{ gridColumn: 'span 2' }}>
              <label>Дедлайн</label>
              <input
                type="date"
                className="inline-select"
                value={task.due_date ?? ''}
                onChange={(e) => onUpdate(task.id, { due_date: e.target.value || null })}
              />
            </div>
          </div>
        </div>

        {/* Description */}
        <div>
          <div className="detail-section-label">
            Описание{descDirty && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'none' }}> – сохраняется…</span>}
          </div>
          <textarea
            className="description-area"
            value={desc}
            onChange={(e) => handleDescChange(e.target.value)}
            placeholder="Добавьте описание, заметки или ссылки…"
            rows={4}
          />
        </div>

        {/* ── Subtasks / checklist ─────────────────────────────────────────── */}
        <div>
          <div className="detail-section-label" style={{ marginBottom: 8 }}>
            Подзадачи ({doneCnt}/{totalCnt})
          </div>

          <ProgressBar total={totalCnt} done={doneCnt} />

          {subtasks.length > 0 && (
            <div className="subtask-list">
              {subtasks.map((s, idx) => (
                <SubtaskItem
                  key={s.id}
                  subtask={s}
                  isDragging={dragIdx === idx}
                  isDragOver={dragOver === idx}
                  onToggle={() => onUpdateSubtask(s.id, { is_done: s.is_done !== 1 })}
                  onRename={(t) => onUpdateSubtask(s.id, { title: t })}
                  onDelete={() => onDeleteSubtask(s.id)}
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; handleDragStart(idx) }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(idx) }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(idx) }}
                  onDragEnd={() => { setDragIdx(null); setDragOver(null) }}
                />
              ))}
            </div>
          )}

          {/* Add input */}
          <div className="subtask-add-row">
            <input
              ref={newSubtaskRef}
              className="subtask-add-input"
              value={newSubtask}
              onChange={(e) => setNewSubtask(e.target.value)}
              onKeyDown={handleNewSubtaskKey}
              placeholder="Добавить подзадачу…"
              maxLength={200}
            />
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleAddSubtask}
              disabled={!newSubtask.trim()}
            >
              +
            </button>
          </div>
        </div>

        {/* Attachments */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="detail-section-label" style={{ marginBottom: 0 }}>
              Вложения ({attachments.length})
            </div>
            <button className="btn btn-secondary btn-sm" onClick={() => onAddAttachment(task.id)}>
              + Прикрепить файл
            </button>
          </div>

          {attachments.length === 0 ? (
            <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '10px 0', textAlign: 'center' }}>
              Нет прикреплённых файлов
            </div>
          ) : (
            <div className="attachment-list">
              {attachments.map((a) => (
                <div
                  key={a.id}
                  className="attachment-item"
                  onDoubleClick={() => onOpenAttachment(a.id)}
                  title="Двойной клик — открыть файл"
                >
                  <span className="attachment-icon">{fileIcon(a.mime_type)}</span>
                  <div className="attachment-info">
                    <div className="attachment-name">{a.filename}</div>
                    <div className="attachment-size">
                      {formatSize(a.size)} · {new Date(a.created_at).toLocaleDateString('ru-RU')}
                    </div>
                  </div>
                  <button
                    className="attachment-del"
                    onClick={() => onDeleteAttachment(a.id)}
                    title="Удалить вложение"
                  >
                    🗑
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{ color: 'var(--text-tertiary)', fontSize: 11, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          Создано: {new Date(task.created_at).toLocaleString('ru-RU')}
        </div>
      </div>
    </>
  )
}
