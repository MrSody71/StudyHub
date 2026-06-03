import { useState, useEffect, useRef } from 'react'
import type { MoodleStatus, MoodleCourse, MoodleSyncProgress, MoodleSyncResult, Subject } from '../types'

interface Props {
  subjects: Subject[]
  onSubjectsChanged: () => void
}

export default function MoodleSection({ subjects, onSubjectsChanged }: Props) {
  const [status,    setStatus]    = useState<MoodleStatus | null>(null)
  const [loading,   setLoading]   = useState(true)

  // Login form
  const [username,  setUsername]  = useState('')
  const [password,  setPassword]  = useState('')
  const [logging,   setLogging]   = useState(false)
  const [loginErr,  setLoginErr]  = useState<string | null>(null)

  // Courses + mapping
  const [courses,   setCourses]   = useState<MoodleCourse[]>([])
  const [mappings,  setMappings]  = useState<Map<number, number>>(new Map()) // moodleId → subjectId (0 = create new, -1 = skip)
  const [showMap,   setShowMap]   = useState(false)
  const [mapLoading, setMapLoading] = useState(false)

  // Sync
  const [syncing,   setSyncing]   = useState(false)
  const [progress,  setProgress]  = useState<MoodleSyncProgress | null>(null)
  const [syncResult, setSyncResult] = useState<MoodleSyncResult | null>(null)
  const [syncErr,   setSyncErr]   = useState<string | null>(null)

  const listenerRef = useRef(false)

  useEffect(() => {
    void loadStatus()
    // Register progress listener once
    if (!listenerRef.current) {
      listenerRef.current = true
      window.api.moodle.onSyncProgress((p) => {
        setProgress(p)
        if (p.stage === 'done' || p.stage === 'error') setSyncing(false)
      })
    }
    return () => {
      window.api.moodle.removeAllListeners('moodle:sync-progress')
      listenerRef.current = false
    }
  }, [])

  async function loadStatus() {
    setLoading(true)
    try {
      const r = await window.api.moodle.getStatus()
      if (r.success) setStatus(r.data)
    } finally {
      setLoading(false)
    }
  }

  // ── Login ────────────────────────────────────────────────────────────────

  async function handleLogin() {
    if (!username.trim() || !password.trim()) return
    setLogging(true)
    setLoginErr(null)
    try {
      const r = await window.api.moodle.login(username.trim(), password.trim())
      if (!r.success) { setLoginErr(r.error); return }
      setPassword('')
      await loadStatus()
    } catch (e) {
      setLoginErr(String(e))
    } finally {
      setLogging(false)
    }
  }

  async function handleLogout() {
    await window.api.moodle.logout()
    setCourses([])
    setSyncResult(null)
    setSyncErr(null)
    setProgress(null)
    setShowMap(false)
    await loadStatus()
  }

  // ── Sync flow ────────────────────────────────────────────────────────────

  async function startSync() {
    setSyncErr(null)
    setSyncResult(null)
    setProgress(null)
    setMapLoading(true)

    try {
      const r = await window.api.moodle.getCourses()
      if (!r.success) {
        if (r.error.includes('invalidtoken') || r.error.includes('invalid_token') || r.error.includes('accessdenied')) {
          setSyncErr('Сессия истекла — войдите заново')
          await loadStatus()
          return
        }
        setSyncErr(r.error)
        return
      }

      const fetchedCourses = r.data
      setCourses(fetchedCourses)

      const unmapped = fetchedCourses.filter((c) => c.subject_id === null)
      if (unmapped.length > 0) {
        // Pre-fill mappings: auto-match by name (case-insensitive)
        const initial = new Map<number, number>()
        for (const c of unmapped) {
          const matched = subjects.find(
            (s) => s.name.toLowerCase().trim() === c.fullname.toLowerCase().trim() ||
                   s.name.toLowerCase().trim() === c.shortname.toLowerCase().trim()
          )
          initial.set(c.id, matched ? matched.id : -1)
        }
        setMappings(initial)
        setShowMap(true)
      } else {
        // All courses mapped — sync immediately
        await runSyncAll()
      }
    } finally {
      setMapLoading(false)
    }
  }

  async function applyMappingsAndSync() {
    // Apply mappings
    for (const [moodleCourseId, subjectId] of mappings) {
      if (subjectId === -1) continue  // user chose to skip
      const course = courses.find((c) => c.id === moodleCourseId)
      const r = await window.api.moodle.mapCourse(moodleCourseId, subjectId, course?.fullname)
      if (!r.success) { setSyncErr(r.error); return }
    }
    onSubjectsChanged()
    setShowMap(false)
    await runSyncAll()
  }

  async function runSyncAll() {
    setSyncing(true)
    setSyncErr(null)
    setSyncResult(null)
    setProgress({ stage: 'courses', message: 'Запускаем синхронизацию…' })
    try {
      const r = await window.api.moodle.syncAll()
      if (r.success) {
        setSyncResult(r.data)
      } else {
        if (r.error.includes('invalidtoken') || r.error.includes('accessdenied')) {
          setSyncErr('Сессия истекла — войдите заново')
          await loadStatus()
        } else {
          setSyncErr(r.error)
        }
      }
    } finally {
      setSyncing(false)
      await loadStatus()
    }
  }

  async function handleUnmap(moodleCourseId: number) {
    await window.api.moodle.unmapCourse(moodleCourseId)
    setCourses((prev) => prev.map((c) => c.id === moodleCourseId ? { ...c, subject_id: null } : c))
    onSubjectsChanged()
  }

  // ── Render ───────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>Загрузка…</div>
    )
  }

  if (!status?.isLoggedIn) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Введите логин и пароль от Moodle ТулГУ. Токен будет сохранён — пароль храниться не будет.
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Логин</label>
          <input
            className="form-input"
            type="text"
            autoComplete="username"
            placeholder="student@tulsu.ru или номер студенческого"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleLogin() }}
            disabled={logging}
          />
        </div>

        <div className="form-group" style={{ margin: 0 }}>
          <label className="form-label">Пароль</label>
          <input
            className="form-input"
            type="password"
            autoComplete="current-password"
            placeholder="Пароль от Moodle"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') void handleLogin() }}
            disabled={logging}
          />
        </div>

        {loginErr && (
          <div style={{ fontSize: 12, color: 'var(--danger)', lineHeight: 1.5 }}>
            ⚠ {loginErr}
          </div>
        )}

        <button
          className="btn btn-primary btn-sm"
          onClick={() => void handleLogin()}
          disabled={logging || !username.trim() || !password.trim()}
        >
          {logging ? 'Входим…' : 'Войти в Moodle'}
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {/* Auth status */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
          <span style={{ color: 'var(--success)' }}>●</span>{' '}
          Вы вошли как{' '}
          <strong style={{ color: 'var(--text-primary)' }}>
            {status.fullname ?? 'студент'}
          </strong>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => void handleLogout()}>
          Выйти
        </button>
      </div>

      {/* Last sync / error info */}
      <div style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.6 }}>
        {status.lastError ? (
          <span style={{ color: 'var(--danger)' }}>
            ⚠ {status.lastError.slice(0, 120)}
          </span>
        ) : status.lastSyncAt ? (
          <>
            <span style={{ color: 'var(--success)' }}>✓</span>{' '}
            Последняя синхронизация:{' '}
            {new Date(status.lastSyncAt).toLocaleString('ru-RU', {
              day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            })}
          </>
        ) : (
          <span>Синхронизация ещё не выполнялась</span>
        )}
      </div>

      {/* Course mapping panel */}
      {showMap && (
        <div style={{
          background: 'var(--bg-tertiary)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
            Привяжите предметы Moodle к предметам в приложении
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>
            Файлы и задания синхронизируются только для привязанных предметов.
          </div>

          {courses.filter((c) => c.subject_id === null).map((course) => (
            <div key={course.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', flex: '1 1 180px', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={course.fullname}>
                {course.fullname}
              </div>
              <select
                className="form-input"
                style={{ flex: '1 1 160px', padding: '4px 8px', fontSize: 13 }}
                value={mappings.get(course.id) ?? -1}
                onChange={(e) => {
                  const val = Number(e.target.value)
                  setMappings((prev) => new Map(prev).set(course.id, val))
                }}
              >
                <option value={-1}>— Пропустить —</option>
                <option value={0}>+ Создать новый предмет</option>
                {subjects.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          ))}

          {/* Already-mapped courses (info only) */}
          {courses.filter((c) => c.subject_id !== null).map((course) => {
            const sub = subjects.find((s) => s.id === course.subject_id)
            return (
              <div key={course.id} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ fontSize: 13, color: 'var(--text-tertiary)', flex: '1 1 180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={course.fullname}>
                  {course.fullname}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: '1 1 160px' }}>
                  <span style={{ fontSize: 12, color: 'var(--success)' }}>✓</span>
                  <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{sub?.name ?? '?'}</span>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ fontSize: 11, padding: '2px 6px' }}
                    onClick={() => void handleUnmap(course.id)}
                  >
                    Отвязать
                  </button>
                </div>
              </div>
            )
          })}

          <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void applyMappingsAndSync()}
              disabled={syncing}
            >
              Применить и синхронизировать
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => { setShowMap(false); void runSyncAll() }}
              disabled={syncing}
            >
              Синхронизировать без изменений
            </button>
            <button className="btn btn-ghost btn-sm" onClick={() => setShowMap(false)}>
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* Sync button */}
      {!showMap && (
        <button
          className="btn btn-secondary btn-sm"
          onClick={() => void startSync()}
          disabled={syncing || mapLoading}
          style={{ alignSelf: 'flex-start' }}
        >
          {(syncing || mapLoading) ? '⟳ Синхронизация…' : '↻ Синхронизировать с Moodle'}
        </button>
      )}

      {/* Progress */}
      {progress && (syncing || progress.stage === 'done' || progress.stage === 'error') && (
        <div style={{
          fontSize: 12,
          color: progress.stage === 'error' ? 'var(--danger)' : progress.stage === 'done' ? 'var(--success)' : 'var(--text-secondary)',
          lineHeight: 1.6,
        }}>
          {progress.stage === 'done'  && '✓ '}
          {progress.stage === 'error' && '⚠ '}
          {progress.message}
        </div>
      )}

      {/* Sync result */}
      {syncResult && !syncing && (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.8 }}>
          Результат синхронизации:
          <ul style={{ margin: '4px 0 0 16px', padding: 0 }}>
            <li>Заданий добавлено: <strong>{syncResult.assignmentsCreated}</strong></li>
            <li>Файлов скачано: <strong>{syncResult.filesDownloaded}</strong></li>
            {syncResult.filesSkipped > 0 && (
              <li style={{ color: 'var(--text-tertiary)' }}>
                Файлов пропущено (уже есть): {syncResult.filesSkipped}
              </li>
            )}
          </ul>
        </div>
      )}

      {/* Sync error */}
      {syncErr && !syncing && (
        <div style={{ fontSize: 12, color: 'var(--danger)', lineHeight: 1.5 }}>
          ⚠ {syncErr}
        </div>
      )}
    </div>
  )
}
