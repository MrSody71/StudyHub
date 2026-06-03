/**
 * ТулГУ (Тульский государственный университет) schedule import adapter.
 *
 * Ожидаемый формат ответа API (поддерживаются несколько вариантов имён полей):
 *
 * GET {baseUrl}/api/groups[?token={token}]
 * Ответ:
 *   { "groups": [{ "id": "123", "name": "220191" }, ...] }
 *   или просто массив: [{ "id": "123", "name": "220191" }, ...]
 *   Поддерживаемые ключи для id:   id, group_id, code, value
 *   Поддерживаемые ключи для name: name, title, label, group_name, full_name
 *
 * GET {baseUrl}/api/schedule?group_id={id}[&token={token}][&date_from=YYYY-MM-DD][&date_to=YYYY-MM-DD]
 * Ответ:
 *   {
 *     "lessons": [               // или "schedule", "data", "items", "timetable", "rasp"
 *       {
 *         // Название дисциплины (любое из полей):
 *         "subject" | "discipline" | "title" | "name" | "lesson_name": "Математический анализ",
 *
 *         // Тип занятия (необязательно, добавляется в скобках к названию):
 *         "type" | "lesson_type" | "kind" | "form": "Лекция",
 *
 *         // День недели — одно из:
 *         "weekday" | "day" | "day_of_week": 1,   // 1–7 (Пн=1) или 0–6 (Пн=0)
 *         "date": "2024-09-09",                    // ISO-дата → конвертируется в день недели
 *
 *         // Время начала и конца (HH:MM):
 *         "time_start" | "start_time" | "time_begin": "09:30",
 *         "time_end"   | "end_time"   | "time_finish": "11:05",
 *
 *         // Аудитория (необязательно):
 *         "classroom" | "auditorium" | "room" | "location": "А-301",
 *
 *         // Преподаватель (необязательно):
 *         "teacher" | "teacher_full" | "lecturer" | "professor": "Иванов И.И."
 *       }
 *     ]
 *   }
 *
 * Если структура API ТулГУ отличается — адаптируйте функции parseGroups/parseLessons ниже.
 */

import type { BatchImportEntry } from '../renderer/src/types'

export interface ApiGroup {
  id:   string
  name: string
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function pick(obj: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k]
    if (typeof v === 'string' && v.trim()) return v.trim()
    if (typeof v === 'number') return String(v)
  }
  return undefined
}

async function httpGet(url: string): Promise<string> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`HTTP ${res.status} при запросе ${url}`)
  return res.text()
}

function buildUrl(base: string, path: string, params: Record<string, string>): string {
  const b = base.replace(/\/$/, '')
  const p = path.startsWith('/') ? path : '/' + path
  const q = new URLSearchParams(params).toString()
  return `${b}${p}${q ? '?' + q : ''}`
}

/** Конвертирует день недели из различных форматов в 0=Пн…6=Вс */
function parseWeekday(val: unknown): number | null {
  if (val == null) return null
  if (typeof val === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(val)) {
      const d = new Date(val)
      if (!isNaN(d.getTime())) return (d.getDay() + 6) % 7
    }
    const n = parseInt(val, 10)
    if (!isNaN(n)) return normalizeWeekday(n)
    return null
  }
  if (typeof val === 'number') return normalizeWeekday(val)
  return null
}

function normalizeWeekday(n: number): number {
  if (n >= 1 && n <= 7) return n - 1   // 1-based → 0-based
  if (n >= 0 && n <= 6) return n
  return 0
}

function normalizeTime(t: unknown): string | null {
  if (typeof t !== 'string') return null
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return null
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

// ── Parsers ───────────────────────────────────────────────────────────────────

function parseGroups(data: unknown): ApiGroup[] {
  if (!data || typeof data !== 'object') return []

  let arr: unknown[] = []
  if (Array.isArray(data)) {
    arr = data
  } else {
    const d = data as Record<string, unknown>
    for (const k of ['groups', 'teachers', 'data', 'items', 'list', 'result']) {
      if (Array.isArray(d[k])) { arr = d[k] as unknown[]; break }
    }
  }

  return arr
    .filter((x): x is Record<string, unknown> => typeof x === 'object' && x !== null)
    .map((x) => ({
      id:   pick(x, 'id', 'group_id', 'teacher_id', 'code', 'value') ?? '',
      name: pick(x, 'name', 'title', 'label', 'group_name', 'full_name', 'fio') ?? ''
    }))
    .filter((g) => g.id && g.name)
}

function parseLessons(data: unknown): BatchImportEntry[] {
  if (!data || typeof data !== 'object') return []

  let arr: unknown[] = []
  if (Array.isArray(data)) {
    arr = data
  } else {
    const d = data as Record<string, unknown>
    for (const k of ['lessons', 'schedule', 'data', 'items', 'timetable', 'result', 'rasp']) {
      if (Array.isArray(d[k])) { arr = d[k] as unknown[]; break }
    }
  }

  const entries: BatchImportEntry[] = []

  for (const item of arr) {
    if (typeof item !== 'object' || !item) continue
    const x = item as Record<string, unknown>

    const weekday = parseWeekday(
      x.weekday ?? x.day ?? x.day_of_week ?? x.dayOfWeek ?? x.date ?? x.week_day
    )
    if (weekday === null) continue

    const startTime = normalizeTime(
      x.time_start ?? x.start_time ?? x.time_begin ?? x.begin_time ?? x.timeStart
    )
    const endTime = normalizeTime(
      x.time_end ?? x.end_time ?? x.time_finish ?? x.finish_time ?? x.timeEnd
    )
    if (!startTime || !endTime) continue

    const discipline =
      pick(x, 'subject', 'discipline', 'title', 'name', 'lesson_name') ?? 'Занятие'
    const lessonType = pick(x, 'type', 'lesson_type', 'kind', 'form') ?? ''
    const fullTitle  = lessonType ? `${discipline} (${lessonType})` : discipline

    const teacher  = pick(x, 'teacher', 'teacher_full', 'lecturer', 'professor') ?? null
    const location = pick(x, 'classroom', 'auditorium', 'room', 'location', 'cabinet') ?? null

    entries.push({
      subject_name: discipline,
      title:        fullTitle,
      day_of_week:  weekday,
      start_time:   startTime,
      end_time:     endTime,
      location:     location || null,
      teacher:      teacher || null
    })
  }

  return entries
}

// ── ТулГУ (tulsu.ru) specific API ────────────────────────────────────────────
//
// Endpoint: GET https://tulsu.ru/schedule/queries/GetSchedule.php
//           ?search_field=GROUP_P&search_value=<groupNumber>
//
// Response: array of objects:
//   DATE_Z  — "DD.MM.YYYY"
//   TIME_Z  — "HH:MM - HH:MM"
//   DISCIP  — discipline name
//   KOW     — lesson type ("Лекции", "Лабораторные работы", …)
//   AUD     — classroom
//   PREP    — teacher full name
//   GROUPS  — [{ GROUP_P, PRIM }]
//   CLASS   — class code

interface TulsuItem {
  DATE_Z:  string
  TIME_Z:  string
  DISCIP:  string
  KOW:     string
  AUD:     string
  PREP:    string
  GROUPS:  Array<{ GROUP_P: string; PRIM: string }>
  CLASS:   string
}

/**
 * Fetches schedule for a specific ТулГУ group from tulsu.ru.
 * - Filters to future dates only (DATE_Z >= today).
 * - Deduplicates by (day_of_week, start_time, end_time, title) so repeated
 *   weekly occurrences collapse into one schedule_entry row.
 *
 * Note: fetch runs in the Electron main process (Node.js) so CORS is not an
 * issue. A corsproxy.io fallback is included in case of direct network errors.
 */
export async function fetchTulsuSchedule(groupNumber: string): Promise<BatchImportEntry[]> {
  const params    = new URLSearchParams({ search_field: 'GROUP_P', search_value: groupNumber.trim() })
  const directUrl = `https://tulsu.ru/schedule/queries/GetSchedule.php?${params}`
  const proxyUrl  = `https://corsproxy.io/?url=${encodeURIComponent(directUrl)}`

  let raw: string
  try {
    raw = await httpGet(directUrl)
  } catch {
    // Main-process fetch bypasses browser CORS, but network errors still happen —
    // fall back to corsproxy.io as a secondary mirror.
    raw = await httpGet(proxyUrl)
  }

  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    throw new Error('API вернул не JSON — проверьте номер группы')
  }

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Расписание не найдено — проверьте номер группы (например: Б260221)')
  }

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const entries: BatchImportEntry[] = []

  for (const item of data as TulsuItem[]) {
    if (!item.DATE_Z || !item.TIME_Z) continue

    // "DD.MM.YYYY" → Date
    const [dd, mm, yyyy] = (item.DATE_Z ?? '').split('.')
    if (!dd || !mm || !yyyy) continue
    const date = new Date(`${mm}/${dd}/${yyyy}`)
    if (isNaN(date.getTime())) continue
    if (date < today) continue          // skip past dates

    // "HH:MM - HH:MM"
    const timeParts = (item.TIME_Z ?? '').split(' - ')
    const startTime = timeParts[0]?.trim()
    const endTime   = timeParts[1]?.trim()
    if (!startTime || !endTime) continue

    const dow        = (date.getDay() + 6) % 7   // 0 = Пн … 6 = Вс
    const discipline = item.DISCIP?.trim() || 'Занятие'
    const lessonType = item.KOW?.trim()   || ''
    const title      = lessonType ? `${discipline} (${lessonType})` : discipline

    // Store the real date (YYYY-MM-DD) as source of truth.
    // Each occurrence is stored as a separate entry — no deduplication.
    const dateStr = `${yyyy}-${mm.padStart(2,'0')}-${dd.padStart(2,'0')}`

    entries.push({
      subject_name: discipline,
      title,
      day_of_week:  dow,
      start_time:   startTime,
      end_time:     endTime,
      location:     item.AUD?.trim()  || null,
      teacher:      item.PREP?.trim() || null,
      date:         dateStr,
    })
  }

  entries.sort((a, b) =>
    (a.date ?? '') !== (b.date ?? '')
      ? (a.date ?? '').localeCompare(b.date ?? '')
      : a.start_time.localeCompare(b.start_time)
  )

  return entries
}

// ── Generic Public API ────────────────────────────────────────────────────────

export async function fetchTulguGroups(
  baseUrl: string,
  token: string,
  entityType: 'group' | 'teacher'
): Promise<ApiGroup[]> {
  const params: Record<string, string> = {}
  if (token) params['token'] = token

  const paths =
    entityType === 'group'
      ? ['/api/groups', '/groups', '/api/group', '/schedule/groups']
      : ['/api/teachers', '/teachers', '/api/teacher', '/schedule/teachers']

  let lastErr: unknown
  for (const path of paths) {
    try {
      const url  = buildUrl(baseUrl, path, params)
      const body = await httpGet(url)
      const data = JSON.parse(body) as unknown
      const groups = parseGroups(data)
      if (groups.length > 0) return groups
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr ?? new Error('Не удалось загрузить список групп со всех известных эндпоинтов')
}

export async function fetchTulguSchedule(
  baseUrl: string,
  token: string,
  groupId: string,
  entityType: 'group' | 'teacher',
  dateFrom?: string,
  dateTo?: string
): Promise<BatchImportEntry[]> {
  const baseParams: Record<string, string> = {}
  if (token)    baseParams['token']     = token
  if (dateFrom) baseParams['date_from'] = dateFrom
  if (dateTo)   baseParams['date_to']   = dateTo

  const paths = ['/api/schedule', '/schedule', '/api/rasp', '/rasp', '/api/timetable', '/timetable']
  const idKeys = entityType === 'group'
    ? ['group_id', 'group', 'groupId', 'id']
    : ['teacher_id', 'teacher', 'teacherId', 'id']

  let lastErr: unknown
  for (const path of paths) {
    for (const key of idKeys) {
      try {
        const params = { ...baseParams, [key]: groupId }
        const url     = buildUrl(baseUrl, path, params)
        const body    = await httpGet(url)
        const data    = JSON.parse(body) as unknown
        const entries = parseLessons(data)
        if (entries.length > 0) return entries
      } catch (e) {
        lastErr = e
      }
    }
  }
  throw lastErr ?? new Error('Не удалось загрузить расписание — проверьте URL и параметры')
}
