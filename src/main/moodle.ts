/**
 * Moodle ТулГУ integration.
 *
 * Base URL:  https://moodle.tulsu.ru
 * WS entry:  /webservice/rest/server.php?moodlewsrestformat=json&wstoken=TOKEN&wsfunction=FUNC
 * Auth:      GET /login/token.php?username=U&password=P&service=moodle_mobile_app
 */

import { BrowserWindow, app } from 'electron'
import fs   from 'fs'
import path from 'path'
import { getDb } from './db/database'
import { getSetting, setSetting } from './db/settings'
import { getAllSubjects, createSubject } from './db/subjects'
import {
  findAttachmentByMoodleUrl,
  addMoodleAttachment,
} from './db/attachments'

// ── Constants ─────────────────────────────────────────────────────────────────

const BASE_URL = 'https://moodle.tulsu.ru'
const WS_URL   = `${BASE_URL}/webservice/rest/server.php?moodlewsrestformat=json`

// ── Raw API types ─────────────────────────────────────────────────────────────

interface MoodleTokenResponse {
  token?:   string
  error?:   string
  errorcode?: string
}

interface MoodleSiteInfo {
  userid:   number
  fullname: string
  errorcode?: string
  message?: string
}

interface MoodleRawCourse {
  id:        number
  fullname:  string
  shortname: string
}

interface MoodleRawAssignment {
  id:          number
  name:        string
  intro:       string
  duedate:     number   // unix timestamp, 0 = no deadline
  cmid:        number
}

interface MoodleRawFileEntry {
  type:      string   // 'file' | 'url' | ...
  filename:  string
  fileurl:   string
  filesize:  number
  mimetype:  string
}

interface MoodleRawModule {
  id:       number
  name:     string
  modname:  string   // 'resource' | 'folder' | 'assign' | ...
  contents?: MoodleRawFileEntry[]
}

interface MoodleRawSection {
  id:      number
  name:    string
  modules: MoodleRawModule[]
}

// ── Progress helper ───────────────────────────────────────────────────────────

export interface MoodleSyncProgress {
  stage:   'courses' | 'assignments' | 'files' | 'done' | 'error'
  message: string
}

export interface MoodleSyncResult {
  assignmentsCreated: number
  filesDownloaded:    number
  filesSkipped:       number
}

export interface MoodleStatusData {
  isLoggedIn: boolean
  userId:     number | null
  fullname:   string | null
  lastSyncAt: string | null
  lastError:  string | null
}

export interface MoodleCourseData {
  id:         number
  fullname:   string
  shortname:  string
  subject_id: number | null
}

function emitProgress(progress: MoodleSyncProgress): void {
  const wins = BrowserWindow.getAllWindows()
  for (const win of wins) {
    win.webContents.send('moodle:sync-progress', progress)
  }
}

// ── HTTP helpers ──────────────────────────────────────────────────────────────

async function callWs(wsfunction: string, params: Record<string, string>, token: string): Promise<unknown> {
  const url = new URL(WS_URL)
  url.searchParams.set('wstoken',    token)
  url.searchParams.set('wsfunction', wsfunction)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }

  const res  = await fetch(url.toString(), { headers: { Accept: 'application/json' } })
  const data = (await res.json()) as Record<string, unknown>

  if (data.errorcode) {
    const msg = String(data.message ?? data.errorcode)
    // Distinguish "invalid token" from other errors
    if (String(data.errorcode) === 'invalidtoken' || String(data.errorcode) === 'accessdenied') {
      throw Object.assign(new Error(msg), { code: 'MOODLE_INVALID_TOKEN' })
    }
    throw new Error(msg)
  }

  return data
}

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Authenticates with Moodle, stores token + user info in settings.
 * Never stores the password.
 */
export async function moodleLogin(username: string, password: string): Promise<{ userId: number; fullname: string }> {
  const tokenUrl =
    `${BASE_URL}/login/token.php` +
    `?username=${encodeURIComponent(username)}` +
    `&password=${encodeURIComponent(password)}` +
    `&service=moodle_mobile_app`

  const res  = await fetch(tokenUrl, { headers: { Accept: 'application/json' } })
  const data = (await res.json()) as MoodleTokenResponse

  if (!data.token) {
    throw new Error(data.error ?? data.errorcode ?? 'Не удалось получить токен — проверьте логин и пароль')
  }

  const token = data.token
  const info  = (await callWs('core_webservice_get_site_info', {}, token)) as MoodleSiteInfo

  setSetting('moodle.token',    token)
  setSetting('moodle.userId',   String(info.userid))
  setSetting('moodle.fullname', info.fullname)
  setSetting('moodle.lastError', '')

  return { userId: info.userid, fullname: info.fullname }
}

export function moodleLogout(): void {
  setSetting('moodle.token',    '')
  setSetting('moodle.userId',   '')
  setSetting('moodle.fullname', '')
}

export function getMoodleStatus(): MoodleStatusData {
  const token    = getSetting('moodle.token') ?? ''
  const userIdRaw = getSetting('moodle.userId') ?? ''
  return {
    isLoggedIn: !!token,
    userId:     userIdRaw ? Number(userIdRaw) : null,
    fullname:   getSetting('moodle.fullname') || null,
    lastSyncAt: getSetting('moodle.lastSyncAt') || null,
    lastError:  getSetting('moodle.lastError')  || null,
  }
}

// ── Courses ───────────────────────────────────────────────────────────────────

/** Returns Moodle courses enriched with the currently mapped subject_id from the DB. */
export async function getMoodleCourses(): Promise<MoodleCourseData[]> {
  const token    = getSetting('moodle.token') ?? ''
  const userIdRaw = getSetting('moodle.userId') ?? ''
  if (!token || !userIdRaw) throw new Error('Не авторизован в Moodle')

  const data = (await callWs(
    'core_enrol_get_users_courses',
    { userid: userIdRaw },
    token
  )) as MoodleRawCourse[]

  // Build a map moodle_course_id → subject_id from current DB
  const db = getDb()
  const mappedRows = db
    .prepare('SELECT id, moodle_course_id FROM subjects WHERE moodle_course_id IS NOT NULL AND is_deleted = 0')
    .all() as { id: number; moodle_course_id: string }[]
  const courseToSubject = new Map(mappedRows.map((r) => [r.moodle_course_id, r.id]))

  return data.map((c) => ({
    id:         c.id,
    fullname:   c.fullname,
    shortname:  c.shortname,
    subject_id: courseToSubject.get(String(c.id)) ?? null,
  }))
}

/**
 * Maps a Moodle course to a local subject.
 * Pass subjectId = 0 to create a new subject automatically from the course name.
 */
export function mapMoodleCourse(
  moodleCourseId: number,
  subjectId:      number,
  courseName?:    string
): number {
  const db = getDb()

  // Create a new subject if subjectId = 0
  if (subjectId === 0) {
    const name = courseName?.trim() || `Предмет Moodle ${moodleCourseId}`
    const row = createSubject({ name, color: '#4f46e5' })
    subjectId = row.id
  }

  db.prepare(
    `UPDATE subjects SET moodle_course_id = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?`
  ).run(String(moodleCourseId), subjectId)

  return subjectId
}

/** Removes the Moodle mapping from a subject. */
export function unmapMoodleCourse(moodleCourseId: number): void {
  getDb()
    .prepare(
      `UPDATE subjects SET moodle_course_id = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE moodle_course_id = ?`
    )
    .run(String(moodleCourseId))
}

// ── Full Sync ─────────────────────────────────────────────────────────────────

export async function moodleSyncAll(): Promise<MoodleSyncResult> {
  const token     = getSetting('moodle.token') ?? ''
  const userIdRaw = getSetting('moodle.userId') ?? ''

  if (!token || !userIdRaw) throw new Error('Не авторизован в Moodle')

  const result: MoodleSyncResult = { assignmentsCreated: 0, filesDownloaded: 0, filesSkipped: 0 }

  try {
    // 1. Fetch all enrolled courses
    emitProgress({ stage: 'courses', message: 'Загружаем список предметов из Moodle…' })
    const courses = (await callWs(
      'core_enrol_get_users_courses',
      { userid: userIdRaw },
      token
    )) as MoodleRawCourse[]

    // Only sync courses that are mapped to a local subject
    const db = getDb()
    const mappedRows = db
      .prepare('SELECT id, moodle_course_id FROM subjects WHERE moodle_course_id IS NOT NULL AND is_deleted = 0')
      .all() as { id: number; moodle_course_id: string }[]
    const courseToSubject = new Map(mappedRows.map((r) => [r.moodle_course_id, r.id]))

    const mappedCourses = courses.filter((c) => courseToSubject.has(String(c.id)))

    if (mappedCourses.length === 0) {
      emitProgress({ stage: 'done', message: 'Нет привязанных предметов для синхронизации' })
      setSetting('moodle.lastSyncAt', new Date().toISOString())
      setSetting('moodle.lastError', '')
      return result
    }

    // 2. Sync assignments
    emitProgress({ stage: 'assignments', message: 'Загружаем задания…' })
    for (const course of mappedCourses) {
      const subjectId = courseToSubject.get(String(course.id))!
      emitProgress({ stage: 'assignments', message: `Задания: ${course.shortname}` })
      const created = await syncAssignments(token, course.id, subjectId, db)
      result.assignmentsCreated += created
    }

    // 3. Sync files
    emitProgress({ stage: 'files', message: 'Загружаем файлы и методички…' })
    for (const course of mappedCourses) {
      const subjectId = courseToSubject.get(String(course.id))!
      emitProgress({ stage: 'files', message: `Файлы: ${course.shortname}` })
      const { downloaded, skipped } = await syncFiles(token, course.id, subjectId)
      result.filesDownloaded += downloaded
      result.filesSkipped    += skipped
    }

    setSetting('moodle.lastSyncAt', new Date().toISOString())
    setSetting('moodle.lastError', '')
    emitProgress({
      stage: 'done',
      message: `Готово: заданий +${result.assignmentsCreated}, файлов +${result.filesDownloaded}`
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    setSetting('moodle.lastError', msg)
    emitProgress({ stage: 'error', message: msg })
    throw e
  }

  return result
}

// ── Assignment sync ───────────────────────────────────────────────────────────

async function syncAssignments(
  token:     string,
  courseId:  number,
  subjectId: number,
  db:        ReturnType<typeof getDb>
): Promise<number> {
  const data = (await callWs(
    'mod_assign_get_assignments',
    { 'courseids[0]': String(courseId) },
    token
  )) as { courses: Array<{ assignments: MoodleRawAssignment[] }> }

  const assignments: MoodleRawAssignment[] =
    data.courses?.[0]?.assignments ?? []

  let created = 0

  for (const a of assignments) {
    const moodleId = `moodle_${a.id}`

    // Check for existing task by moodle_assignment_id + subject_id
    const existing = db
      .prepare(
        'SELECT id FROM tasks WHERE moodle_assignment_id = ? AND subject_id = ? AND is_deleted = 0 LIMIT 1'
      )
      .get(moodleId, subjectId)

    if (existing) continue

    const dueDate = a.duedate > 0
      ? new Date(a.duedate * 1000).toISOString().slice(0, 10)
      : null

    // Strip basic HTML from intro
    const description = a.intro
      ? a.intro.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() || null
      : null

    db.prepare(
      `INSERT INTO tasks
         (subject_id, title, description, status, priority, due_date, moodle_assignment_id, updated_at)
       VALUES (?, ?, ?, 'not_started', 'medium', ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))`
    ).run(subjectId, a.name, description, dueDate, moodleId)

    created++
  }

  return created
}

// ── File sync ─────────────────────────────────────────────────────────────────

async function syncFiles(
  token:     string,
  courseId:  number,
  subjectId: number
): Promise<{ downloaded: number; skipped: number }> {
  const sections = (await callWs(
    'core_course_get_contents',
    { courseid: String(courseId) },
    token
  )) as MoodleRawSection[]

  let downloaded = 0
  let skipped    = 0

  const tmpDir = path.join(app.getPath('temp'), 'studyhub-moodle')
  fs.mkdirSync(tmpDir, { recursive: true })

  for (const section of sections) {
    for (const mod of section.modules ?? []) {
      if (!['resource', 'folder'].includes(mod.modname)) continue
      for (const file of mod.contents ?? []) {
        if (file.type !== 'file') continue

        // Dedup by moodle file URL (without token parameter)
        const cleanUrl = file.fileurl.replace(/[?&]token=[^&]*/g, '')
        const existing = findAttachmentByMoodleUrl(cleanUrl)
        if (existing) { skipped++; continue }

        // Append token to download URL
        const downloadUrl = file.fileurl.includes('?')
          ? `${file.fileurl}&token=${token}`
          : `${file.fileurl}?token=${token}`

        let tmpPath: string | null = null
        try {
          tmpPath = await downloadToTemp(downloadUrl, file.filename, tmpDir)
          addMoodleAttachment(
            subjectId,
            file.filename,
            tmpPath,
            file.filesize || fs.statSync(tmpPath).size,
            file.mimetype || 'application/octet-stream',
            cleanUrl
          )
          downloaded++
        } catch (e) {
          console.error(`[Moodle] Failed to download ${file.filename}:`, e)
        } finally {
          if (tmpPath && fs.existsSync(tmpPath)) {
            try { fs.unlinkSync(tmpPath) } catch { /* best-effort */ }
          }
        }
      }
    }
  }

  return { downloaded, skipped }
}

async function downloadToTemp(url: string, filename: string, tmpDir: string): Promise<string> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} при загрузке ${filename}`)

  const safe    = filename.replace(/[/\\?%*:|"<>]/g, '_')
  const tmpPath = path.join(tmpDir, `${Date.now()}_${safe}`)
  const buf     = await res.arrayBuffer()
  fs.writeFileSync(tmpPath, Buffer.from(buf))
  return tmpPath
}
