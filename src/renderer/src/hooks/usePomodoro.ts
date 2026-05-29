import { useState, useEffect, useRef, useCallback } from 'react'
import type { SessionType } from '../types'

export type PomodoroMode   = 'work' | 'short_break' | 'long_break'
export type PomodoroStatus = 'idle' | 'running' | 'paused'

export interface PomodoroSettings {
  workMins:       number
  shortBreakMins: number
  longBreakMins:  number
  interval:       number   // pomodoros before long break
}

export interface PomodoroState {
  status:        PomodoroStatus
  mode:          PomodoroMode
  secondsLeft:   number
  pomodoroCount: number   // completed pomodoros in current cycle
  subjectId:     number | null
  taskId:        number | null
  settings:      PomodoroSettings
}

export interface PomodoroControls {
  start:           () => void
  pause:           () => void
  reset:           () => void
  setSubjectId:    (id: number | null) => void
  setTaskId:       (id: number | null) => void
  updateSettings:  (s: PomodoroSettings) => void
  skipMode:        () => void
}

const DEFAULT_SETTINGS: PomodoroSettings = {
  workMins:       25,
  shortBreakMins: 5,
  longBreakMins:  15,
  interval:       4,
}

function modeSeconds(mode: PomodoroMode, settings: PomodoroSettings): number {
  if (mode === 'work')        return settings.workMins       * 60
  if (mode === 'short_break') return settings.shortBreakMins * 60
  return                             settings.longBreakMins  * 60
}

function modeToSessionType(mode: PomodoroMode): SessionType {
  if (mode === 'work')        return 'pomodoro'
  if (mode === 'short_break') return 'short_break'
  return                             'long_break'
}

function modeLabel(mode: PomodoroMode): string {
  if (mode === 'work')        return 'Помодоро завершено!'
  if (mode === 'short_break') return 'Короткий перерыв окончен'
  return                             'Длинный перерыв окончен'
}

function nextMode(mode: PomodoroMode, pomodoroCount: number, interval: number): PomodoroMode {
  if (mode !== 'work') return 'work'
  const newCount = pomodoroCount + 1
  return newCount % interval === 0 ? 'long_break' : 'short_break'
}

export function usePomodoro(onSessionSaved?: () => void): [PomodoroState, PomodoroControls] {
  const [settings, setSettings]       = useState<PomodoroSettings>(DEFAULT_SETTINGS)
  const [mode, setMode]               = useState<PomodoroMode>('work')
  const [status, setStatus]           = useState<PomodoroStatus>('idle')
  const [secondsLeft, setSecondsLeft] = useState(() => DEFAULT_SETTINGS.workMins * 60)
  const [pomodoroCount, setPomodoroCount] = useState(0)
  const [subjectId, setSubjectId]     = useState<number | null>(null)
  const [taskId, setTaskId]           = useState<number | null>(null)

  // snapRef lets handleComplete read latest state without stale closure
  const snapRef = useRef({ mode, pomodoroCount, subjectId, taskId, settings, status })
  useEffect(() => {
    snapRef.current = { mode, pomodoroCount, subjectId, taskId, settings, status }
  })

  // Load settings from persistent storage once on mount
  useEffect(() => {
    async function load() {
      try {
        const [work, sb, lb, intv] = await Promise.all([
          window.api.settings.get('pomodoro.work'),
          window.api.settings.get('pomodoro.shortBreak'),
          window.api.settings.get('pomodoro.longBreak'),
          window.api.settings.get('pomodoro.interval'),
        ])
        const s: PomodoroSettings = {
          workMins:       Number(work.success       && work.data       ? work.data       : 25),
          shortBreakMins: Number(sb.success         && sb.data         ? sb.data         : 5),
          longBreakMins:  Number(lb.success         && lb.data         ? lb.data         : 15),
          interval:       Number(intv.success       && intv.data       ? intv.data       : 4),
        }
        setSettings(s)
        setSecondsLeft(s.workMins * 60)
      } catch { /* keep defaults */ }
    }
    void load()
  }, [])

  const startedAtRef = useRef<string | null>(null)

  const handleComplete = useCallback(async () => {
    const snap = snapRef.current
    const duration = modeSeconds(snap.mode, snap.settings)

    // Save session
    try {
      await window.api.sessions.create({
        subject_id:       snap.subjectId,
        task_id:          snap.taskId,
        type:             modeToSessionType(snap.mode),
        duration_seconds: duration,
        started_at:       startedAtRef.current ?? new Date().toISOString(),
        ended_at:         new Date().toISOString(),
      })
      onSessionSaved?.()
    } catch { /* non-fatal */ }

    // Notification
    try {
      void window.api.notifications.show('StudyHub', modeLabel(snap.mode))
    } catch { /* non-fatal */ }

    // Advance mode
    const newPomCount = snap.mode === 'work' ? snap.pomodoroCount + 1 : snap.pomodoroCount
    const nm = nextMode(snap.mode, snap.pomodoroCount, snap.settings.interval)
    setPomodoroCount(newPomCount)
    setMode(nm)
    setSecondsLeft(modeSeconds(nm, snap.settings))
    setStatus('idle')
    startedAtRef.current = null
  }, [onSessionSaved])

  // Countdown ticker
  useEffect(() => {
    if (status !== 'running') return
    if (secondsLeft <= 0) {
      void handleComplete()
      return
    }
    const id = setTimeout(() => setSecondsLeft((s) => s - 1), 1000)
    return () => clearTimeout(id)
  }, [status, secondsLeft, handleComplete])

  const controls: PomodoroControls = {
    start() {
      if (status === 'idle') startedAtRef.current = new Date().toISOString()
      setStatus('running')
    },
    pause() {
      setStatus('paused')
    },
    reset() {
      setStatus('idle')
      setSecondsLeft(modeSeconds(snapRef.current.mode, snapRef.current.settings))
      startedAtRef.current = null
    },
    setSubjectId(id) { setSubjectId(id) },
    setTaskId(id)    { setTaskId(id) },
    skipMode() {
      const snap = snapRef.current
      setStatus('idle')
      startedAtRef.current = null
      const nm = nextMode(snap.mode, snap.pomodoroCount, snap.settings.interval)
      setMode(nm)
      setSecondsLeft(modeSeconds(nm, snap.settings))
    },
    async updateSettings(s) {
      setSettings(s)
      // Persist all 4 keys
      await Promise.all([
        window.api.settings.set('pomodoro.work',       String(s.workMins)),
        window.api.settings.set('pomodoro.shortBreak', String(s.shortBreakMins)),
        window.api.settings.set('pomodoro.longBreak',  String(s.longBreakMins)),
        window.api.settings.set('pomodoro.interval',   String(s.interval)),
      ])
      // Reset to new duration if idle
      if (snapRef.current.status === 'idle') {
        setSecondsLeft(modeSeconds(snapRef.current.mode, s))
      }
    },
  }

  const state: PomodoroState = { status, mode, secondsLeft, pomodoroCount, subjectId, taskId, settings }
  return [state, controls]
}
