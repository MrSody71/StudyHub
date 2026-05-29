import { protocol } from 'electron'
import fs from 'fs'
import { getAttachmentById } from './db/attachments'

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
      if (!fs.existsSync(row.filepath)) return new Response('File missing', { status: 404 })

      const data = fs.readFileSync(row.filepath)
      return new Response(data, {
        headers: {
          'Content-Type':  row.mime_type,
          'Cache-Control': 'no-store',
        },
      })
    } catch (err) {
      console.error('[protocol] attachment error', err)
      return new Response('Internal error', { status: 500 })
    }
  })
}
