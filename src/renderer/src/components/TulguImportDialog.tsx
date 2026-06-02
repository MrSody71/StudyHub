import { useState } from 'react'
import type { BatchImportEntry, BatchImportResult } from '../types'

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

interface ApiGroup {
  id:   string
  name: string
}

interface Props {
  onImport: (entries: BatchImportEntry[], replace: boolean) => Promise<BatchImportResult>
  onClose:  () => void
}

type Step = 'config' | 'select' | 'preview' | 'done'

// ── Step indicator ────────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  config:  '1. Подключение',
  select:  '2. Группа / дата',
  preview: '3. Предпросмотр',
  done:    '4. Готово',
}

function StepBar({ current }: { current: Step }) {
  const steps: Step[] = ['config', 'select', 'preview', 'done']
  const idx = steps.indexOf(current)
  return (
    <div style={{ display: 'flex', gap: 0, marginBottom: 20 }}>
      {steps.map((s, i) => (
        <div
          key={s}
          style={{
            flex: 1,
            padding: '6px 8px',
            fontSize: 11,
            fontWeight: i <= idx ? 600 : 400,
            color: i < idx ? 'var(--primary)' : i === idx ? 'var(--text)' : 'var(--text-muted)',
            borderBottom: `2px solid ${i <= idx ? 'var(--primary)' : 'var(--border)'}`,
            textAlign: 'center',
          }}
        >
          {STEP_LABELS[s]}
        </div>
      ))}
    </div>
  )
}

// ── Preview table ─────────────────────────────────────────────────────────────

function PreviewTable({ entries }: { entries: BatchImportEntry[] }) {
  if (entries.length === 0)
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Занятий не найдено.</p>

  const sorted = [...entries].sort(
    (a, b) => a.day_of_week - b.day_of_week || a.start_time.localeCompare(b.start_time)
  )

  return (
    <div style={{ overflowX: 'auto', maxHeight: 300, overflowY: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary)' }}>
            {['День', 'Время', 'Название', 'Аудитория', 'Преподаватель'].map((h) => (
              <th
                key={h}
                style={{
                  padding: '6px 8px',
                  textAlign: 'left',
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {sorted.map((e, i) => (
            <tr
              key={i}
              style={{
                background: i % 2 === 0 ? 'transparent' : 'var(--bg-secondary)',
              }}
            >
              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', fontWeight: 600 }}>
                {DAYS_SHORT[e.day_of_week] ?? e.day_of_week}
              </td>
              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                {e.start_time}–{e.end_time}
              </td>
              <td style={{ padding: '5px 8px' }}>{e.title}</td>
              <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{e.location ?? '—'}</td>
              <td style={{ padding: '5px 8px', color: 'var(--text-muted)' }}>{e.teacher ?? '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TulguImportDialog({ onImport, onClose }: Props) {
  const [step, setStep]               = useState<Step>('config')
  const [error, setError]             = useState<string | null>(null)
  const [loading, setLoading]         = useState(false)

  // Step 1 – connection
  const [baseUrl, setBaseUrl]         = useState('https://tulgu.ru/api')
  const [token, setToken]             = useState('')
  const [entityType, setEntityType]   = useState<'group' | 'teacher'>('group')

  // Step 2 – selection
  const [groups, setGroups]           = useState<ApiGroup[]>([])
  const [selectedGroup, setSelectedGroup] = useState('')
  const [dateFrom, setDateFrom]       = useState('')
  const [dateTo, setDateTo]           = useState('')

  // Step 3 – preview
  const [preview, setPreview]         = useState<BatchImportEntry[]>([])
  const [replaceMode, setReplaceMode] = useState<'add' | 'replace'>('add')

  // Step 4 – done
  const [importResult, setImportResult] = useState<BatchImportResult | null>(null)

  // ── Handlers ───────────────────────────────────────────────────────────────

  async function handleFetchGroups() {
    if (!baseUrl.trim()) { setError('Введите URL API'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await window.api.tulgu.fetchGroups(baseUrl.trim(), token.trim(), entityType)
      if (!res.success) throw new Error(res.error)
      if (res.data.length === 0) throw new Error('Список групп пуст — проверьте URL')
      setGroups(res.data)
      setSelectedGroup(res.data[0].id)
      setStep('select')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleFetchSchedule() {
    if (!selectedGroup) { setError('Выберите группу'); return }
    setError(null)
    setLoading(true)
    try {
      const res = await window.api.tulgu.fetchSchedule(
        baseUrl.trim(), token.trim(), selectedGroup, entityType,
        dateFrom || undefined, dateTo || undefined
      )
      if (!res.success) throw new Error(res.error)
      if (res.data.length === 0) throw new Error('Расписание пустое — попробуйте другие даты или группу')
      setPreview(res.data)
      setStep('preview')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  async function handleImport() {
    setError(null)
    setLoading(true)
    try {
      const result = await onImport(preview, replaceMode === 'replace')
      setImportResult(result)
      setStep('done')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }

  // ── Unique subject count for summary ───────────────────────────────────────
  const uniqueSubjects = new Set(preview.map((e) => e.subject_name).filter(Boolean)).size

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ width: 640, maxWidth: '96vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">Импорт расписания из ТулГУ</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ paddingTop: 0 }}>
          <StepBar current={step} />

          {/* Error banner */}
          {error && (
            <div
              style={{
                background: 'var(--danger-bg, #fee2e2)',
                color: 'var(--danger, #ef4444)',
                border: '1px solid var(--danger, #ef4444)',
                borderRadius: 6,
                padding: '8px 12px',
                fontSize: 13,
                marginBottom: 16,
              }}
            >
              {error}
            </div>
          )}

          {/* ── Step 1: config ─────────────────────────────────────────────── */}
          {step === 'config' && (
            <div>
              <div className="form-group">
                <label className="form-label">Базовый URL API *</label>
                <input
                  className="form-input"
                  autoFocus
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://tulgu.ru/api"
                />
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Приложение перебирает стандартные пути: /groups, /api/groups, /schedule, /api/schedule…
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Токен / ключ доступа (если требуется)</label>
                <input
                  className="form-input"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                  placeholder="Оставьте пустым, если авторизация не нужна"
                  type="password"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Искать по</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['group', 'teacher'] as const).map((t) => (
                    <label
                      key={t}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        cursor: 'pointer',
                        fontSize: 13,
                      }}
                    >
                      <input
                        type="radio"
                        name="entityType"
                        checked={entityType === t}
                        onChange={() => setEntityType(t)}
                      />
                      {t === 'group' ? 'Группе' : 'Преподавателю'}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: select group + dates ───────────────────────────────── */}
          {step === 'select' && (
            <div>
              <div className="form-group">
                <label className="form-label">
                  {entityType === 'group' ? 'Группа' : 'Преподаватель'} *
                </label>
                <select
                  className="form-select"
                  value={selectedGroup}
                  onChange={(e) => setSelectedGroup(e.target.value)}
                  autoFocus
                >
                  {groups.map((g) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                  Найдено {groups.length} {entityType === 'group' ? 'групп' : 'преподавателей'}
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Дата начала (необязательно)</label>
                  <input
                    className="form-input"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Дата конца (необязательно)</label>
                  <input
                    className="form-input"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                  />
                </div>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: -8 }}>
                Если API поддерживает фильтрацию по датам — они будут переданы как параметры date_from / date_to.
                Если нет, загрузится всё расписание.
              </div>
            </div>
          )}

          {/* ── Step 3: preview ────────────────────────────────────────────── */}
          {step === 'preview' && (
            <div>
              <div
                style={{
                  display: 'flex',
                  gap: 16,
                  marginBottom: 12,
                  fontSize: 13,
                  color: 'var(--text-muted)',
                }}
              >
                <span>
                  <strong style={{ color: 'var(--text)' }}>{preview.length}</strong> пар
                </span>
                <span>
                  <strong style={{ color: 'var(--text)' }}>{uniqueSubjects}</strong> предметов
                </span>
              </div>

              <PreviewTable entries={preview} />

              <div style={{ marginTop: 16 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>Режим импорта</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {(
                    [
                      ['add',     'Добавить к существующему расписанию'],
                      ['replace', 'Заменить расписание полностью (удалить все текущие записи)'],
                    ] as const
                  ).map(([val, label]) => (
                    <label
                      key={val}
                      style={{ display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer', fontSize: 13 }}
                    >
                      <input
                        type="radio"
                        name="replaceMode"
                        checked={replaceMode === val}
                        onChange={() => setReplaceMode(val)}
                        style={{ marginTop: 2 }}
                      />
                      {label}
                    </label>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* ── Step 4: done ───────────────────────────────────────────────── */}
          {step === 'done' && importResult && (
            <div style={{ textAlign: 'center', padding: '16px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>
                Импорт завершён
              </div>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Добавлено <strong>{importResult.created}</strong> пар
                {importResult.subjectsCreated > 0 && (
                  <>, автоматически создано <strong>{importResult.subjectsCreated}</strong> новых предметов</>
                )}
                .
              </div>
              {importResult.subjectsCreated > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>
                  Новые предметы можно переименовать в разделе «Задания».
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {step === 'config' && (
            <>
              <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
              <button
                className="btn btn-primary"
                onClick={() => void handleFetchGroups()}
                disabled={loading || !baseUrl.trim()}
              >
                {loading ? 'Загрузка…' : 'Загрузить список →'}
              </button>
            </>
          )}

          {step === 'select' && (
            <>
              <button className="btn btn-secondary" onClick={() => { setStep('config'); setError(null) }}>
                ← Назад
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
              <button
                className="btn btn-primary"
                onClick={() => void handleFetchSchedule()}
                disabled={loading || !selectedGroup}
              >
                {loading ? 'Загрузка…' : 'Загрузить расписание →'}
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button className="btn btn-secondary" onClick={() => { setStep('select'); setError(null) }}>
                ← Назад
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
              <button
                className="btn btn-primary"
                onClick={() => void handleImport()}
                disabled={loading || preview.length === 0}
              >
                {loading ? 'Импортируем…' : `Импортировать (${preview.length})`}
              </button>
            </>
          )}

          {step === 'done' && (
            <button className="btn btn-primary" onClick={onClose}>
              Закрыть
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
