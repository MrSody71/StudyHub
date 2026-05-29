import { useState } from 'react'
import type { Subject, Task, TaskStatus, TaskPriority } from '../types'

interface Props {
  subject:          Subject | null
  tasks:            Task[]
  selectedTaskId:   number | null
  onSelectTask:     (id: number) => void
  onCreateTask:     (data: Omit<Task, 'id' | 'created_at'>) => void
  onUpdateTask:     (id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id'>>) => void
  onDeleteTask:     (id: number) => void
}

const STATUS_LABELS: Record<TaskStatus, string> = {
  not_started: 'Не начато',
  in_progress: 'В процессе',
  done:        'Выполнено',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low:    'Низкий',
  medium: 'Средний',
  high:   'Высокий',
}

// ── Deadline helpers ──────────────────────────────────────────────────────────

/** Start-of-day Date in local timezone. */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

/** Days between two start-of-day values (can be negative). */
function daysDiff(due: Date): number {
  const today = startOfDay(new Date())
  const dueDay = startOfDay(due)
  return Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)
}

type DueUrgency = 'overdue' | 'upcoming' | 'normal' | 'none'

function getDueUrgency(due: string | null, status: TaskStatus): DueUrgency {
  if (!due || status === 'done') return 'none'
  const diff = daysDiff(new Date(due))
  if (diff < 0)  return 'overdue'
  if (diff <= 3) return 'upcoming'
  return 'normal'
}

function formatDueLabel(due: string | null, urgency: DueUrgency): string {
  if (!due) return ''
  const diff = urgency === 'overdue' || urgency === 'upcoming'
    ? daysDiff(new Date(due))
    : null

  const dateStr = new Date(due).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })

  if (urgency === 'overdue') return `⚠ ${dateStr} (просрочено)`
  if (urgency === 'upcoming') {
    if (diff === 0) return '🔴 Сегодня'
    if (diff === 1) return '🟠 Завтра'
    return `🟡 Через ${diff} ${diff === 2 ? 'дня' : 'дня'}`
  }
  return `📅 ${dateStr}`
}

// ── Sort ──────────────────────────────────────────────────────────────────────

/**
 * Sort order:
 *  0 – overdue (closest overdue first, i.e. least negative diff)
 *  1 – upcoming ≤ 3 days (soonest first)
 *  2 – future > 3 days (soonest first)
 *  3 – no deadline (by created_at desc)
 *  4 – done (by created_at desc)
 */
function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const urgencyRank = (t: Task): number => {
      if (t.status === 'done') return 4
      const u = getDueUrgency(t.due_date, t.status)
      if (u === 'overdue')  return 0
      if (u === 'upcoming') return 1
      if (u === 'normal')   return 2
      return 3
    }

    const ra = urgencyRank(a)
    const rb = urgencyRank(b)
    if (ra !== rb) return ra - rb

    // Within the same urgency group: sort by due_date asc (groups 0-2),
    // or by created_at desc (groups 3-4)
    if (ra <= 2 && a.due_date && b.due_date) {
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
    }
    return a.created_at > b.created_at ? -1 : 1
  })
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TaskList({
  subject, tasks, selectedTaskId,
  onSelectTask, onCreateTask, onUpdateTask, onDeleteTask,
}: Props) {
  const [showModal, setShowModal] = useState(false)
  const [title, setTitle]         = useState('')
  const [desc, setDesc]           = useState('')
  const [status, setStatus]       = useState<TaskStatus>('not_started')
  const [priority, setPriority]   = useState<TaskPriority>('medium')
  const [dueDate, setDueDate]     = useState('')
  const [saving, setSaving]       = useState(false)

  function openModal() {
    setTitle(''); setDesc(''); setStatus('not_started'); setPriority('medium'); setDueDate('')
    setShowModal(true)
  }

  function closeModal() { setShowModal(false) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !subject) return
    setSaving(true)
    try {
      await onCreateTask({
        subject_id:  subject.id,
        title:       title.trim(),
        description: desc.trim() || null,
        status,
        priority,
        due_date: dueDate || null,
      })
      closeModal()
    } finally {
      setSaving(false)
    }
  }

  function cycleStatus(e: React.MouseEvent, task: Task) {
    e.stopPropagation()
    const next: Record<TaskStatus, TaskStatus> = {
      not_started: 'in_progress',
      in_progress: 'done',
      done:        'not_started',
    }
    onUpdateTask(task.id, { status: next[task.status] })
  }

  const statusIcons: Record<TaskStatus, string> = {
    not_started: '',
    in_progress: '◐',
    done:        '✓',
  }

  if (!subject) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <div className="empty-state-icon">📖</div>
        <div className="empty-state-title">Выберите предмет</div>
        <div className="empty-state-desc">Выберите предмет из списка слева или создайте новый</div>
      </div>
    )
  }

  const sorted = sortTasks(tasks)

  // Counts for header badge
  const overdueCount  = tasks.filter((t) => getDueUrgency(t.due_date, t.status) === 'overdue').length
  const upcomingCount = tasks.filter((t) => getDueUrgency(t.due_date, t.status) === 'upcoming').length

  return (
    <>
      <div className="panel-header">
        <div className="panel-title">
          <span className="panel-title-dot" style={{ background: subject.color }} />
          {subject.name}
          <span style={{ fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)' }}>
            {tasks.length} {tasks.length === 1 ? 'задание' : tasks.length < 5 ? 'задания' : 'заданий'}
          </span>
          {overdueCount > 0 && (
            <span className="deadline-badge deadline-badge-overdue" title="Просрочено">
              {overdueCount} просрочено
            </span>
          )}
          {overdueCount === 0 && upcomingCount > 0 && (
            <span className="deadline-badge deadline-badge-upcoming" title="Срок скоро">
              {upcomingCount} скоро
            </span>
          )}
        </div>
        <div className="panel-actions">
          <button className="btn btn-primary btn-sm" onClick={openModal}>
            + Задание
          </button>
        </div>
      </div>

      <div className="task-list">
        {sorted.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">✅</div>
            <div className="empty-state-title">Заданий нет</div>
            <div className="empty-state-desc">Добавьте первое задание, нажав кнопку «+ Задание»</div>
          </div>
        ) : (
          sorted.map((t) => {
            const urgency = getDueUrgency(t.due_date, t.status)
            const dueLabel = formatDueLabel(t.due_date, urgency)

            const itemClass = [
              'task-item',
              selectedTaskId === t.id ? 'selected'  : '',
              t.status === 'done'     ? 'done'       : '',
              urgency === 'overdue'   ? 'overdue'    : '',
              urgency === 'upcoming'  ? 'upcoming'   : '',
            ].filter(Boolean).join(' ')

            return (
              <div
                key={t.id}
                className={itemClass}
                onClick={() => onSelectTask(t.id)}
              >
                <button
                  className={`task-status-icon ${t.status}`}
                  onClick={(e) => cycleStatus(e, t)}
                  title="Изменить статус"
                >
                  {statusIcons[t.status]}
                </button>

                <div className="task-item-body">
                  <div className="task-item-title">{t.title}</div>
                  <div className="task-item-meta">
                    <span className={`badge badge-${t.status}`}>{STATUS_LABELS[t.status]}</span>
                    <span className={`priority-dot priority-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span>
                    {dueLabel && (
                      <span className={`due-date${urgency !== 'none' && urgency !== 'normal' ? ` due-${urgency}` : ''}`}>
                        {dueLabel}
                      </span>
                    )}
                  </div>
                  {(t.subtask_total ?? 0) > 0 && (
                    <div className="task-item-progress">
                      <div className="task-item-progress-track">
                        <div
                          className={`task-item-progress-fill${t.subtask_done === t.subtask_total ? ' all-done' : ''}`}
                          style={{ width: `${Math.round(((t.subtask_done ?? 0) / (t.subtask_total ?? 1)) * 100)}%` }}
                        />
                      </div>
                      <span className="task-item-progress-label">
                        {t.subtask_done ?? 0}/{t.subtask_total}
                      </span>
                    </div>
                  )}
                </div>

                <button
                  className="task-delete-btn"
                  onClick={(e) => { e.stopPropagation(); onDeleteTask(t.id) }}
                  title="Удалить задание"
                >
                  🗑
                </button>
              </div>
            )
          })
        )}
      </div>

      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Новое задание</span>
              <button className="btn btn-ghost btn-sm" onClick={closeModal}>✕</button>
            </div>

            <form onSubmit={handleSubmit}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Заголовок *</label>
                  <input
                    className="form-input"
                    autoFocus
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Что нужно сделать?"
                    maxLength={200}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">Описание</label>
                  <textarea
                    className="form-textarea"
                    value={desc}
                    onChange={(e) => setDesc(e.target.value)}
                    placeholder="Подробности задания…"
                    rows={3}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div className="form-group">
                    <label className="form-label">Статус</label>
                    <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
                      <option value="not_started">Не начато</option>
                      <option value="in_progress">В процессе</option>
                      <option value="done">Выполнено</option>
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label">Приоритет</label>
                    <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value as TaskPriority)}>
                      <option value="low">Низкий</option>
                      <option value="medium">Средний</option>
                      <option value="high">Высокий</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Дедлайн</label>
                  <input
                    className="form-input"
                    type="date"
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={closeModal}>Отмена</button>
                <button type="submit" className="btn btn-primary" disabled={saving || !title.trim()}>
                  {saving ? 'Создаём…' : 'Создать'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  )
}
