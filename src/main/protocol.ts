import { protocol } from 'electron'
import fs from 'fs'
import { getAttachmentById } from './db/attachments'
import { isInsideUserData } from './pathSecurity'

// Only allow known-safe MIME types to be served with their real type.
// Everything else is served as application/octet-stream to prevent
// the renderer from interpreting unexpected content (e.g. HTML → XSS).
const SAFE_MIME_PREFIXES = ['image/', 'audio/', 'video/', 'application/pdf', 'text/plain']

function safeMimeType(mime: string): string {
  const lower = mime.toLowerCase()
  if (SAFE_MIME_PREFIXES.some((p) => lower.startsWith(p))) return lower
  return 'application/octet-stream'
}

/**
 * Must be called inside app.whenReady() — after the DB is initialised.
 * Serves attachment files via the `attachment://<id>` scheme so the renderer
 * can load them in <img> / <iframe> / <embed> without accessing file:// directly.
 */
export function setupAttachmentProtocol(): void {
  protocol.handle('attachment', (request) => {
    try {
      const id  = parseInt(new URL(request.url).hostname, 10)
      if (isNaN(id)) return new Response('Bad id', { status: 400 })

      const row = getAttachmentById(id)
      if (!row) return new Response('Not found', { status: 404 })

      // Security: ensure the file is inside userData to prevent serving arbitrary files
      if (!isInsideUserData(row.filepath)) {
        console.error('[protocol] Blocked serving file outside userData:', row.filepath)
        return new Response('Forbidden', { status: 403 })
      }

      if (!fs.existsSync(row.filepath)) return new Response('File missing', { status: 404 })

      const data = fs.readFileSync(row.filepath)
      return new Response(data, {
        headers: {
          'Content-Type':        safeMimeType(row.mime_type),
          'Cache-Control':       'no-store',
          'X-Content-Type-Options': 'nosniff',
        },
      })
    } catch (err) {
      console.error('[protocol] attachment error', err)
      return new Response('Internal error', { status: 500 })
    }
  })
}
