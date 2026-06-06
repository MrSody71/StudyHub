// Supabase Edge Function: notify-support
// Triggered by a Database Webhook on AFTER INSERT on support_messages.
//
// Environment variables required:
//   RESEND_API_KEY  — Resend API key (from resend.com)
//   ADMIN_EMAIL     — email address of the administrator
//   APP_URL         — public URL of the web app (e.g. https://studyhub.vercel.app)
//   SUPABASE_URL    — set automatically by Supabase runtime
//   SUPABASE_SERVICE_ROLE_KEY — set automatically by Supabase runtime

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')!
const ADMIN_EMAIL    = Deno.env.get('ADMIN_EMAIL')!
const APP_URL        = Deno.env.get('APP_URL') ?? 'https://studyhub.vercel.app'
const SUPABASE_URL   = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY    = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

// ── Types ─────────────────────────────────────────────────────────────────────

interface WebhookPayload {
  type:   'INSERT' | 'UPDATE' | 'DELETE'
  table:  string
  schema: string
  record: MessageRecord
  old_record: MessageRecord | null
}

interface MessageRecord {
  id:         string
  ticket_id:  string
  sender:     'user' | 'admin'
  message:    string
  is_read:    boolean
  created_at: string
}

interface TicketRow {
  id:      string
  subject: string
  user_id: string
}

// ── Send via Resend ───────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method:  'POST',
    headers: {
      'Authorization': `Bearer ${RESEND_API_KEY}`,
      'Content-Type':  'application/json',
    },
    body: JSON.stringify({
      from:    `StudyHub <onboarding@resend.dev>`,
      to:      [to],
      subject,
      html,
    }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Resend error ${res.status}: ${err}`)
  }
}

// ── HTML templates ────────────────────────────────────────────────────────────

function emailWrapper(content: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:system-ui,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f5f7;padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.08);">
        <tr>
          <td style="background:#5046e5;padding:20px 28px;">
            <span style="color:#fff;font-size:20px;font-weight:700;">📚 StudyHub</span>
          </td>
        </tr>
        <tr><td style="padding:28px;">${content}</td></tr>
        <tr>
          <td style="padding:16px 28px;border-top:1px solid #e8eaef;background:#f9fafb;">
            <p style="margin:0;font-size:12px;color:#9099ab;">
              Это автоматическое уведомление от StudyHub. Не отвечайте на это письмо.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function adminNotificationHtml(
  userEmail: string,
  subject:   string,
  message:   string,
): string {
  return emailWrapper(`
    <h2 style="margin:0 0 16px;font-size:18px;color:#0f1117;">Новое обращение в поддержку</h2>
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#5b6376;width:110px;">Пользователь</td>
        <td style="padding:6px 0;font-size:13px;color:#0f1117;">${escHtml(userEmail)}</td>
      </tr>
      <tr>
        <td style="padding:6px 0;font-size:13px;color:#5b6376;">Тема</td>
        <td style="padding:6px 0;font-size:13px;color:#0f1117;font-weight:600;">${escHtml(subject)}</td>
      </tr>
    </table>
    <div style="background:#f4f5f7;border-radius:8px;padding:16px;font-size:14px;color:#0f1117;line-height:1.6;white-space:pre-wrap;">${escHtml(message)}</div>
    <div style="margin-top:24px;">
      <a href="${APP_URL}"
         style="display:inline-block;background:#5046e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;">
        Открыть панель администратора →
      </a>
    </div>
  `)
}

function userNotificationHtml(subject: string, message: string): string {
  return emailWrapper(`
    <h2 style="margin:0 0 8px;font-size:18px;color:#0f1117;">Ответ на ваше обращение</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#5b6376;">Тема: <strong style="color:#0f1117;">${escHtml(subject)}</strong></p>
    <div style="background:#eef1ff;border-left:3px solid #5046e5;border-radius:0 8px 8px 0;padding:16px;font-size:14px;color:#0f1117;line-height:1.6;white-space:pre-wrap;">${escHtml(message)}</div>
    <div style="margin-top:24px;">
      <a href="${APP_URL}"
         style="display:inline-block;background:#5046e5;color:#fff;text-decoration:none;padding:10px 20px;border-radius:8px;font-size:14px;font-weight:600;">
        Открыть раздел «Поддержка» →
      </a>
    </div>
  `)
}

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  try {
    // Supabase Database Webhooks send a POST with the record payload
    if (req.method !== 'POST') {
      return new Response('Method Not Allowed', { status: 405 })
    }

    const payload: WebhookPayload = await req.json()

    // Only handle INSERT on support_messages
    if (payload.type !== 'INSERT' || payload.table !== 'support_messages') {
      return new Response('Ignored', { status: 200 })
    }

    const msg = payload.record
    const sb  = createClient(SUPABASE_URL, SERVICE_KEY)

    // Fetch the ticket (subject + user_id)
    const { data: ticket, error: tErr } = await sb
      .from('support_tickets')
      .select('id, subject, user_id')
      .eq('id', msg.ticket_id)
      .single()

    if (tErr || !ticket) {
      console.error('Ticket not found:', tErr?.message)
      return new Response('Ticket not found', { status: 500 })
    }

    const { subject, user_id } = ticket as TicketRow

    if (msg.sender === 'user') {
      // Get user email via admin API
      const { data: userData, error: uErr } = await sb.auth.admin.getUserById(user_id)
      if (uErr || !userData?.user?.email) {
        console.error('User not found:', uErr?.message)
        return new Response('User not found', { status: 500 })
      }
      const userEmail = userData.user.email

      await sendEmail(
        ADMIN_EMAIL,
        `Новое обращение: ${subject}`,
        adminNotificationHtml(userEmail, subject, msg.message),
      )
    } else if (msg.sender === 'admin') {
      // Get user email to send them the reply
      const { data: userData, error: uErr } = await sb.auth.admin.getUserById(user_id)
      if (uErr || !userData?.user?.email) {
        console.error('User not found:', uErr?.message)
        return new Response('User not found', { status: 500 })
      }
      const userEmail = userData.user.email

      await sendEmail(
        userEmail,
        `Ответ на ваше обращение: ${subject}`,
        userNotificationHtml(subject, msg.message),
      )
    }

    return new Response(JSON.stringify({ ok: true }), {
      status:  200,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('notify-support error:', message)
    return new Response(JSON.stringify({ error: message }), {
      status:  500,
      headers: { 'Content-Type': 'application/json' },
    })
  }
})
