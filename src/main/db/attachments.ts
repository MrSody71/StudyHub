import { getDb } from './database'
import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'

export interface AttachmentRow {
  id:                   number
  task_id:              number | null  // null for subject-level (Moodle) attachments
  subject_id:           number | null
  filename:             string
  filepath:             string
  size:                 number
  mime_type:            string
  is_folder:            number         // 0 | 1
  parent_attachment_id: number | null
  moodle_file_url:      string | null
  storage_path:         string | null
  is_deleted:           number         // 0 | 1
  created_at:           string
  updated_at:           string
}

function getMimeType(filename: string): string {
  const ext = (filename.split('.').pop() ?? '').toLowerCase()
  const map: Record<string, string> = {
    pdf:  'application/pdf',
    doc:  'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls:  'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ppt:  'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    jpg:  'image/jpeg',
    jpeg: 'image/jpeg',
    png:  'image/png',
    gif:  'image/gif',
    svg:  'image/svg+xml',
    webp: 'image/webp',
    bmp:  'image/bmp',
    txt:  'text/plain',
    md:   'text/markdown',
    csv:  'text/csv',
    zip:  'application/zip',
    rar:  'application/x-rar-compressed',
    '7z': 'application/x-7z-compressed',
    mp4:  'video/mp4',
    mp3:  'audio/mpeg',
    json: 'application/json',
  }
  return map[ext] ?? 'application/octet-stream'
}

export function getAttachmentsByTask(taskId: number): AttachmentRow[] {
  return getDb()
    .prepare('SELECT * FROM attachments WHERE task_id = ? AND is_deleted = 0 ORDER BY created_at DESC')
    .all(taskId) as AttachmentRow[]
}

export function addAttachment(taskId: number, sourcePath: string): AttachmentRow {
  const db = getDb()
  const filename = path.basename(sourcePath)
  const stat = fs.statSync(sourcePath)
  const mimeType = getMimeType(filename)

  // Store files under userData/attachments/<taskId>/
  const dir = path.join(app.getPath('userData'), 'attachments', String(taskId))
  fs.mkdirSync(dir, { recursive: true })

  // Prefix with timestamp to avoid name collisions
  const storedName = `${Date.now()}_${filename}`
  const destPath = path.join(dir, storedName)

  fs.copyFileSync(sourcePath, destPath)

  const result = db
    .prepare(
      `INSERT INTO attachments (task_id, filename, filepath, size, mime_type, updated_at)
       VALUES (?, ?, ?, ?, ?, ${NOW})`
    )
    .run(taskId, filename, destPath, stat.size, mimeType)

  return db
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(result.lastInsertRowid) as AttachmentRow
}

const NOW = "strftime('%Y-%m-%dT%H:%M:%fZ','now')"

export function deleteAttachment(id: number): void {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(id) as AttachmentRow | undefined

  if (!row) return

  // Physically delete the file/folder from disk — the file is no longer needed.
  // The DB row is soft-deleted so the deletion propagates via sync.
  try {
    if (row.is_folder) {
      if (fs.existsSync(row.filepath)) {
        fs.rmSync(row.filepath, { recursive: true, force: true })
      }
    } else if (fs.existsSync(row.filepath)) {
      fs.unlinkSync(row.filepath)
    }
  } catch (err) {
    console.error('[Attachments] Failed to delete file/folder:', err)
  }

  // Soft-delete children then the parent
  if (row.is_folder) {
    db.prepare(`UPDATE attachments SET is_deleted = 1, updated_at = ${NOW} WHERE parent_attachment_id = ?`).run(id)
  }
  db.prepare(`UPDATE attachments SET is_deleted = 1, updated_at = ${NOW} WHERE id = ?`).run(id)
}

export interface AddMultipleResult {
  added:   AttachmentRow[]
  skipped: string[]          // filenames of duplicates (same name + size)
}

export function addAttachmentMultiple(taskId: number, sourcePaths: string[]): AddMultipleResult {
  const existing = getAttachmentsByTask(taskId)
  const added:   AttachmentRow[] = []
  const skipped: string[]        = []

  for (const sourcePath of sourcePaths) {
    const filename = path.basename(sourcePath)
    let   size: number
    try {
      size = fs.statSync(sourcePath).size
    } catch {
      skipped.push(filename)
      continue
    }

    const isDuplicate = existing.some(
      (a) => a.filename === filename && a.size === size
    )
    if (isDuplicate) {
      skipped.push(filename)
      continue
    }

    const row = addAttachment(taskId, sourcePath)
    existing.push(row)   // guard against duplicates within the same batch
    added.push(row)
  }

  return { added, skipped }
}

// ── Folder attachments ────────────────────────────────────────────────────────

function collectFilesRecursive(
  dir: string,
  base: string
): Array<{ rel: string; abs: string }> {
  const result: Array<{ rel: string; abs: string }> = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      result.push(...collectFilesRecursive(abs, base))
    } else if (entry.isFile()) {
      result.push({ rel: path.relative(base, abs), abs })
    }
  }
  return result
}

export interface AddFolderResult {
  folder:   AttachmentRow
  children: AttachmentRow[]
}

export function addFolder(
  taskId:      number,
  sourcePath:  string,
  displayName: string
): AddFolderResult {
  const db = getDb()

  // Collect all files before touching the DB
  const files = collectFilesRecursive(sourcePath, sourcePath)
  const totalSize = files.reduce((sum, { abs }) => sum + fs.statSync(abs).size, 0)

  // Create destination directory
  const storageDir = path.join(app.getPath('userData'), 'attachments', String(taskId))
  const destDir    = path.join(storageDir, `${Date.now()}_${displayName}`)
  fs.mkdirSync(destDir, { recursive: true })

  // Copy all files; clean up on failure
  const copied: Array<{ rel: string; destPath: string; size: number; mime: string }> = []
  try {
    for (const { rel, abs } of files) {
      const dest = path.join(destDir, rel)
      fs.mkdirSync(path.dirname(dest), { recursive: true })
      fs.copyFileSync(abs, dest)
      copied.push({
        rel,
        destPath: dest,
        size:     fs.statSync(abs).size,
        mime:     getMimeType(path.basename(abs)),
      })
    }
  } catch (err) {
    try { fs.rmSync(destDir, { recursive: true, force: true }) } catch { /* best-effort */ }
    throw err
  }

  // Insert DB rows in a single transaction
  const insertAll = db.transaction((): AddFolderResult => {
    const folderRun = db
      .prepare(
        `INSERT INTO attachments (task_id, filename, filepath, size, mime_type, is_folder, updated_at)
         VALUES (?, ?, ?, ?, 'inode/directory', 1, ${NOW})`
      )
      .run(taskId, displayName, destDir, totalSize)
    const folderId = Number(folderRun.lastInsertRowid)

    for (const { rel, destPath, size, mime } of copied) {
      db.prepare(
        `INSERT INTO attachments
           (task_id, filename, filepath, size, mime_type, is_folder, parent_attachment_id, updated_at)
         VALUES (?, ?, ?, ?, ?, 0, ?, ${NOW})`
      ).run(taskId, rel, destPath, size, mime, folderId)
    }

    const folder   = db.prepare('SELECT * FROM attachments WHERE id = ?').get(folderId) as AttachmentRow
    const children = db
      .prepare('SELECT * FROM attachments WHERE parent_attachment_id = ? ORDER BY filename')
      .all(folderId) as AttachmentRow[]

    return { folder, children }
  })

  return insertAll()
}

export function getAttachmentById(id: number): AttachmentRow | null {
  return (getDb().prepare('SELECT * FROM attachments WHERE id = ?').get(id) as AttachmentRow) ?? null
}

export function openAttachment(id: number): void {
  const row = getDb()
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(id) as AttachmentRow | undefined

  if (row && fs.existsSync(row.filepath)) {
    shell.openPath(row.filepath)
  }
}

// ── Subject-level attachments (Moodle files) ─────────────────────────────────

export function getAttachmentsBySubject(subjectId: number): AttachmentRow[] {
  return getDb()
    .prepare(
      'SELECT * FROM attachments WHERE subject_id = ? AND is_deleted = 0 ORDER BY created_at DESC'
    )
    .all(subjectId) as AttachmentRow[]
}

/** Checks if a Moodle file (by URL) is already stored for this subject. */
export function findAttachmentByMoodleUrl(moodleUrl: string): AttachmentRow | null {
  return (
    getDb()
      .prepare(
        'SELECT * FROM attachments WHERE moodle_file_url = ? AND is_deleted = 0 LIMIT 1'
      )
      .get(moodleUrl) as AttachmentRow | null
  ) ?? null
}

/**
 * Saves a Moodle file to disk and records it in attachments.
 * The file is stored at userData/moodle-files/{subjectId}/{filename}.
 * Returns null and skips if the file already exists (checked by moodle_file_url).
 */
export function addMoodleAttachment(
  subjectId:     number,
  filename:      string,
  sourcePath:    string,   // already downloaded temp path or final path
  size:          number,
  mimeType:      string,
  moodleFileUrl: string
): AttachmentRow {
  const db = getDb()

  const dir = path.join(app.getPath('userData'), 'moodle-files', String(subjectId))
  fs.mkdirSync(dir, { recursive: true })

  const ext       = path.extname(filename)
  const base      = path.basename(filename, ext)
  let destName    = filename
  let destPath    = path.join(dir, destName)
  let suffix      = 1
  // Avoid name collisions within the same subject folder
  while (fs.existsSync(destPath)) {
    destName = `${base}_${suffix}${ext}`
    destPath = path.join(dir, destName)
    suffix++
  }

  if (sourcePath !== destPath) {
    fs.copyFileSync(sourcePath, destPath)
  }

  const result = db
    .prepare(
      `INSERT INTO attachments
         (task_id, subject_id, filename, filepath, size, mime_type, moodle_file_url, updated_at)
       VALUES (NULL, ?, ?, ?, ?, ?, ?, ${NOW})`
    )
    .run(subjectId, filename, destPath, size, mimeType, moodleFileUrl)

  return db
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(result.lastInsertRowid) as AttachmentRow
}
