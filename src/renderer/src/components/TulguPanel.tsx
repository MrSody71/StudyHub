import { useState, useEffect } from 'react'
import type { TulguConfig, TulguStatus, ScheduleDiff } from '../types'

const INTERVALS = [
  { value: '3h',     label: 'Каждые 3 часа' },
  { value: '6h',     label: 'Каждые 6 часов' },
  { value: '12h',    label: 'Каждые 12 часов' },
  { value: '24h',    label: 'Раз в сутки' },
  { value: 'manual', label: 'Вручную' },
]

interface ApiGroup { id: string; name: string }

interface Props {
  status:            TulguStatus
  onClose:           () => void
  onScheduleRefresh: () => void
}

function formatTs(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('ru-RU', {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
  })
}

function DiffBadge({ diff }: { diff: ScheduleDiff }) {
  if (!diff.added.length && !diff.removed.length && !diff.moved.length) return null
  return (
    <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.7 }}>
      {diff.added.length > 0 && (
        <div style={{ color: 'var(--success)' }}>
          + Добавлено ({diff.added.length}): {diff.added.slice(0, 3).join('; ')}
          {diff.added.length > 3 && ' …'}
        </div>
      )}
      {diff.removed.length > 0 && (
        <div style={{ color: 'var(--danger)' }}>
          − Удалено ({diff.removed.length}): {diff.removed.slice(0, 3).join('; ')}
          {diff.removed.length > 3 && ' …'}
        </div>
      )}
      {diff.moved.length > 0 && (
        <div style={{ color: 'var(--warning)' }}>
          ↔ Перенесено ({diff.moved.length}): {diff.moved.slice(0, 2).join('; ')}
          {diff.moved.length > 2 && ' …'}
        </div>
      )}
    </div>
  )
}

export default function TulguPanel({ status, onClose, onScheduleRefresh }: Props) {
  const [config, setConfig] = useState<TulguConfig>({
    baseUrl: '', token: '', groupId: '', groupName: '', entityType: 'group', interval: 'manual'
  })
  const [groups, setGroups]             = useState<ApiGroup[]>([])
  const [loadingGroups, setLoadingGroups] = useState(false)
  const [groupsError, setGroupsError]   = useState<string | null>(null)
  const [saving, setSaving]             = useState(false)
  const [saveState, setSaveState]       = useState<'idle' | 'saved'>('idle')
  const [syncing, setSyncing]           = useState(status.isSyncing)
  const [syncDiff, setSyncDiff]         = useState<ScheduleDiff | null>(null)
  const [syncMsg, setSyncMsg]           = useState<string | null>(null)
  const [syncError, setSyncError]       = useState<string | null>(null)
  const [liveStatus, setLiveStatus]     = useState<TulguStatus>(status)

  // Load saved config on open
  useEffect(() => {
    void window.api.tulgu.getConfig().then((r) => {
      if (r.success) setConfig(r.data)
    })
  }, [])

  // Track live status from background sync
  useEffect(() => {
    setLiveStatus(status)
    setSyncing(status.isSyncing)
  }, [status])

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleLoadGroups() {
    if (!config.baseUrl.trim()) return
    setLoadingGroups(true)
    setGroupsError(null)
    try {
      const r = await window.api.tulgu.fetchGroups(
        config.baseUrl.trim(), config.token.trim(), config.entityType
      )
      if (!r.success) throw new Error(r.error)
      if (r.data.length === 0) throw new Error('Список пуст — проверьте URL')
      setGroups(r.data)
      // Auto-select first if nothing saved yet
      if (!config.groupId) {
        const first = r.data[0]
        setConfig((c) => ({ ...c, groupId: first.id, groupName: first.name }))
      }
    } catch (e) {
      setGroupsError(String(e))
    } finally {
      setLoadingGroups(false)
    }
  }

  async function handleSave() {
    setSaving(true)
    try {
      await window.api.tulgu.saveConfig(config)
      setSaveState('saved')
      setTimeout(() => setSaveState('idle'), 2000)
    } finally {
      setSaving(false)
    }
  }

  async function handleSyncNow() {
    setSyncing(true)
    setSyncDiff(null)
    setSyncMsg(null)
    setSyncError(null)
    // Save current config first
    await window.api.tulgu.saveConfig(config)
    try {
      const r = await window.api.tulgu.syncNow()
      if (!r.success) throw new Error(r.error)
      if (r.data.changed) {
        setSyncDiff(r.data.diff)
        const parts: string[] = []
        if (r.data.diff.added.length)   parts.push(`+${r.data.diff.added.length} добавлено`)
        if (r.data.diff.removed.length) parts.push(`−${r.data.diff.removed.length} удалено`)
        if (r.data.diff.moved.length)   parts.push(`↔ ${r.data.diff.moved.length} перенесено`)
        setSyncMsg(parts.join(', '))
        onScheduleRefresh()
      } else {
        setSyncMsg('Расписание не изменилось')
      }
      // Refresh live status
      const s = await window.api.tulgu.getStatus()
      if (s.success) setLiveStatus(s.data)
    } catch (e) {
      setSyncError(String(e))
      const s = await window.api.tulgu.getStatus()
      if (s.success) setLiveStatus(s.data)
    } finally {
      setSyncing(false)
    }
  }

  const configured = !!(config.baseUrl && config.groupId)

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div
        className="settings-modal"
        style={{ maxHeight: '92vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="settings-header">
          <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)' }}>
            🏫 Расписание ТулГУ
          </span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        {/* ── Status ─────────────────────────────────────────────────────── */}
        <div className="settings-section">
          <div className="settings-section-title">Статус</div>

          {liveStatus.lastError ? (
            <div style={{
              background: 'var(--danger-light)', border: '1px solid var(--danger)',
              borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 10
            }}>
              <strong style={{ color: 'var(--danger)' }}>⚠ Ошибка</strong>
              <div style={{ color: 'var(--text-secondary)', marginTop: 2 }}>{liveStatus.lastError}</div>
              {liveStatus.lastErrorAt && (
                <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {formatTs(liveStatus.lastErrorAt)}
                </div>
              )}
            </div>
          ) : liveStatus.lastUpdated ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 10 }}>
              <span style={{ color: 'var(--success)' }}>✓</span> Последнее обновление:{' '}
              <strong>{formatTs(liveStatus.lastUpdated)}</strong>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 10 }}>
              Синхронизация ещё не выполнялась
            </div>
          )}

          {syncMsg && !syncError && (
            <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 8 }}>
              ✓ {syncMsg}
            </div>
          )}
          {syncError && (
            <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 8 }}>
              ⚠ {syncError}
            </div>
          )}
          {syncDiff && <DiffBadge diff={syncDiff} />}

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => void handleSyncNow()}
            disabled={syncing || !configured}
            style={{ marginTop: syncDiff ? 10 : 0 }}
          >
            {syncing ? '⟳ Синхронизация…' : 'Обновить сейчас'}
          </button>
          {!configured && (
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>
              Настройте подключение ниже, чтобы включить синхронизацию
            </div>
          )}
        </div>

        {/* ── Connection ─────────────────────────────────────────────────── */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Подключение к API</div>

          <div className="form-group">
            <label className="form-label">Базовый URL</label>
            <input
              className="form-input"
              value={config.baseUrl}
              onChange={(e) => setConfig((c) => ({ ...c, baseUrl: e.target.value }))}
              placeholder="https://tulgu.ru/api"
            />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Приложение само перебирает стандартные пути (/api/groups, /api/schedule…)
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Токен / ключ доступа (если нужен)</label>
            <input
              className="form-input"
              type="password"
              value={config.token}
              onChange={(e) => setConfig((c) => ({ ...c, token: e.target.value }))}
              placeholder="Оставьте пустым при открытом API"
            />
          </div>
        </div>

        {/* ── Group selection ─────────────────────────────────────────────── */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Группа / преподаватель</div>

          <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
            {(['group', 'teacher'] as const).map((t) => (
              <label
                key={t}
                style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}
              >
                <input
                  type="radio"
                  name="entityType"
                  checked={config.entityType === t}
                  onChange={() => setConfig((c) => ({ ...c, entityType: t, groupId: '', groupName: '' }))}
                />
                {t === 'group' ? 'По группе' : 'По преподавателю'}
              </label>
            ))}
          </div>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => void handleLoadGroups()}
            disabled={loadingGroups || !config.baseUrl.trim()}
          >
            {loadingGroups ? 'Загрузка…' : `Загрузить список ${config.entityType === 'group' ? 'групп' : 'преподавателей'}`}
          </button>

          {groupsError && (
            <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 6 }}>{groupsError}</div>
          )}

          {groups.length > 0 && (
            <div className="form-group" style={{ marginTop: 12 }}>
              <label className="form-label">
                {config.entityType === 'group' ? 'Группа' : 'Преподаватель'}
              </label>
              <select
                className="form-select"
                value={config.groupId}
                onChange={(e) => {
                  const g = groups.find((x) => x.id === e.target.value)
                  setConfig((c) => ({ ...c, groupId: e.target.value, groupName: g?.name ?? '' }))
                }}
              >
                {groups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
                Найдено: {groups.length}
              </div>
            </div>
          )}

          {groups.length === 0 && config.groupId && (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 8 }}>
              Сохранено:{' '}
              <strong>{config.groupName || config.groupId}</strong>
              <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>
                — нажмите «Загрузить список», чтобы изменить
              </span>
            </div>
          )}
        </div>

        {/* ── Auto-sync interval ──────────────────────────────────────────── */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Автоматическое обновление</div>

          <div className="form-group">
            <label className="form-label">Интервал проверки</label>
            <select
              className="form-select"
              value={config.interval}
              onChange={(e) => setConfig((c) => ({ ...c, interval: e.target.value }))}
            >
              {INTERVALS.map((i) => (
                <option key={i.value} value={i.value}>{i.label}</option>
              ))}
            </select>
          </div>

          {config.interval !== 'manual' ? (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
              Расписание обновляется при запуске и по расписанию.
              При ошибке сети — автоматический повтор через 15 минут.
              Если данные не изменились — уведомление не показывается.
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
              Обновляйте расписание вручную кнопкой «Обновить сейчас».
            </div>
          )}
        </div>

        {/* ── Save ───────────────────────────────────────────────────────── */}
        <div
          className="settings-section"
          style={{ borderTop: '1px solid var(--border)', paddingBottom: 24 }}
        >
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving
              ? 'Сохраняем…'
              : saveState === 'saved'
              ? '✓ Сохранено'
              : 'Сохранить настройки'}
          </button>
        </div>
      </div>
    </div>
  )
}
