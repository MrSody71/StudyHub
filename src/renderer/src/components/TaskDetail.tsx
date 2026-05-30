import React, { useState, useEffect, useRef } from 'react'
import type { Task, Tag, Attachment, Subtask, TaskStatus, TaskPriority } from '../types'

// ── Attachment preview helpers ────────────────────────────────────────────────

function attachmentUrl(id: number): string {
  return `attachment://${id}`
}

function isImage(mime: string): boolean {
  return ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/bmp', 'image/svg+xml'].includes(mime)
}

function isPdf(mime: string): boolean {
  return mime === 'application/pdf'
}

/** Lightbox overlay for images */
function ImageLightbox({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="lightbox-name">{name}</span>
          <button className="lightbox-close" onClick={onClose}>✕</button>
        </div>
        <div className="lightbox-img-wrap">
          <img src={url} alt={name} className="lightbox-img" draggable={false} />
        </div>
      </div>
    </div>
  )
}

/** PDF viewer overlay */
function PdfViewer({ url, name, onClose }: { url: string; name: string; onClose: () => void }) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="lightbox-overlay" onClick={onClose}>
      <div className="lightbox-content lightbox-pdf" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-header">
          <span className="lightbox-name">📄 {name}</span>
          <button className="lightbox-close" onClick={onClose}>✕</button>
        </div>
        <iframe
          className="pdf-frame"
          src={url}
          title={name}
        />
      </div>
    </div>
  )
}

// ── Manual timer ──────────────────────────────────────────────────────────────

function useStopwatch() {
  const [running, setRunning]   = useState(false)
  const [elapsed, setElapsed]   = useState(0)
  const startRef = useRef<number | null>(null)

  useEffect(() => {
    if (!running) return
    const id = setInterval(() => {
      if (startRef.current !== null) {
        setElapsed(Math.floor((Date.now() - startRef.current) / 1000))
      }
    }, 500)
    return () => clearInterval(id)
  }, [running])

  function start() {
    startRef.current = Date.now() - elapsed * 1000
    setRunning(true)
  }
  function stop() { setRunning(false) }
  function reset() { setRunning(false); setElapsed(0); startRef.current = null }

  return { running, elapsed, start, stop, reset, startedAt: startRef }
}

function ManualTimer({ taskId, subjectId, onSessionSaved }: { taskId: number; subjectId: number; onSessionSaved?: () => void }) {
  const sw = useStopwatch()
  const startedIsoRef = useRef<string | null>(null)

  function pad(n: number) { return String(n).padStart(2, '0') }
  const h = Math.floor(sw.elapsed / 3600)
  const m = Math.floor((sw.elapsed % 3600) / 60)
  const s = sw.elapsed % 60

  async function handleStop() {
    sw.stop()
    if (sw.elapsed < 5) { sw.reset(); return }
    try {
      await window.api.sessions.create({
        subject_id:       subjectId,
        task_id:          taskId,
        type:             'manual',
        duration_seconds: sw.elapsed,
        started_at:       startedIsoRef.current ?? new Date().toISOString(),
        ended_at:         new Date().toISOString(),
      })
      onSessionSaved?.()
    } catch { /* non-fatal */ }
    sw.reset()
    startedIsoRef.current = null
  }

  function handleStart() {
    startedIsoRef.current = new Date().toISOString()
    sw.start()
  }

  return (
    <div className="manual-timer">
      <div className="manual-timer-display">
        {pad(h)}:{pad(m)}:{pad(s)}
      </div>
      <div className="manual-timer-controls">
        {sw.running ? (
          <button className="btn btn-danger btn-sm" onClick={() => void handleStop()}>Стоп и сохранить</button>
        ) : (
          <button className="btn btn-primary btn-sm" onClick={handleStart}>Старт</button>
        )}
        {!sw.running && sw.elapsed > 0 && (
          <button className="btn btn-ghost btn-sm" onClick={sw.reset}>↺ Сброс</button>
        )}
      </div>
    </div>
  )
}

const TAG_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
]

interface Props {
  task:                Task
  attachments:         Attachment[]
  subtasks:            Subtask[]
  allTags:             Tag[]
  onUpdate:            (id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id'>>) => void
  onCompleteRecurring: (taskId: number) => void
  onSetTaskTags:       (taskId: number, tagIds: number[]) => Promise<void>
  onCreateTag:         (name: string, color: string) => Promise<Tag>
  onAddAttachment:     (taskId: number, paths?: string[]) => void
  onAddFolder:         (taskId: number, folderPath: string, displayName: string, replaceId?: number) => void
  onDeleteAttachment:  (id: number) => void
  onOpenAttachment:    (id: number) => void
  onCreateSubtask:     (taskId: number, title: string) => void
  onUpdateSubtask:     (id: number, data: { title?: string; is_done?: boolean }) => void
  onDeleteSubtask:     (id: number) => void
  onReorderSubtasks:   (taskId: number, orderedIds: number[]) => void
  onSessionSaved?:     () => void
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

function formatRecurrence(rule: string | null | undefined): string {
  if (!rule) return 'Без повторения'
  try {
    const r = JSON.parse(rule) as { unit: string; interval: number }
    if (r.interval === 1) {
      if (r.unit === 'day')   return 'Каждый день'
      if (r.unit === 'week')  return 'Каждую неделю'
      if (r.unit === 'month') return 'Каждый месяц'
    }
    const u = r.unit === 'day' ? 'дн.' : r.unit === 'week' ? 'нед.' : 'мес.'
    return `Каждые ${r.interval} ${u}`
  } catch { return 'Без повторения' }
}

function ruleFromPreset(preset: string, interval: number, unit: string): string | null {
  if (preset === 'none')    return null
  if (preset === 'daily')   return JSON.stringify({ unit: 'day',   interval: 1 })
  if (preset === 'weekly')  return JSON.stringify({ unit: 'week',  interval: 1 })
  if (preset === 'monthly') return JSON.stringify({ unit: 'month', interval: 1 })
  if (preset === 'custom')  return JSON.stringify({ unit, interval: Math.max(1, interval) })
  return null
}

function ruleToPreset(rule: string | null | undefined): string {
  if (!rule) return 'none'
  try {
    const r = JSON.parse(rule) as { unit: string; interval: number }
    if (r.unit === 'day'   && r.interval === 1) return 'daily'
    if (r.unit === 'week'  && r.interval === 1) return 'weekly'
    if (r.unit === 'month' && r.interval === 1) return 'monthly'
    return 'custom'
  } catch { return 'none' }
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
      <span className="subtask-handle" title="Перетащить">⠿</span>
      <button
        className={`subtask-checkbox${done ? ' checked' : ''}`}
        onClick={onToggle}
        title={done ? 'Отметить невыполненным' : 'Отметить выполненным'}
      >
        {done ? '✓' : ''}
      </button>
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
        <span className="subtask-progress-label">{done}/{total} выполнено</span>
        <span className={`subtask-progress-pct${allDone ? ' all-done' : ''}`}>{pct}%</span>
      </div>
      <div className="subtask-progress-track">
        <div className={`subtask-progress-fill${allDone ? ' all-done' : ''}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

// ── Export attachments dialog ─────────────────────────────────────────────────

function ExportAttachmentsDialog({
  attachments,
  onClose,
}: {
  attachments: Attachment[]
  onClose: () => void
}) {
  const [minMb,    setMinMb]   = useState('')
  const [maxMb,    setMaxMb]   = useState('')
  const [destDir,  setDestDir] = useState('')
  const [loading,  setLoading] = useState(false)
  const [result,   setResult]  = useState<{ count: number; destDir: string } | null>(null)

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const minBytes = minMb !== '' ? parseFloat(minMb) * 1024 * 1024 : null
  const maxBytes = maxMb !== '' ? parseFloat(maxMb) * 1024 * 1024 : null

  const filtered = attachments.filter((a) => {
    if (a.is_folder) return false                       // exclude folder meta-rows
    if (a.parent_attachment_id != null) return false    // exclude folder children
    if (minBytes !== null && a.size < minBytes) return false
    if (maxBytes !== null && a.size > maxBytes) return false
    return true
  })

  async function handlePickFolder() {
    const res = await window.api.dialog.openDirectory()
    if (res.success && res.data) setDestDir(res.data)
  }

  async function handleExport() {
    if (!destDir || filtered.length === 0 || loading) return
    setLoading(true)
    try {
      const files = filtered.map((a) => ({ filepath: a.filepath, filename: a.filename }))
      const res = await window.api.attachments.export(files, destDir)
      if (res.success) {
        setResult(res.data)
        await window.api.notifications.show(
          'Выгрузка завершена',
          `Скопировано файлов: ${res.data.count} → ${res.data.destDir}`
        )
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ width: 500 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Выгрузить файлы</span>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>

        {result ? (
          <div className="modal-body">
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>✅</div>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>
                Скопировано файлов: {result.count}
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: 13, wordBreak: 'break-all' }}>
                {result.destDir}
              </div>
            </div>
          </div>
        ) : (
          <>
            <div className="modal-body">
              {/* Size filter */}
              <div style={{ marginBottom: 16 }}>
                <div className="detail-section-label" style={{ marginBottom: 8 }}>
                  Фильтр по размеру (МБ)
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="от"
                    value={minMb}
                    onChange={(e) => setMinMb(e.target.value)}
                    style={{ width: 90 }}
                    className="form-input"
                  />
                  <span style={{ color: 'var(--text-secondary)' }}>—</span>
                  <input
                    type="number"
                    min={0}
                    step={0.1}
                    placeholder="до"
                    value={maxMb}
                    onChange={(e) => setMaxMb(e.target.value)}
                    style={{ width: 90 }}
                    className="form-input"
                  />
                </div>
              </div>

              {/* Destination folder */}
              <div style={{ marginBottom: 16 }}>
                <div className="detail-section-label" style={{ marginBottom: 8 }}>
                  Папка назначения
                </div>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <div
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      background: 'var(--bg-input)',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 13,
                      color: destDir ? 'var(--text-primary)' : 'var(--text-tertiary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={destDir}
                  >
                    {destDir || 'Папка не выбрана'}
                  </div>
                  <button className="btn btn-secondary btn-sm" onClick={handlePickFolder}>
                    Выбрать…
                  </button>
                </div>
              </div>

              {/* File preview list */}
              <div>
                <div className="detail-section-label" style={{ marginBottom: 8 }}>
                  Файлы под фильтр ({filtered.length})
                </div>
                {filtered.length === 0 ? (
                  <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '8px 0' }}>
                    Нет файлов, подходящих под фильтр
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: 200,
                      overflowY: 'auto',
                      border: '1px solid var(--border-color)',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {filtered.map((a) => (
                      <div
                        key={a.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '6px 10px',
                          fontSize: 13,
                          borderBottom: '1px solid var(--border-color)',
                        }}
                      >
                        <span
                          style={{
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            flex: 1,
                            marginRight: 12,
                          }}
                          title={a.filename}
                        >
                          {fileIcon(a.mime_type)} {a.filename}
                        </span>
                        <span style={{ color: 'var(--text-secondary)', flexShrink: 0 }}>
                          {formatSize(a.size)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
              <button
                className="btn btn-primary"
                onClick={() => void handleExport()}
                disabled={!destDir || filtered.length === 0 || loading}
              >
                {loading ? 'Копирование…' : `Выгрузить (${filtered.length})`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

// ── Folder attachment item ────────────────────────────────────────────────────

function FolderAttachmentItem({
  folder,
  children,
  onDelete,
  onOpen,
}: {
  folder:   Attachment
  children: Attachment[]
  onDelete: (id: number) => void
  onOpen:   (id: number) => void
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="attachment-folder-item">
      <div
        className="attachment-item"
        style={{ cursor: 'default' }}
        onDoubleClick={() => onOpen(folder.id)}
        title="Двойной клик — открыть в проводнике"
      >
        <button
          className={`attachment-folder-expand${expanded ? ' open' : ''}`}
          onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v) }}
          title={expanded ? 'Свернуть' : 'Развернуть'}
        >
          ›
        </button>
        <span className="attachment-icon">📁</span>
        <div className="attachment-info">
          <div className="attachment-name">{folder.filename}</div>
          <div className="attachment-size">
            {formatSize(folder.size)} · {children.length} файл(ов)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => onOpen(folder.id)}
            title="Открыть в проводнике"
            style={{ fontSize: 12 }}
          >
            ↗
          </button>
          <button
            className="attachment-del"
            onClick={() => onDelete(folder.id)}
            title="Удалить папку и все файлы"
          >
            🗑
          </button>
        </div>
      </div>

      {expanded && children.length > 0 && (
        <div className="attachment-folder-tree">
          {children.map((child) => (
            <div key={child.id} className="attachment-folder-child">
              <span style={{ fontSize: 14, flexShrink: 0 }}>{fileIcon(child.mime_type)}</span>
              <span className="attachment-folder-child-name" title={child.filename}>
                {child.filename}
              </span>
              <span className="attachment-folder-child-size">{formatSize(child.size)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Attachment section ────────────────────────────────────────────────────────

interface AttachmentSectionProps {
  attachments:  Attachment[]
  onAdd:        (paths?: string[]) => void
  onAddFolder:  (folderPath: string, displayName: string, replaceId?: number) => void
  onDelete:     (id: number) => void
  onOpen:       (id: number) => void
}

function AttachmentSection({ attachments, onAdd, onAddFolder, onDelete, onOpen }: AttachmentSectionProps) {
  const [lightbox,      setLightbox]      = useState<Attachment | null>(null)
  const [pdfView,       setPdfView]       = useState<Attachment | null>(null)
  const [exportOpen,    setExportOpen]    = useState(false)
  const [dragOver,      setDragOver]      = useState(false)
  const [folderDupState, setFolderDupState] = useState<{
    folderPath: string
    folderName: string
    existingId: number
  } | null>(null)

  // Partition attachments by type
  const folders          = attachments.filter((a) => a.is_folder === 1)
  const standaloneImages = attachments.filter((a) => !a.is_folder && !a.parent_attachment_id && isImage(a.mime_type))
  const standaloneOthers = attachments.filter((a) => !a.is_folder && !a.parent_attachment_id && !isImage(a.mime_type))
  const topLevelCount    = folders.length + standaloneImages.length + standaloneOthers.length

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    const paths = Array.from(e.dataTransfer.files)
      .map((f) => (f as unknown as { path: string }).path)
      .filter(Boolean)
    if (paths.length > 0) onAdd(paths)
  }

  async function handleAddFolderClick() {
    const res = await window.api.dialog.openDirectory()
    if (!res.success || !res.data) return
    const folderPath = res.data
    const folderName = folderPath.replace(/\\/g, '/').split('/').filter(Boolean).pop() ?? 'folder'

    const existing = attachments.find((a) => a.is_folder === 1 && a.filename === folderName)
    if (existing) {
      setFolderDupState({ folderPath, folderName, existingId: existing.id })
      return
    }
    onAddFolder(folderPath, folderName)
  }

  function handleFolderReplace() {
    if (!folderDupState) return
    onAddFolder(folderDupState.folderPath, folderDupState.folderName, folderDupState.existingId)
    setFolderDupState(null)
  }

  function handleFolderRename() {
    if (!folderDupState) return
    const existingNames = attachments.filter((a) => a.is_folder === 1).map((a) => a.filename)
    let i = 2
    let newName = `${folderDupState.folderName}_${i}`
    while (existingNames.includes(newName)) {
      newName = `${folderDupState.folderName}_${++i}`
    }
    onAddFolder(folderDupState.folderPath, newName)
    setFolderDupState(null)
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={dragOver ? { outline: '2px dashed var(--accent)', borderRadius: 8, backgroundColor: 'var(--bg-hover)' } : undefined}
    >
      {lightbox && (
        <ImageLightbox
          url={attachmentUrl(lightbox.id)}
          name={lightbox.filename}
          onClose={() => setLightbox(null)}
        />
      )}
      {pdfView && (
        <PdfViewer
          url={attachmentUrl(pdfView.id)}
          name={pdfView.filename}
          onClose={() => setPdfView(null)}
        />
      )}
      {exportOpen && (
        <ExportAttachmentsDialog
          attachments={attachments}
          onClose={() => setExportOpen(false)}
        />
      )}

      {/* Folder duplicate resolution modal */}
      {folderDupState && (
        <div className="modal-overlay" onClick={() => setFolderDupState(null)}>
          <div className="modal" style={{ width: 420 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Папка уже прикреплена</span>
              <button className="modal-close" onClick={() => setFolderDupState(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: 14 }}>
                Папка <strong>«{folderDupState.folderName}»</strong> уже прикреплена к этому заданию.
              </p>
              <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                Что сделать с новой версией?
              </p>
            </div>
            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button className="btn btn-secondary" onClick={() => setFolderDupState(null)}>
                Отмена
              </button>
              <button className="btn btn-secondary" onClick={handleFolderRename}>
                Переименовать
              </button>
              <button className="btn btn-primary" onClick={handleFolderReplace}>
                Заменить
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <div className="detail-section-label" style={{ marginBottom: 0 }}>
          Вложения ({topLevelCount})
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          {topLevelCount > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setExportOpen(true)}>
              Выгрузить файлы
            </button>
          )}
          <button className="btn btn-secondary btn-sm" onClick={() => onAdd()}>
            + Прикрепить файлы
          </button>
          <button className="btn btn-secondary btn-sm" onClick={() => void handleAddFolderClick()}>
            📁 Прикрепить папку
          </button>
        </div>
      </div>

      {topLevelCount === 0 ? (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 13, padding: '10px 0', textAlign: 'center' }}>
          Нет прикреплённых файлов · перетащите сюда
        </div>
      ) : (
        <>
          {/* Folder items */}
          {folders.length > 0 && (
            <div className="attachment-list" style={{ marginBottom: standaloneImages.length + standaloneOthers.length > 0 ? 8 : 0 }}>
              {folders.map((folder) => (
                <FolderAttachmentItem
                  key={folder.id}
                  folder={folder}
                  children={attachments.filter((a) => a.parent_attachment_id === folder.id)}
                  onDelete={onDelete}
                  onOpen={onOpen}
                />
              ))}
            </div>
          )}

          {/* Standalone image thumbnail strip */}
          {standaloneImages.length > 0 && (
            <div className="attachment-thumbs">
              {standaloneImages.map((a) => (
                <div
                  key={a.id}
                  className="attachment-thumb"
                  title={a.filename}
                  onClick={() => setLightbox(a)}
                >
                  <img src={attachmentUrl(a.id)} alt={a.filename} className="attachment-thumb-img" />
                  <button
                    className="attachment-thumb-del"
                    onClick={(e) => { e.stopPropagation(); onDelete(a.id) }}
                    title="Удалить"
                  >✕</button>
                </div>
              ))}
            </div>
          )}

          {/* Standalone non-image list */}
          {standaloneOthers.length > 0 && (
            <div className="attachment-list">
              {standaloneOthers.map((a) => {
                const canPreview = isPdf(a.mime_type)
                return (
                  <div
                    key={a.id}
                    className="attachment-item"
                    onDoubleClick={() => canPreview ? setPdfView(a) : onOpen(a.id)}
                    title={canPreview ? 'Двойной клик — предпросмотр' : 'Двойной клик — открыть файл'}
                  >
                    <span className="attachment-icon">{fileIcon(a.mime_type)}</span>
                    <div className="attachment-info">
                      <div className="attachment-name">{a.filename}</div>
                      <div className="attachment-size">
                        {formatSize(a.size)} · {new Date(a.created_at).toLocaleDateString('ru-RU')}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {canPreview && (
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => setPdfView(a)}
                          title="Предпросмотр PDF"
                          style={{ fontSize: 12 }}
                        >
                          👁
                        </button>
                      )}
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => onOpen(a.id)}
                        title="Открыть в системной программе"
                        style={{ fontSize: 12 }}
                      >
                        ↗
                      </button>
                      <button
                        className="attachment-del"
                        onClick={() => onDelete(a.id)}
                        title="Удалить вложение"
                      >🗑</button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TaskDetail({
  task, attachments, subtasks, allTags,
  onUpdate, onCompleteRecurring, onSetTaskTags, onCreateTag,
  onAddAttachment, onAddFolder, onDeleteAttachment, onOpenAttachment,
  onCreateSubtask, onUpdateSubtask, onDeleteSubtask, onReorderSubtasks,
  onSessionSaved,
  onClose,
}: Props) {
  // ── Title / description editing ───────────────────────────────────────────
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

  // ── Recurrence editing ────────────────────────────────────────────────────
  const [recPreset, setRecPreset]     = useState(() => ruleToPreset(task.recurrence_rule))
  const [recInterval, setRecInterval] = useState(() => {
    if (!task.recurrence_rule) return 1
    try { return (JSON.parse(task.recurrence_rule) as { interval: number }).interval } catch { return 1 }
  })
  const [recUnit, setRecUnit] = useState(() => {
    if (!task.recurrence_rule) return 'day'
    try { return (JSON.parse(task.recurrence_rule) as { unit: string }).unit } catch { return 'day' }
  })

  useEffect(() => {
    setRecPreset(ruleToPreset(task.recurrence_rule))
    if (task.recurrence_rule) {
      try {
        const r = JSON.parse(task.recurrence_rule) as { unit: string; interval: number }
        setRecInterval(r.interval)
        setRecUnit(r.unit)
      } catch { /* keep defaults */ }
    }
  }, [task.id, task.recurrence_rule])

  function handleRecurrenceChange(preset: string, interval?: number, unit?: string) {
    const p = preset
    const i = interval ?? recInterval
    const u = unit ?? recUnit
    if (preset !== 'custom') setRecPreset(p)
    else { setRecPreset(p); if (interval !== undefined) setRecInterval(interval); if (unit !== undefined) setRecUnit(u) }
    const rule = ruleFromPreset(p, i, u)
    onUpdate(task.id, { recurrence_rule: rule })
  }

  // ── Status change (with recurrence awareness) ─────────────────────────────
  function handleStatusChange(newStatus: TaskStatus) {
    if (newStatus === 'done' && task.recurrence_rule) {
      onCompleteRecurring(task.id)
    } else {
      onUpdate(task.id, { status: newStatus })
    }
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  const [tagPickerOpen, setTagPickerOpen] = useState(false)
  const [newTagName, setNewTagName]       = useState('')
  const [newTagColor, setNewTagColor]     = useState(TAG_COLORS[5])
  const [creatingTag, setCreatingTag]     = useState(false)
  const tagPickerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (tagPickerRef.current && !tagPickerRef.current.contains(e.target as Node)) {
        setTagPickerOpen(false)
        setCreatingTag(false)
        setNewTagName('')
      }
    }
    if (tagPickerOpen) document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [tagPickerOpen])

  const currentTagIds = (task.tags ?? []).map((t) => t.id)

  async function handleToggleTag(tagId: number) {
    const next = currentTagIds.includes(tagId)
      ? currentTagIds.filter((id) => id !== tagId)
      : [...currentTagIds, tagId]
    await onSetTaskTags(task.id, next)
  }

  async function handleCreateTagInline() {
    const name = newTagName.trim()
    if (!name) return
    const tag = await onCreateTag(name, newTagColor)
    await onSetTaskTags(task.id, [...currentTagIds, tag.id])
    setNewTagName('')
    setNewTagColor(TAG_COLORS[5])
    setCreatingTag(false)
  }

  // ── New subtask input ─────────────────────────────────────────────────────
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

  // ── Drag & drop ───────────────────────────────────────────────────────────
  const [dragIdx, setDragIdx]   = useState<number | null>(null)
  const [dragOver, setDragOver] = useState<number | null>(null)

  function handleDrop(dropIdx: number) {
    if (dragIdx === null || dragIdx === dropIdx) return
    const arr = [...subtasks]
    const [item] = arr.splice(dragIdx, 1)
    arr.splice(dropIdx, 0, item)
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
                onChange={(e) => handleStatusChange(e.target.value as TaskStatus)}
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

            <div className="detail-meta-item" style={{ gridColumn: 'span 2' }}>
              <label>↻ Повторение</label>
              <select
                className="inline-select"
                value={recPreset}
                onChange={(e) => handleRecurrenceChange(e.target.value)}
              >
                <option value="none">Без повторения</option>
                <option value="daily">Ежедневно</option>
                <option value="weekly">Еженедельно</option>
                <option value="monthly">Ежемесячно</option>
                <option value="custom">Свой интервал</option>
              </select>
              {recPreset === 'custom' && (
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <input
                    className="inline-select"
                    type="number"
                    min={1}
                    max={365}
                    value={recInterval}
                    style={{ width: 70 }}
                    onChange={(e) => {
                      const v = Number(e.target.value)
                      setRecInterval(v)
                      const rule = ruleFromPreset('custom', v, recUnit)
                      onUpdate(task.id, { recurrence_rule: rule })
                    }}
                  />
                  <select
                    className="inline-select"
                    value={recUnit}
                    onChange={(e) => {
                      setRecUnit(e.target.value)
                      const rule = ruleFromPreset('custom', recInterval, e.target.value)
                      onUpdate(task.id, { recurrence_rule: rule })
                    }}
                  >
                    <option value="day">дней</option>
                    <option value="week">недель</option>
                    <option value="month">месяцев</option>
                  </select>
                </div>
              )}
              {task.recurrence_rule && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                  {formatRecurrence(task.recurrence_rule)} — при выполнении создаётся следующее задание
                </div>
              )}
              {task.recurrence_parent_id && (
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 3 }}>
                  Повторяющееся задание (экземпляр)
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Tags */}
        <div>
          <div className="detail-section-label" style={{ marginBottom: 8 }}>Теги</div>
          <div className="tag-section" ref={tagPickerRef}>
            <div className="tag-pill-row">
              {(task.tags ?? []).map((tag) => (
                <span
                  key={tag.id}
                  className="tag-pill tag-pill-removable"
                  style={{ background: tag.color + '22', color: tag.color, borderColor: tag.color + '55' }}
                >
                  {tag.name}
                  <button
                    className="tag-pill-del"
                    onClick={() => handleToggleTag(tag.id)}
                    title="Убрать тег"
                  >✕</button>
                </span>
              ))}
              <button
                className="tag-add-btn"
                onClick={() => { setTagPickerOpen(!tagPickerOpen); setCreatingTag(false) }}
              >
                + тег
              </button>
            </div>

            {tagPickerOpen && (
              <div className="tag-picker">
                {allTags.length === 0 && !creatingTag && (
                  <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                    Нет тегов
                  </div>
                )}
                {allTags.map((tag) => {
                  const assigned = currentTagIds.includes(tag.id)
                  return (
                    <div
                      key={tag.id}
                      className={`tag-picker-item${assigned ? ' assigned' : ''}`}
                      onClick={() => handleToggleTag(tag.id)}
                    >
                      <span className="tag-picker-dot" style={{ background: tag.color }} />
                      <span style={{ flex: 1 }}>{tag.name}</span>
                      {assigned && <span className="tag-picker-check">✓</span>}
                    </div>
                  )
                })}

                {creatingTag ? (
                  <div className="tag-picker-create-form">
                    <input
                      className="tag-create-input"
                      autoFocus
                      value={newTagName}
                      onChange={(e) => setNewTagName(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateTagInline() } }}
                      placeholder="Название тега…"
                      maxLength={40}
                    />
                    <div className="tag-create-colors">
                      {TAG_COLORS.map((c) => (
                        <button
                          key={c}
                          className={`tag-color-dot${newTagColor === c ? ' selected' : ''}`}
                          style={{ background: c }}
                          onClick={() => setNewTagColor(c)}
                        />
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => void handleCreateTagInline()} disabled={!newTagName.trim()}>
                        Создать
                      </button>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setCreatingTag(false); setNewTagName('') }}>
                        Отмена
                      </button>
                    </div>
                  </div>
                ) : (
                  <div
                    className="tag-picker-new"
                    onClick={() => setCreatingTag(true)}
                  >
                    + Новый тег
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Manual timer */}
        <div>
          <div className="detail-section-label" style={{ marginBottom: 8 }}>Таймер</div>
          <ManualTimer taskId={task.id} subjectId={task.subject_id} onSessionSaved={onSessionSaved} />
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

        {/* Subtasks */}
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
                  onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(idx) }}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(idx) }}
                  onDrop={(e) => { e.preventDefault(); handleDrop(idx) }}
                  onDragEnd={() => { setDragIdx(null); setDragOver(null) }}
                />
              ))}
            </div>
          )}

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
        <AttachmentSection
          attachments={attachments}
          onAdd={(paths) => onAddAttachment(task.id, paths)}
          onAddFolder={(folderPath, displayName, replaceId) => onAddFolder(task.id, folderPath, displayName, replaceId)}
          onDelete={onDeleteAttachment}
          onOpen={onOpenAttachment}
        />

        {/* Footer */}
        <div style={{ color: 'var(--text-tertiary)', fontSize: 11, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
          Создано: {new Date(task.created_at).toLocaleString('ru-RU')}
        </div>
      </div>
    </>
  )
}
