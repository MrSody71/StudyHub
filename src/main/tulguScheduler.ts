/**
 * Фоновый планировщик автоматической синхронизации расписания ТулГУ.
 *
 * Жизненный цикл:
 *  1. startTulguScheduler() вызывается при запуске приложения.
 *  2. Если прошло достаточно времени с последней синхронизации — запускает её
 *     через 8 секунд после старта (чтобы БД успела инициализироваться).
 *  3. После синхронизации планирует следующую через заданный интервал.
 *  4. При ошибке сети — повтор через 15 минут.
 *  5. restartTulguScheduler() вызывается при изменении настроек.
 */

import { BrowserWindow, Notification } from 'electron'
import { getSetting, setSetting } from './db/settings'
import { getAllScheduleEntries, batchImportScheduleEntries } from './db/schedule'
import { fetchTulguSchedule } from './tulgu'
import type { ScheduleDiff, TulguStatus, TulguSyncResult } from '../renderer/src/types'
import type { ScheduleEntryRow, BatchImportEntry } from './db/schedule'

// ── Constants ─────────────────────────────────────────────────────────────────

const DAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс']

const INTERVAL_MS: Record<string, number> = {
  '3h':  3  * 60 * 60_000,
  '6h':  6  * 60 * 60_000,
  '12h': 12 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
}

// ── State ─────────────────────────────────────────────────────────────────────

let isSyncing   = false
let syncTimer:  ReturnType<typeof setTimeout> | null = null
let retryTimer: ReturnType<typeof setTimeout> | null = null

// ── Helpers ───────────────────────────────────────────────────────────────────

export function getTulguStatus(): TulguStatus {
  return {
    isSyncing,
    lastUpdated: getSetting('tulgu.lastUpdated') ?? null,
    lastError:   getSetting('tulgu.lastError')   ?? null,
    lastErrorAt: getSetting('tulgu.lastErrorAt') ?? null,
  }
}

function broadcast(channel: string, data?: unknown): void {
  for (const win of BrowserWindow.getAllWindows()) {
    try { win.webContents.send(channel, data) } catch { /* window may be closing */ }
  }
}

function entryKey(e: { day_of_week: number; start_time: string; end_time: string; title: string }): string {
  return `${e.day_of_week}|${e.start_time}|${e.end_time}|${e.title.toLowerCase().trim()}`
}

// ── Diff ──────────────────────────────────────────────────────────────────────

function computeDiff(
  existing: ScheduleEntryRow[],
  incoming: BatchImportEntry[]
): ScheduleDiff {
  const existKeys   = new Set(existing.map(entryKey))
  const incomKeys   = new Set(incoming.map(entryKey))

  // Map by normalised title for move detection
  const existTitles = new Map<string, ScheduleEntryRow>()
  const incomTitles = new Map<string, BatchImportEntry>()
  for (const e of existing) existTitles.set(e.title.toLowerCase().trim(), e)
  for (const e of incoming) incomTitles.set(e.title.toLowerCase().trim(), e)

  const added:   string[] = []
  const removed: string[] = []
  const moved:   string[] = []

  for (const e of existing) {
    if (!incomKeys.has(entryKey(e))) {
      const newE = incomTitles.get(e.title.toLowerCase().trim())
      if (newE) {
        moved.push(
          `${e.title}: ${DAYS[e.day_of_week]} ${e.start_time} → ${DAYS[newE.day_of_week]} ${newE.start_time}`
        )
      } else {
        removed.push(`${DAYS[e.day_of_week]} ${e.start_time} ${e.title}`)
      }
    }
  }

  for (const e of incoming) {
    if (!existKeys.has(entryKey(e))) {
      const titleKey = (e.subject_name ?? e.title).toLowerCase().trim()
      if (!existTitles.has(titleKey)) {
        added.push(`${DAYS[e.day_of_week]} ${e.start_time} ${e.title}`)
      }
    }
  }

  return { added, removed, moved }
}

// ── Core sync ─────────────────────────────────────────────────────────────────

export async function syncNow(isManual = false): Promise<TulguSyncResult> {
  if (isSyncing) return { changed: false, diff: { added: [], removed: [], moved: [] } }

  const baseUrl    = getSetting('tulgu.baseUrl')    ?? ''
  const groupId    = getSetting('tulgu.groupId')    ?? ''
  const entityType = (getSetting('tulgu.entityType') ?? 'group') as 'group' | 'teacher'
  const token      = getSetting('tulgu.token')      ?? ''

  if (!baseUrl || !groupId) {
    throw new Error('ТулГУ не настроен: укажите URL API и выберите группу')
  }

  isSyncing = true
  broadcast('tulgu:status-changed', getTulguStatus())

  // Cancel pending retry
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }

  try {
    const incoming = await fetchTulguSchedule(baseUrl, token, groupId, entityType)
    const existing = getAllScheduleEntries()
    const diff     = computeDiff(existing, incoming)
    const changed  = diff.added.length > 0 || diff.removed.length > 0 || diff.moved.length > 0

    if (changed) {
      batchImportScheduleEntries(incoming, true)

      const parts: string[] = []
      if (diff.added.length)   parts.push(`+${diff.added.length} добавлено`)
      if (diff.removed.length) parts.push(`−${diff.removed.length} удалено`)
      if (diff.moved.length)   parts.push(`↔ ${diff.moved.length} перенесено`)

      if (Notification.isSupported()) {
        new Notification({
          title: 'Расписание обновлено — StudyHub',
          body:  parts.join(', '),
        }).show()
      }

      broadcast('tulgu:schedule-updated', diff)
    }

    setSetting('tulgu.lastUpdated', new Date().toISOString())
    setSetting('tulgu.lastError',   '')
    setSetting('tulgu.lastErrorAt', '')

    isSyncing = false
    broadcast('tulgu:status-changed', getTulguStatus())

    // Schedule next auto-sync
    if (!isManual) scheduleNext()

    return { changed, diff }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    setSetting('tulgu.lastError',   msg)
    setSetting('tulgu.lastErrorAt', new Date().toISOString())

    isSyncing = false
    broadcast('tulgu:status-changed', getTulguStatus())

    // Retry in 15 min (only for auto-sync)
    if (!isManual) {
      retryTimer = setTimeout(() => {
        void syncNow(false)
      }, 15 * 60_000)
    }

    throw err
  }
}

// ── Timer ─────────────────────────────────────────────────────────────────────

function scheduleNext(): void {
  if (syncTimer) { clearTimeout(syncTimer); syncTimer = null }

  const interval   = getSetting('tulgu.interval') ?? 'manual'
  if (interval === 'manual') return

  const intervalMs = INTERVAL_MS[interval]
  if (!intervalMs) return

  const lastUpdated = getSetting('tulgu.lastUpdated')
  const lastMs      = lastUpdated ? new Date(lastUpdated).getTime() : 0
  const delay       = Math.max(60_000, lastMs + intervalMs - Date.now())

  syncTimer = setTimeout(() => {
    void syncNow(false).catch(() => {/* errors already stored in settings */})
  }, delay)
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Call once after the database is ready. */
export function startTulguScheduler(): void {
  const interval   = getSetting('tulgu.interval') ?? 'manual'
  if (interval === 'manual') return

  const intervalMs = INTERVAL_MS[interval]
  if (!intervalMs) return

  const lastUpdated = getSetting('tulgu.lastUpdated')
  const lastMs      = lastUpdated ? new Date(lastUpdated).getTime() : 0
  const overdue     = Date.now() - lastMs >= intervalMs

  if (overdue) {
    // Delay slightly so the renderer window is fully loaded before we send events
    setTimeout(() => {
      void syncNow(false).catch(() => {})
    }, 8_000)
  } else {
    scheduleNext()
  }
}

/** Call whenever the user saves new settings so the timer is recalculated. */
export function restartTulguScheduler(): void {
  if (retryTimer) { clearTimeout(retryTimer); retryTimer = null }
  scheduleNext()
}
