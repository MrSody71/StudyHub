import { getDb } from './database'
import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'

export interface AttachmentRow {
  id: number
  task_id: number
  filename: string
  filepath: string
  size: number
  mime_type: string
  created_at: string
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
    .prepare('SELECT * FROM attachments WHERE task_id = ? ORDER BY created_at DESC')
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
      `INSERT INTO attachments (task_id, filename, filepath, size, mime_type)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(taskId, filename, destPath, stat.size, mimeType)

  return db
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(result.lastInsertRowid) as AttachmentRow
}

export function deleteAttachment(id: number): void {
  const db = getDb()
  const row = db
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(id) as AttachmentRow | undefined

  if (!row) return

  try {
    if (fs.existsSync(row.filepath)) {
      fs.unlinkSync(row.filepath)
    }
  } catch (err) {
    console.error('[Attachments] Failed to delete file:', err)
  }

  db.prepare('DELETE FROM attachments WHERE id = ?').run(id)
}

export function openAttachment(id: number): void {
  const row = getDb()
    .prepare('SELECT * FROM attachments WHERE id = ?')
    .get(id) as AttachmentRow | undefined

  if (row && fs.existsSync(row.filepath)) {
    shell.openPath(row.filepath)
  }
}
