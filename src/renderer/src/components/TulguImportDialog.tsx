/**
 * Диалог ручного импорта расписания из ТулГУ (tulsu.ru).
 * Используется из раздела «Расписание», кнопка «↓ Импорт из ТулГУ».
 *
 * Шаг 1: Ввод номера группы (подтягивается из настроек, если уже сохранён).
 * Шаг 2: Предпросмотр + выбор режима импорта.
 * Шаг 3: Результат.
 */

import { useState, useEffect } from 'react'
import type { BatchImportEntry, BatchImportResult } from '../types'

const DAYS_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

interface Props {
  onImport: (entries: BatchImportEntry[], replace: boolean) => Promise<BatchImportResult>
  onClose:  () => void
}

type Step = 'config' | 'preview' | 'done'

// ── Preview table ─────────────────────────────────────────────────────────────

function PreviewTable({ entries }: { entries: BatchImportEntry[] }) {
  if (entries.length === 0)
    return <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Занятий не найдено.</p>

  return (
    <div style={{ overflowX: 'auto', maxHeight: 280, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ position: 'sticky', top: 0, background: 'var(--bg-secondary, var(--bg-hover))' }}>
            {['День', 'Время', 'Дисциплина', 'Ауд.', 'Преподаватель'].map((h) => (
              <th
                key={h}
                style={{
                  padding: '6px 8px', textAlign: 'left', fontWeight: 600,
                  color: 'var(--text-muted)', borderBottom: '1px solid var(--border)',
                  whiteSpace: 'nowrap',
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={i} style={{ background: i % 2 === 0 ? 'transparent' : 'var(--bg-hover)' }}>
              <td style={{ padding: '5px 8px', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {DAYS_SHORT[e.day_of_week] ?? e.day_of_week}
              </td>
              <td style={{ padding: '5px 8px', whiteSpace: 'nowrap', color: 'var(--text-secondary)' }}>
                {e.start_time}–{e.end_time}
              </td>
              <td style={{ padding: '5px 8px' }}>{e.title}</td>
              <td style={{ padding: '5px 8px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {e.location ?? '—'}
              </td>
              <td style={{ padding: '5px 8px', color: 'var(--text-secondary)' }}>
                {e.teacher ?? '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Step bar ──────────────────────────────────────────────────────────────────

const STEP_LABELS: Record<Step, string> = {
  config:  '1. Группа',
  preview: '2. Предпросмотр',
  done:    '3. Готово',
}

function StepBar({ current }: { current: Step }) {
  const steps: Step[] = ['config', 'preview', 'done']
  const idx = steps.indexOf(current)
  return (
    <div style={{ display: 'flex', marginBottom: 20 }}>
      {steps.map((s, i) => (
        <div
          key={s}
          style={{
            flex: 1, padding: '6px 4px', fontSize: 11, textAlign: 'center',
            fontWeight: i <= idx ? 600 : 400,
            color: i < idx ? 'var(--primary, var(--accent))' : i === idx ? 'var(--text-primary)' : 'var(--text-tertiary)',
            borderBottom: `2px solid ${i <= idx ? 'var(--accent)' : 'var(--border)'}`,
          }}
        >
          {STEP_LABELS[s]}
        </div>
      ))}
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TulguImportDialog({ onImport, onClose }: Props) {
  const [step, setStep]               = useState<Step>('config')
  const [groupNumber, setGroupNumber] = useState('')
  const [loading, setLoading]         = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [preview, setPreview]         = useState<BatchImportEntry[]>([])
  const [replaceMode, setReplaceMode] = useState<'add' | 'replace'>('replace')
  const [importResult, setImportResult] = useState<BatchImportResult | null>(null)

  // Pre-fill group number from saved settings
  useEffect(() => {
    void window.api.tulgu.getConfig().then((r) => {
      if (r.success && r.data.groupNumber) setGroupNumber(r.data.groupNumber)
    })
  }, [])

  // ── Fetch schedule for preview ─────────────────────────────────────────────

  async function handleFetch() {
    const g = groupNumber.trim()
    if (!g) { setError('Введите номер группы'); return }
    setError(null)
    setLoading(true)

    // Save group number BEFORE the API call so it persists even if fetch fails
    const cfgR = await window.api.tulgu.getConfig().catch(() => null)
    const currentInterval = cfgR?.success ? cfgR.data.interval : 'manual'
    await window.api.tulgu.saveConfig({ groupNumber: g, interval: currentInterval }).catch(() => {})

    try {
      const r = await window.api.tulgu.fetchTulsuSchedule(g)
      if (!r.success) throw new Error(r.error ?? 'Ошибка загрузки расписания')
      if (r.data.length === 0) {
        throw new Error('Расписание пустое — проверьте номер группы или попробуйте позже')
      }
      setPreview(r.data)
      setStep('preview')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e as { message?: string }).message ?? 'Неизвестная ошибка'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  // ── Execute import ─────────────────────────────────────────────────────────

  async function handleImport() {
    setError(null)
    setLoading(true)
    try {
      // Group number already saved in handleFetch; nothing extra needed here

      const result = await onImport(preview, replaceMode === 'replace')
      setImportResult(result)
      setStep('done')
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message
        : (e as { message?: string }).message ?? 'Неизвестная ошибка'
      setError(msg)
    } finally {
      setLoading(false)
    }
  }

  const uniqueSubjects = new Set(preview.map((e) => e.subject_name).filter(Boolean)).size

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal"
        style={{ width: 660, maxWidth: '96vw' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <span className="modal-title">Импорт расписания из ТулГУ</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>

        <div className="modal-body" style={{ paddingTop: 0 }}>
          <StepBar current={step} />

          {/* Error */}
          {error && (
            <div style={{
              background: 'var(--danger-light)', border: '1px solid var(--danger)',
              borderRadius: 6, padding: '8px 12px', fontSize: 13, marginBottom: 16,
              color: 'var(--danger)',
            }}>
              {error}
            </div>
          )}

          {/* ── Step 1: group number ─────────────────────────────────────── */}
          {step === 'config' && (
            <div>
              <div className="form-group">
                <label className="form-label">Номер группы *</label>
                <input
                  className="form-input"
                  autoFocus
                  value={groupNumber}
                  onChange={(e) => setGroupNumber(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') void handleFetch() }}
                  placeholder="Например: Б260221"
                  maxLength={20}
                />
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6, lineHeight: 1.6 }}>
                  Расписание загружается с{' '}
                  <strong>tulsu.ru</strong> — отображаются только будущие занятия,
                  повторяющиеся пары объединяются в одну запись.
                </div>
              </div>
            </div>
          )}

          {/* ── Step 2: preview ─────────────────────────────────────────── */}
          {step === 'preview' && (
            <div>
              <div style={{ display: 'flex', gap: 20, marginBottom: 12, fontSize: 13, color: 'var(--text-secondary)' }}>
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>{preview.length}</strong> пар
                </span>
                <span>
                  <strong style={{ color: 'var(--text-primary)' }}>{uniqueSubjects}</strong> предметов
                </span>
                <span style={{ color: 'var(--text-tertiary)' }}>
                  Группа: <strong>{groupNumber}</strong>
                </span>
              </div>

              <PreviewTable entries={preview} />

              <div style={{ marginTop: 16 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>Режим импорта</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {([
                    ['replace', 'Заменить расписание полностью (рекомендуется)'],
                    ['add',     'Добавить к существующему расписанию'],
                  ] as const).map(([val, label]) => (
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

          {/* ── Step 3: done ────────────────────────────────────────────── */}
          {step === 'done' && importResult && (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
              <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>Импорт завершён</div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                Добавлено <strong>{importResult.created}</strong> занятий
                {importResult.subjectsCreated > 0 && (
                  <>, создано <strong>{importResult.subjectsCreated}</strong> новых предметов</>
                )}
                .
              </div>
              {importResult.subjectsCreated > 0 && (
                <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 8 }}>
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
                onClick={() => void handleFetch()}
                disabled={loading || !groupNumber.trim()}
              >
                {loading ? 'Загрузка…' : 'Загрузить расписание →'}
              </button>
            </>
          )}

          {step === 'preview' && (
            <>
              <button className="btn btn-secondary" onClick={() => { setStep('config'); setError(null) }}>
                ← Назад
              </button>
              <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
              <button
                className="btn btn-primary"
                onClick={() => void handleImport()}
                disabled={loading || preview.length === 0}
              >
                {loading ? 'Импортируем…' : `Импортировать (${preview.length} пар)`}
              </button>
            </>
          )}

          {step === 'done' && (
            <button className="btn btn-primary" onClick={onClose}>Закрыть</button>
          )}
        </div>
      </div>
    </div>
  )
}
