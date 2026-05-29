import { useState, useEffect, useRef } from 'react'
import type { Task, Attachment, TaskStatus, TaskPriority } from '../types'

interface Props {
  task:               Task
  attachments:        Attachment[]
  onUpdate:           (id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id'>>) => void
  onAddAttachment:    (taskId: number) => void
  onDeleteAttachment: (id: number) => void
  onOpenAttachment:   (id: number) => void
  onClose:            () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

function fileIcon(mime: string): string {
  if (mime.startsWith('image/'))       return '🖼'
  if (mime === 'application/pdf')      return '📄'
  if (mime.includes('word'))           return '📝'
  if (mime.includes('sheet') || mime.includes('excel'))  return '📊'
  if (mime.includes('presentation') || mime.includes('powerpoint')) return '📊'
  if (mime.startsWith('video/'))       return '🎬'
  if (mime.startsWith('audio/'))       return '🎵'
  if (mime.includes('zip') || mime.includes('rar') || mime.includes('7z')) return '🗜'
  if (mime.startsWith('text/'))        return '📃'
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

export default function TaskDetail({ task, attachments, onUpdate, onAddAttachment, onDeleteAttachment, onOpenAttachment, onClose }: Props) {
  const [title, setTitle]       = useState(task.title)
  const [desc, setDesc]         = useState(task.description ?? '')
  const [titleDirty, setTitleDirty] = useState(false)
  const [descDirty, setDescDirty]   = useState(false)
  const descTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Sync when task changes (e.g. different task selected)
  useEffect(() => {
    setTitle(task.title)
    setDesc(task.description ?? '')
    setTitleDirty(false)
    setDescDirty(false)
  }, [task.id])

  function handleTitleBlur() {
    if (!titleDirty) return
    const trimmed = title.trim()
    if (trimmed && trimmed !== task.title) {
      onUpdate(task.id, { title: trimmed })
    } else {
      setTitle(task.title) // revert
    }
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

  return (
    <>
      <div className="detail-header">
        <span className="detail-header-title">Задание</span>
        <button className="btn btn-ghost btn-sm" onClick={onClose} title="Закрыть">✕</button>
      </div>

      <div className="detail-body">
        {/* Title */}
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
            Описание {descDirty && <span style={{ color: 'var(--text-tertiary)', fontWeight: 400, textTransform: 'none' }}>– сохраняется…</span>}
          </div>
          <textarea
            className="description-area"
            value={desc}
            onChange={(e) => handleDescChange(e.target.value)}
            placeholder="Добавьте описание, заметки или ссылки…"
            rows={5}
          />
        </div>

        {/* Attachments */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div className="detail-section-label" style={{ marginBottom: 0 }}>
              Вложения ({attachments.length})
            </div>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => onAddAttachment(task.id)}
            >
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

        {/* Created at */}
        <div style={{ color: 'var(--text-tertiary)', fontSize: 11, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          Создано: {new Date(task.created_at).toLocaleString('ru-RU')}
        </div>
      </div>
    </>
  )
}
