import { useState, useEffect } from 'react'
import type { Tag, Theme, TulguConfig, TulguStatus, ScheduleDiff, Subject } from '../types'
import type { SyncStatus } from '../lib/sync'
import MoodleSection from './MoodleSection'

const TAG_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e',
  '#14b8a6','#3b82f6','#8b5cf6','#ec4899',
  '#06b6d4','#84cc16','#f43f5e','#6366f1',
]

const INTERVALS = [
  { value: '3h',     label: 'Каждые 3 часа' },
  { value: '6h',     label: 'Каждые 6 часов' },
  { value: '12h',    label: 'Каждые 12 часов' },
  { value: '24h',    label: 'Раз в сутки' },
  { value: 'manual', label: 'Вручную' },
]

function formatTs(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function DiffSummary({ diff }: { diff: ScheduleDiff }) {
  if (!diff.added.length && !diff.removed.length && !diff.moved.length) return null
  return (
    <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.8 }}>
      {diff.added.length > 0 && (
        <div style={{ color: 'var(--success)' }}>
          + Добавлено {diff.added.length}: {diff.added.slice(0, 3).join('; ')}
          {diff.added.length > 3 && ` и ещё ${diff.added.length - 3}…`}
        </div>
      )}
      {diff.removed.length > 0 && (
        <div style={{ color: 'var(--danger)' }}>
          − Удалено {diff.removed.length}: {diff.removed.slice(0, 3).join('; ')}
          {diff.removed.length > 3 && ` и ещё ${diff.removed.length - 3}…`}
        </div>
      )}
      {diff.moved.length > 0 && (
        <div style={{ color: 'var(--warning)' }}>
          ↔ Перенесено {diff.moved.length}: {diff.moved.slice(0, 2).join('; ')}
          {diff.moved.length > 2 && ` и ещё ${diff.moved.length - 2}…`}
        </div>
      )}
    </div>
  )
}

interface Props {
  theme:                Theme
  tags:                 Tag[]
  subjects:             Subject[]
  gradeScale:           number
  appVersion:           string
  checkStatus:          'idle' | 'checking' | 'up-to-date' | 'error'
  tulguStatus:          TulguStatus
  supaUser:             { email: string; id: string } | null
  supaConfigured:       boolean
  supabaseUrl:          string
  supabaseKey:          string
  syncStatus:           SyncStatus
  lastSyncAt:           string | null
  onThemeChange:        (t: Theme) => void
  onGradeScaleChange:   (scale: number) => void
  onCreateTag:          (name: string, color: string) => Promise<Tag>
  onUpdateTag:          (id: number, data: { name?: string; color?: string }) => Promise<void>
  onDeleteTag:          (id: number) => Promise<void>
  onCheckForUpdates:    () => void
  onScheduleRefresh:    () => void
  onSaveSupabaseConfig: (url: string, key: string) => Promise<void>
  onOpenAuth:           () => void
  onSignOut:            () => Promise<void>
  onManualSync:         () => void
  onSubjectsChanged:    () => void
  onClose:              () => void
}

export default function SettingsPanel({ theme, tags, subjects, gradeScale, appVersion, checkStatus, tulguStatus, supaUser, supaConfigured, supabaseUrl, supabaseKey, syncStatus, lastSyncAt, onThemeChange, onGradeScaleChange, onCreateTag, onUpdateTag, onDeleteTag, onCheckForUpdates, onScheduleRefresh, onSaveSupabaseConfig, onOpenAuth, onSignOut, onManualSync, onSubjectsChanged, onClose }: Props) {

  // ── TulGU integration ───────────────────────────────────────────────────
  const [tulguConfig, setTulguConfig] = useState<TulguConfig>({ groupNumber: '', interval: 'manual' })
  const [tulguSaving, setTulguSaving]       = useState(false)
  const [tulguSaveState, setTulguSaveState] = useState<'idle' | 'saved'>('idle')
  const [tulguSyncing, setTulguSyncing]     = useState(tulguStatus.isSyncing)
  const [tulguSyncDiff, setTulguSyncDiff]   = useState<ScheduleDiff | null>(null)
  const [tulguSyncMsg, setTulguSyncMsg]     = useState<string | null>(null)
  const [tulguSyncError, setTulguSyncError] = useState<string | null>(null)
  const [tulguLiveStatus, setTulguLiveStatus] = useState<TulguStatus>(tulguStatus)

  useEffect(() => {
    void window.api.tulgu.getConfig().then((r) => {
      if (r.success) setTulguConfig(r.data)
    })
  }, [])

  useEffect(() => {
    setTulguLiveStatus(tulguStatus)
    setTulguSyncing(tulguStatus.isSyncing)
  }, [tulguStatus])

  async function handleTulguSave() {
    setTulguSaving(true)
    try {
      await window.api.tulgu.saveConfig(tulguConfig)
      setTulguSaveState('saved')
      setTimeout(() => setTulguSaveState('idle'), 2000)
    } finally {
      setTulguSaving(false)
    }
  }

  async function handleTulguSyncNow() {
    if (!tulguConfig.groupNumber.trim()) return
    setTulguSyncing(true)
    setTulguSyncDiff(null)
    setTulguSyncMsg(null)
    setTulguSyncError(null)
    await window.api.tulgu.saveConfig(tulguConfig)
    try {
      const r = await window.api.tulgu.syncNow()
      if (!r.success) throw new Error(r.error)
      if (r.data.changed) {
        setTulguSyncDiff(r.data.diff)
        const parts: string[] = []
        if (r.data.diff.added.length)   parts.push(`+${r.data.diff.added.length} добавлено`)
        if (r.data.diff.removed.length) parts.push(`−${r.data.diff.removed.length} удалено`)
        if (r.data.diff.moved.length)   parts.push(`↔ ${r.data.diff.moved.length} перенесено`)
        setTulguSyncMsg(parts.join(', '))
        onScheduleRefresh()
      } else {
        setTulguSyncMsg('Расписание не изменилось')
      }
      const s = await window.api.tulgu.getStatus()
      if (s.success) setTulguLiveStatus(s.data)
    } catch (e) {
      setTulguSyncError(String(e))
      const s = await window.api.tulgu.getStatus()
      if (s.success) setTulguLiveStatus(s.data)
    } finally {
      setTulguSyncing(false)
    }
  }

  const tulguConfigured = !!tulguConfig.groupNumber.trim()

  // ── Supabase config form ────────────────────────────────────────────────
  const [supaUrl,     setSupaUrl]     = useState(supabaseUrl)
  const [supaKey,     setSupaKey]     = useState(supabaseKey)
  const [supaSaving,  setSupaSaving]  = useState(false)
  const [supaExpanded, setSupaExpanded] = useState(false)

  function handleExpandSupaForm() {
    setSupaUrl(supabaseUrl)
    setSupaKey(supabaseKey)
    setSupaExpanded(true)
  }

  async function handleSaveSupabase() {
    setSupaSaving(true)
    try {
      await onSaveSupabaseConfig(supaUrl, supaKey)
      setSupaExpanded(false)
    } finally {
      setSupaSaving(false)
    }
  }

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

        {/* Grade scale section */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Шкала оценок</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 500 }}>
              Максимальный балл
            </label>
            <div className="theme-toggle">
              {[5, 10, 100].map((s) => (
                <button
                  key={s}
                  className={`theme-option${gradeScale === s ? ' active' : ''}`}
                  onClick={() => onGradeScaleChange(s)}
                >
                  {s}
                </button>
              ))}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Задаёт отображение среднего балла. Оценки по-прежнему можно вводить в любом масштабе.
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

        {/* ── Интеграции → ТулГУ ─────────────────────────────────────────── */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Интеграции → ТулГУ</div>

          {/* Status */}
          {tulguLiveStatus.lastError ? (
            <div style={{
              background: 'var(--danger-light)', border: '1px solid var(--danger)',
              borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 10
            }}>
              <strong style={{ color: 'var(--danger)' }}>⚠ Ошибка:</strong>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>{tulguLiveStatus.lastError}</span>
              {tulguLiveStatus.lastErrorAt && (
                <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {formatTs(tulguLiveStatus.lastErrorAt)}
                </div>
              )}
              {tulguLiveStatus.lastUpdated && (
                <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Последнее успешное: {formatTs(tulguLiveStatus.lastUpdated)}
                </div>
              )}
            </div>
          ) : tulguLiveStatus.lastUpdated ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              <span style={{ color: 'var(--success)' }}>✓</span> Последнее обновление:{' '}
              <strong>{formatTs(tulguLiveStatus.lastUpdated)}</strong>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
              Синхронизация ещё не выполнялась
            </div>
          )}

          {tulguSyncMsg && (
            <div style={{ fontSize: 12, color: tulguSyncError ? 'var(--danger)' : 'var(--success)', marginBottom: 6 }}>
              {tulguSyncError ? `⚠ ${tulguSyncError}` : `✓ ${tulguSyncMsg}`}
            </div>
          )}
          {!tulguSyncMsg && tulguSyncError && (
            <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 6 }}>
              ⚠ {tulguSyncError}
            </div>
          )}
          {tulguSyncDiff && <DiffSummary diff={tulguSyncDiff} />}

          <div style={{ marginTop: tulguSyncDiff ? 12 : 0, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void handleTulguSyncNow()}
              disabled={tulguSyncing || !tulguConfigured}
            >
              {tulguSyncing ? '⟳ Обновление…' : 'Обновить сейчас'}
            </button>
            {!tulguConfigured && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Введите номер группы ниже
              </span>
            )}
          </div>

          {/* Group number */}
          <div className="form-group">
            <label className="form-label">Номер группы ТулГУ</label>
            <input
              className="form-input"
              value={tulguConfig.groupNumber}
              onChange={(e) => setTulguConfig((c) => ({ ...c, groupNumber: e.target.value }))}
              placeholder="Например: Б260221"
              maxLength={20}
            />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Используется API:{' '}
              <code style={{ fontSize: 10, background: 'var(--bg-hover)', padding: '1px 4px', borderRadius: 3 }}>
                tulsu.ru/schedule/queries/GetSchedule.php?search_field=GROUP_P&amp;search_value=…
              </code>
            </div>
          </div>

          {/* Auto-sync interval */}
          <div className="form-group">
            <label className="form-label">Интервал автообновления</label>
            <select
              className="form-select"
              value={tulguConfig.interval}
              onChange={(e) => setTulguConfig((c) => ({ ...c, interval: e.target.value }))}
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 4, lineHeight: 1.6 }}>
              {tulguConfig.interval !== 'manual'
                ? 'При запуске и по расписанию расписание обновляется автоматически. При ошибке — повтор через 15 мин.'
                : 'Обновляйте расписание вручную кнопкой «Обновить сейчас».'}
            </div>
          </div>

          <button
            className="btn btn-primary btn-sm"
            style={{ width: '100%', marginTop: 4 }}
            onClick={() => void handleTulguSave()}
            disabled={tulguSaving}
          >
            {tulguSaving ? 'Сохраняем…' : tulguSaveState === 'saved' ? '✓ Сохранено' : 'Сохранить настройки ТулГУ'}
          </button>
        </div>

        {/* ── Интеграции → Moodle ────────────────────────────────────────── */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Интеграции → Moodle</div>
          <MoodleSection subjects={subjects} onSubjectsChanged={onSubjectsChanged} />
        </div>

        {/* Supabase / account section */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Аккаунт</div>

          {supaUser ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                <span style={{ color: 'var(--success)' }}>●</span>{' '}
                Вы вошли как <strong style={{ color: 'var(--text-primary)' }}>{supaUser.email}</strong>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
                {syncStatus === 'syncing' && (
                  <span style={{ color: 'var(--accent)' }}>⟳ Синхронизация…</span>
                )}
                {syncStatus === 'error' && (
                  <span style={{ color: 'var(--danger)' }}>⚠ Ошибка синхронизации</span>
                )}
                {syncStatus === 'idle' && lastSyncAt && (
                  <>
                    <span style={{ color: 'var(--success)' }}>✓</span>{' '}
                    Синхронизировано:{' '}
                    {new Date(lastSyncAt).toLocaleString('ru-RU', {
                      day: 'numeric', month: 'short',
                      hour: '2-digit', minute: '2-digit',
                    })}
                  </>
                )}
                {syncStatus === 'idle' && !lastSyncAt && (
                  <span>Синхронизация ещё не выполнялась</span>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={onManualSync}
                  disabled={syncStatus === 'syncing'}
                >
                  {syncStatus === 'syncing' ? 'Синхронизация…' : '↻ Синхронизировать'}
                </button>
                <button className="btn btn-ghost btn-sm"
                  onClick={() => void onSignOut()}>
                  Выйти
                </button>
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {supaConfigured ? (
                <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                  Supabase настроен. Войдите в аккаунт.
                </div>
              ) : (
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
                  Авторизация через Supabase. Укажите URL и Anon Key вашего проекта.
                </div>
              )}

              {!supaExpanded ? (
                <div style={{ display: 'flex', gap: 8 }}>
                  {supaConfigured && (
                    <button className="btn btn-primary btn-sm" onClick={onOpenAuth}>
                      Войти в аккаунт
                    </button>
                  )}
                  <button className="btn btn-secondary btn-sm"
                    onClick={handleExpandSupaForm}>
                    {supaConfigured ? 'Изменить настройки' : 'Настроить Supabase'}
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Supabase URL</label>
                    <input
                      className="form-input"
                      type="url"
                      placeholder="https://xxxx.supabase.co"
                      value={supaUrl}
                      onChange={(e) => setSupaUrl(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Anon Key</label>
                    <input
                      className="form-input"
                      type="password"
                      placeholder="eyJhbGciOiJIUzI1NiIs…"
                      value={supaKey}
                      onChange={(e) => setSupaKey(e.target.value)}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button className="btn btn-primary btn-sm"
                      onClick={() => void handleSaveSupabase()}
                      disabled={supaSaving || !supaUrl.trim() || !supaKey.trim()}>
                      {supaSaving ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                    <button className="btn btn-ghost btn-sm"
                      onClick={() => setSupaExpanded(false)}>
                      Отмена
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* About / updates section */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">О приложении</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              <strong style={{ color: 'var(--text-primary)' }}>StudyHub</strong>
              {appVersion && (
                <span style={{ marginLeft: 6, color: 'var(--text-tertiary)' }}>
                  v{appVersion}
                </span>
              )}
              <br />
              Данные хранятся локально на вашем компьютере.
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={onCheckForUpdates}
                disabled={checkStatus === 'checking'}
              >
                {checkStatus === 'checking' ? 'Проверяем…' : 'Проверить обновления'}
              </button>

              {checkStatus === 'up-to-date' && (
                <span style={{ fontSize: 12, color: 'var(--success, #22c55e)' }}>
                  ✓ Установлена последняя версия
                </span>
              )}
              {checkStatus === 'error' && (
                <span style={{ fontSize: 12, color: 'var(--danger)' }}>
                  Не удалось подключиться к серверу обновлений
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
