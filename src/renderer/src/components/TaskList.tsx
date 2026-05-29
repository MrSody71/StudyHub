import { useState, useMemo } from 'react'
import type { Subject, Task, Tag, TaskStatus, TaskPriority } from '../types'

interface Props {
  subject:              Subject | null
  tasks:                Task[]
  allTags:              Tag[]
  selectedTaskId:       number | null
  onSelectTask:         (id: number) => void
  onCreateTask:         (data: Omit<Task, 'id' | 'created_at'>) => void
  onUpdateTask:         (id: number, data: Partial<Omit<Task, 'id' | 'created_at' | 'subject_id'>>) => void
  onDeleteTask:         (id: number) => void
  onCompleteRecurring:  (id: number) => void
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

const TAG_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
]

// ── Recurrence helpers ────────────────────────────────────────────────────────

function formatRecurrence(rule: string | null | undefined): string {
  if (!rule) return ''
  try {
    const r = JSON.parse(rule) as { unit: string; interval: number }
    if (r.interval === 1) {
      if (r.unit === 'day')   return 'Каждый день'
      if (r.unit === 'week')  return 'Каждую неделю'
      if (r.unit === 'month') return 'Каждый месяц'
    }
    const u = r.unit === 'day' ? 'дн.' : r.unit === 'week' ? 'нед.' : 'мес.'
    return `Каждые ${r.interval} ${u}`
  } catch { return '' }
}

function ruleFromPreset(preset: string, customInterval: number, customUnit: string): string | null {
  if (preset === 'none') return null
  if (preset === 'daily')   return JSON.stringify({ unit: 'day',   interval: 1 })
  if (preset === 'weekly')  return JSON.stringify({ unit: 'week',  interval: 1 })
  if (preset === 'monthly') return JSON.stringify({ unit: 'month', interval: 1 })
  if (preset === 'custom')  return JSON.stringify({ unit: customUnit, interval: Math.max(1, customInterval) })
  return null
}

// ── Deadline helpers ──────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

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

    if (ra <= 2 && a.due_date && b.due_date) {
      return a.due_date < b.due_date ? -1 : a.due_date > b.due_date ? 1 : 0
    }
    return a.created_at > b.created_at ? -1 : 1
  })
}

// ─────────────────────────────────────────────────────────────────────────────

export default function TaskList({
  subject, tasks, allTags, selectedTaskId,
  onSelectTask, onCreateTask, onUpdateTask, onDeleteTask, onCompleteRecurring,
}: Props) {
  // ── Create modal state ────────────────────────────────────────────────────
  const [showModal, setShowModal]     = useState(false)
  const [title, setTitle]             = useState('')
  const [desc, setDesc]               = useState('')
  const [status, setStatus]           = useState<TaskStatus>('not_started')
  const [priority, setPriority]       = useState<TaskPriority>('medium')
  const [dueDate, setDueDate]         = useState('')
  const [recPreset, setRecPreset]     = useState('none')
  const [recInterval, setRecInterval] = useState(1)
  const [recUnit, setRecUnit]         = useState('day')
  const [saving, setSaving]           = useState(false)

  // ── Search & filter state ─────────────────────────────────────────────────
  const [search, setSearch]               = useState('')
  const [filterStatus, setFilterStatus]   = useState('all')
  const [filterPriority, setFilterPriority] = useState('all')
  const [filterTag, setFilterTag]         = useState('all')
  const [filterDeadline, setFilterDeadline] = useState('all')

  function openModal() {
    setTitle(''); setDesc(''); setStatus('not_started'); setPriority('medium'); setDueDate('')
    setRecPreset('none'); setRecInterval(1); setRecUnit('day')
    setShowModal(true)
  }

  function closeModal() { setShowModal(false) }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !subject) return
    setSaving(true)
    try {
      const recurrence_rule = ruleFromPreset(recPreset, recInterval, recUnit)
      await onCreateTask({
        subject_id:       subject.id,
        title:            title.trim(),
        description:      desc.trim() || null,
        status,
        priority,
        due_date:         dueDate || null,
        recurrence_rule,
        recurrence_parent_id: null,
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
    const nextStatus = next[task.status]
    if (nextStatus === 'done' && task.recurrence_rule) {
      onCompleteRecurring(task.id)
    } else {
      onUpdateTask(task.id, { status: nextStatus })
    }
  }

  const statusIcons: Record<TaskStatus, string> = {
    not_started: '',
    in_progress: '◐',
    done:        '✓',
  }

  // ── Filtering ─────────────────────────────────────────────────────────────
  const hasFilters = search || filterStatus !== 'all' || filterPriority !== 'all' || filterTag !== 'all' || filterDeadline !== 'all'

  const filtered = useMemo(() => {
    let result = tasks

    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        (t.description ?? '').toLowerCase().includes(q)
      )
    }
    if (filterStatus !== 'all')
      result = result.filter((t) => t.status === filterStatus)
    if (filterPriority !== 'all')
      result = result.filter((t) => t.priority === filterPriority)
    if (filterTag !== 'all')
      result = result.filter((t) => (t.tags ?? []).some((tag) => tag.id === Number(filterTag)))
    if (filterDeadline === 'overdue')
      result = result.filter((t) => getDueUrgency(t.due_date, t.status) === 'overdue')
    else if (filterDeadline === 'upcoming')
      result = result.filter((t) => getDueUrgency(t.due_date, t.status) === 'upcoming')
    else if (filterDeadline === 'none')
      result = result.filter((t) => !t.due_date)
    else if (filterDeadline === 'has')
      result = result.filter((t) => !!t.due_date)

    return result
  }, [tasks, search, filterStatus, filterPriority, filterTag, filterDeadline])

  const sorted = sortTasks(filtered)

  // Header badges computed from full tasks array
  const overdueCount  = tasks.filter((t) => getDueUrgency(t.due_date, t.status) === 'overdue').length
  const upcomingCount = tasks.filter((t) => getDueUrgency(t.due_date, t.status) === 'upcoming').length

  function clearFilters() {
    setSearch(''); setFilterStatus('all'); setFilterPriority('all')
    setFilterTag('all'); setFilterDeadline('all')
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

      {/* Search + Filter bar */}
      <div className="search-filter-bar">
        <input
          className="search-input"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Поиск по заданиям…"
        />
        <div className="filter-row">
          <select className="filter-select" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="all">Все статусы</option>
            <option value="not_started">Не начато</option>
            <option value="in_progress">В процессе</option>
            <option value="done">Выполнено</option>
          </select>
          <select className="filter-select" value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)}>
            <option value="all">Все приоритеты</option>
            <option value="low">Низкий</option>
            <option value="medium">Средний</option>
            <option value="high">Высокий</option>
          </select>
          <select className="filter-select" value={filterTag} onChange={(e) => setFilterTag(e.target.value)}>
            <option value="all">Все теги</option>
            {allTags.map((tag) => (
              <option key={tag.id} value={tag.id}>{tag.name}</option>
            ))}
          </select>
          <select className="filter-select" value={filterDeadline} onChange={(e) => setFilterDeadline(e.target.value)}>
            <option value="all">Любой дедлайн</option>
            <option value="overdue">Просрочено</option>
            <option value="upcoming">Скоро (≤3 дн.)</option>
            <option value="has">Есть дедлайн</option>
            <option value="none">Без дедлайна</option>
          </select>
          {hasFilters && (
            <button className="btn btn-ghost btn-sm" onClick={clearFilters} title="Сбросить фильтры">✕</button>
          )}
        </div>
      </div>

      <div className="task-list">
        {sorted.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">{hasFilters ? '🔍' : '✅'}</div>
            <div className="empty-state-title">{hasFilters ? 'Ничего не найдено' : 'Заданий нет'}</div>
            <div className="empty-state-desc">
              {hasFilters
                ? 'Попробуйте изменить критерии поиска или фильтры'
                : 'Добавьте первое задание, нажав кнопку «+ Задание»'}
            </div>
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
                  <div className="task-item-title">
                    {t.recurrence_rule && (
                      <span className="recurrence-icon" title={formatRecurrence(t.recurrence_rule)}>↻</span>
                    )}
                    {t.title}
                  </div>
                  <div className="task-item-meta">
                    <span className={`badge badge-${t.status}`}>{STATUS_LABELS[t.status]}</span>
                    <span className={`priority-dot priority-${t.priority}`}>{PRIORITY_LABELS[t.priority]}</span>
                    {dueLabel && (
                      <span className={`due-date${urgency !== 'none' && urgency !== 'normal' ? ` due-${urgency}` : ''}`}>
                        {dueLabel}
                      </span>
                    )}
                  </div>
                  {(t.tags ?? []).length > 0 && (
                    <div className="tag-pill-row" style={{ marginTop: 5 }}>
                      {(t.tags ?? []).map((tag) => (
                        <span
                          key={tag.id}
                          className="tag-pill"
                          style={{ background: tag.color + '22', color: tag.color, borderColor: tag.color + '55' }}
                        >
                          {tag.name}
                        </span>
                      ))}
                    </div>
                  )}
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

      {/* Create task modal */}
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

                <div className="form-group">
                  <label className="form-label">Повторение ↻</label>
                  <select className="form-select" value={recPreset} onChange={(e) => setRecPreset(e.target.value)}>
                    <option value="none">Без повторения</option>
                    <option value="daily">Ежедневно</option>
                    <option value="weekly">Еженедельно</option>
                    <option value="monthly">Ежемесячно</option>
                    <option value="custom">Свой интервал</option>
                  </select>
                  {recPreset === 'custom' && (
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      <input
                        className="form-input"
                        type="number"
                        min={1}
                        max={365}
                        value={recInterval}
                        onChange={(e) => setRecInterval(Number(e.target.value))}
                        style={{ width: 80 }}
                      />
                      <select className="form-select" value={recUnit} onChange={(e) => setRecUnit(e.target.value)}>
                        <option value="day">дней</option>
                        <option value="week">недель</option>
                        <option value="month">месяцев</option>
                      </select>
                    </div>
                  )}
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
