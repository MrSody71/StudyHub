import { Notification } from 'electron'
import { getDb } from './db/database'

// Tracks task IDs already notified this session — prevents duplicates on repeated checks
const notifiedIds = new Set<number>()

interface DueTask {
  id:           number
  title:        string
  subject_name: string
}

/** Returns the date string (YYYY-MM-DD) for N days from now. */
function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  return d.toISOString().slice(0, 10)
}

function checkDeadlines(): void {
  if (!Notification.isSupported()) return

  const tomorrow = dateOffset(1)

  try {
    const tasks = getDb()
      .prepare(`
        SELECT t.id, t.title, s.name AS subject_name
        FROM   tasks    t
        JOIN   subjects s ON s.id = t.subject_id
        WHERE  t.due_date = ?
          AND  t.status  != 'done'
      `)
      .all(tomorrow) as DueTask[]

    for (const task of tasks) {
      if (notifiedIds.has(task.id)) continue
      notifiedIds.add(task.id)

      new Notification({
        title: '⏰ Завтра дедлайн — StudyHub',
        body:  `${task.subject_name}: ${task.title}`,
      }).show()
    }
  } catch (err) {
    console.error('[Notifications] checkDeadlines error:', err)
  }
}

/**
 * Call once after the database is ready.
 * Fires an initial check after 3 s, then repeats every hour.
 */
export function startNotificationScheduler(): void {
  setTimeout(checkDeadlines, 3_000)
  setInterval(checkDeadlines, 60 * 60 * 1_000)
}
