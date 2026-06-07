import { useState } from 'react'
import type { Subject, Task } from '../types'
import type { PomodoroState, PomodoroControls, PomodoroMode, PomodoroSettings } from '../hooks/usePomodoro'

interface Props {
  state:    PomodoroState
  controls: PomodoroControls
  subjects: Subject[]
  tasks:    Task[]
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pad(n: number): string { return String(n).padStart(2, '0') }

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${pad(m)}:${pad(s)}`
}

function totalSeconds(mode: PomodoroMode, settings: PomodoroSettings): number {
  if (mode === 'work')        return settings.workMins       * 60
  if (mode === 'short_break') return settings.shortBreakMins * 60
  return                             settings.longBreakMins  * 60
}

const MODE_LABELS: Record<PomodoroMode, string> = {
  work:        'Работа',
  short_break: 'Короткий перерыв',
  long_break:  'Длинный перерыв',
}

const MODE_COLORS: Record<PomodoroMode, string> = {
  work:        '#6366f1',
  short_break: '#22c55e',
  long_break:  '#14b8a6',
}

// ── SVG ring ──────────────────────────────────────────────────────────────────

const RADIUS  = 88
const STROKE  = 8
const CIRCUM  = 2 * Math.PI * RADIUS
const SVG_SZ  = (RADIUS + STROKE) * 2

function TimerRing({ secondsLeft, mode, settings }: { secondsLeft: number; mode: PomodoroMode; settings: PomodoroSettings }) {
  const total    = totalSeconds(mode, settings)
  const progress = total > 0 ? secondsLeft / total : 1
  const offset   = CIRCUM * (1 - progress)
  const color    = MODE_COLORS[mode]

  return (
    <svg width={SVG_SZ} height={SVG_SZ} className="timer-svg">
      <circle
        cx={SVG_SZ / 2}
        cy={SVG_SZ / 2}
        r={RADIUS}
        fill="none"
        stroke="var(--border)"
        strokeWidth={STROKE}
      />
      <circle
        cx={SVG_SZ / 2}
        cy={SVG_SZ / 2}
        r={RADIUS}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={CIRCUM}
        strokeDashoffset={offset}
        style={{ transform: 'rotate(-90deg)', transformOrigin: '50% 50%', transition: 'stroke-dashoffset 0.5s linear' }}
      />
      <text x="50%" y="46%" textAnchor="middle" dominantBaseline="middle" className="timer-time-text">
        {formatTime(secondsLeft)}
      </text>
      <text x="50%" y="62%" textAnchor="middle" dominantBaseline="middle" className="timer-mode-text" fill={color}>
        {MODE_LABELS[mode]}
      </text>
    </svg>
  )
}

// ── Settings panel ────────────────────────────────────────────────────────────

function SettingsPanel({ settings, onSave, onClose }: {
  settings: PomodoroSettings
  onSave:  (s: PomodoroSettings) => void
  onClose: () => void
}) {
  const [work, setWork]   = useState(settings.workMins)
  const [sb,   setSb]     = useState(settings.shortBreakMins)
  const [lb,   setLb]     = useState(settings.longBreakMins)
  const [intv, setIntv]   = useState(settings.interval)

  function handleSave() {
    onSave({ workMins: work, shortBreakMins: sb, longBreakMins: lb, interval: intv })
    onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 380 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Настройки таймера</span>
          <button className="btn btn-ghost btn-sm" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">
          <div className="form-group">
            <label className="form-label">Длительность работы (мин)</label>
            <input className="form-input" type="number" min={1} max={120} value={work}
              onChange={(e) => setWork(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Короткий перерыв (мин)</label>
            <input className="form-input" type="number" min={1} max={60} value={sb}
              onChange={(e) => setSb(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Длинный перерыв (мин)</label>
            <input className="form-input" type="number" min={1} max={120} value={lb}
              onChange={(e) => setLb(Number(e.target.value))} />
          </div>
          <div className="form-group">
            <label className="form-label">Помодоро до длинного перерыва</label>
            <input className="form-input" type="number" min={1} max={10} value={intv}
              onChange={(e) => setIntv(Number(e.target.value))} />
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose}>Отмена</button>
          <button className="btn btn-primary" onClick={handleSave}>Сохранить</button>
        </div>
      </div>
    </div>
  )
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PomodoroTimer({ state, controls, subjects, tasks }: Props) {
  const [showSettings, setShowSettings] = useState(false)
  const { status, mode, secondsLeft, pomodoroCount, subjectId, taskId, settings } = state

  const subjectTasks = tasks.filter((t) => t.subject_id === subjectId && t.status !== 'done')
  const color = MODE_COLORS[mode]

  // Dots: filled = completed in current cycle
  const dots = Array.from({ length: settings.interval }, (_, i) => i < pomodoroCount % settings.interval)

  return (
    <div className="pomodoro-outer">
      {showSettings && (
        <SettingsPanel
          settings={settings}
          onSave={(s) => void controls.updateSettings(s)}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="panel-header">
        <div className="panel-title">⏱ Помодоро</div>
        <div className="panel-actions">
          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)} title="Настройки">⚙</button>
        </div>
      </div>

      <div className="pomodoro-body">
        {/* Mode tabs */}
        <div className="pomodoro-modes">
          {(['work', 'short_break', 'long_break'] as PomodoroMode[]).map((m) => (
            <button
              key={m}
              className={`pomodoro-mode-btn${mode === m ? ' active' : ''}`}
              style={mode === m ? { borderColor: MODE_COLORS[m], color: MODE_COLORS[m] } : {}}
              onClick={() => {
                if (status !== 'idle') return
                controls.skipMode()
              }}
              disabled={status !== 'idle' || mode === m}
            >
              {MODE_LABELS[m]}
            </button>
          ))}
        </div>

        {/* Ring */}
        <div className="pomodoro-ring-wrap">
          <TimerRing secondsLeft={secondsLeft} mode={mode} settings={settings} />
        </div>

        {/* Dot progress */}
        <div className="pomodoro-dots">
          {dots.map((filled, i) => (
            <span key={i} className={`pomodoro-dot${filled ? ' filled' : ''}`} style={filled ? { background: color } : {}} />
          ))}
        </div>

        {/* Controls */}
        <div className="pomodoro-controls">
          {status === 'running' ? (
            <button className="btn btn-secondary" onClick={controls.pause}>Пауза</button>
          ) : (
            <button className="btn btn-primary" onClick={controls.start}>
              {status === 'paused' ? 'Продолжить' : 'Старт'}
            </button>
          )}
          <button className="btn btn-ghost" onClick={controls.reset} title="Сбросить">↺</button>
          <button className="btn btn-ghost" onClick={controls.skipMode} title="Пропустить">⏭</button>
        </div>

        {/* Subject / task selection */}
        <div className="pomodoro-context">
          <div className="form-group">
            <label className="form-label">Предмет</label>
            <select
              className="form-select"
              value={subjectId ?? ''}
              disabled={status === 'running'}
              style={status === 'running' ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
              onChange={(e) => {
                const id = e.target.value === '' ? null : Number(e.target.value)
                controls.setSubjectId(id)
                controls.setTaskId(null)
              }}
            >
              <option value="">— Без предмета —</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          {subjectId !== null && (
            <div className="form-group">
              <label className="form-label">Задание</label>
              <select
                className="form-select"
                value={taskId ?? ''}
                disabled={status === 'running'}
                style={status === 'running' ? { opacity: 0.5, cursor: 'not-allowed', pointerEvents: 'none' } : {}}
                onChange={(e) => controls.setTaskId(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">— Без задания —</option>
                {subjectTasks.map((t) => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
