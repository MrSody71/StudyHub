import { useState, useEffect } from 'react'
import type { TulguConfig, TulguStatus, ScheduleDiff } from '../types'

const INTERVALS = [
  { value: '3h',     label: 'Каждые 3 часа' },
  { value: '6h',     label: 'Каждые 6 часов' },
  { value: '12h',    label: 'Каждые 12 часов' },
  { value: '24h',    label: 'Раз в сутки' },
  { value: 'manual', label: 'Вручную' },
]

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

export default function TulguPanel({ status, onClose, onScheduleRefresh }: Props) {
  const [config, setConfig] = useState<TulguConfig>({ groupNumber: '', interval: 'manual' })
  const [saving, setSaving]         = useState(false)
  const [saveState, setSaveState]   = useState<'idle' | 'saved'>('idle')
  const [syncing, setSyncing]       = useState(status.isSyncing)
  const [syncDiff, setSyncDiff]     = useState<ScheduleDiff | null>(null)
  const [syncMsg, setSyncMsg]       = useState<string | null>(null)
  const [syncError, setSyncError]   = useState<string | null>(null)
  const [liveStatus, setLiveStatus] = useState<TulguStatus>(status)

  // Load saved config on open
  useEffect(() => {
    void window.api.tulgu.getConfig().then((r) => {
      if (r.success) setConfig(r.data)
    })
  }, [])

  // Mirror incoming status prop (updated by App.tsx from IPC events)
  useEffect(() => {
    setLiveStatus(status)
    setSyncing(status.isSyncing)
  }, [status])

  // ── Handlers ───────────────────────────────────────────────────────────────

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
    if (!config.groupNumber.trim()) return
    setSyncing(true)
    setSyncDiff(null)
    setSyncMsg(null)
    setSyncError(null)
    // Save first so the scheduler uses the latest group number
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
      // Refresh live status counter
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

  const configured = !!config.groupNumber.trim()

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
          <div className="settings-section-title">Статус синхронизации</div>

          {liveStatus.lastError ? (
            <div style={{
              background: 'var(--danger-light)', border: '1px solid var(--danger)',
              borderRadius: 6, padding: '8px 12px', fontSize: 12, marginBottom: 10
            }}>
              <strong style={{ color: 'var(--danger)' }}>⚠ Ошибка:</strong>{' '}
              <span style={{ color: 'var(--text-secondary)' }}>{liveStatus.lastError}</span>
              {liveStatus.lastErrorAt && (
                <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                  {formatTs(liveStatus.lastErrorAt)}
                </div>
              )}
              {liveStatus.lastUpdated && (
                <div style={{ color: 'var(--text-tertiary)', marginTop: 2 }}>
                  Последнее успешное: {formatTs(liveStatus.lastUpdated)}
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

          {syncMsg && (
            <div style={{ fontSize: 12, color: syncError ? 'var(--danger)' : 'var(--success)', marginBottom: 6 }}>
              {syncError ? `⚠ ${syncError}` : `✓ ${syncMsg}`}
            </div>
          )}
          {!syncMsg && syncError && (
            <div style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 6 }}>
              ⚠ {syncError}
            </div>
          )}
          {syncDiff && <DiffSummary diff={syncDiff} />}

          <div style={{ marginTop: syncDiff ? 12 : 0, display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => void handleSyncNow()}
              disabled={syncing || !configured}
            >
              {syncing ? '⟳ Обновление…' : 'Обновить сейчас'}
            </button>
            {!configured && (
              <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                Введите номер группы ниже
              </span>
            )}
          </div>
        </div>

        {/* ── Group number ────────────────────────────────────────────────── */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Группа</div>

          <div className="form-group">
            <label className="form-label">Номер группы ТулГУ</label>
            <input
              className="form-input"
              value={config.groupNumber}
              onChange={(e) => setConfig((c) => ({ ...c, groupNumber: e.target.value }))}
              placeholder="Например: Б260221"
              maxLength={20}
              autoFocus
            />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Используется API:{' '}
              <code style={{ fontSize: 10, background: 'var(--bg-hover)', padding: '1px 4px', borderRadius: 3 }}>
                tulsu.ru/schedule/queries/GetSchedule.php?search_field=GROUP_P&amp;search_value=…
              </code>
            </div>
          </div>
        </div>

        {/* ── Auto-sync interval ──────────────────────────────────────────── */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)' }}>
          <div className="settings-section-title">Автоматическое обновление</div>

          <div className="form-group">
            <label className="form-label">Интервал</label>
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

          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
            {config.interval !== 'manual'
              ? 'При запуске и по расписанию расписание обновляется автоматически. При ошибке — повтор через 15 мин. Если данные не изменились — уведомление не показывается.'
              : 'Обновляйте расписание вручную кнопкой «Обновить сейчас».'}
          </div>
        </div>

        {/* ── Save ───────────────────────────────────────────────────────── */}
        <div className="settings-section" style={{ borderTop: '1px solid var(--border)', paddingBottom: 24 }}>
          <button
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => void handleSave()}
            disabled={saving}
          >
            {saving ? 'Сохраняем…' : saveState === 'saved' ? '✓ Сохранено' : 'Сохранить настройки'}
          </button>
        </div>
      </div>
    </div>
  )
}
