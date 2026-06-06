import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

serve(async (req) => {
  try {
    const payload = await req.json()
    const record = payload.record

    if (!record) {
      return new Response(JSON.stringify({ error: 'No record in payload' }), { status: 400 })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const resendKey  = Deno.env.get('RESEND_API_KEY')!
    const adminEmail = Deno.env.get('ADMIN_EMAIL')!

    // Получить тикет с профилем пользователя
    const { data: ticket, error: ticketError } = await supabase
      .from('support_tickets')
      .select('*, profiles(full_name)')
      .eq('id', record.ticket_id)
      .single()

    if (ticketError || !ticket) {
      console.error('Ticket not found:', ticketError?.message)
      return new Response(JSON.stringify({ error: 'Ticket not found' }), { status: 500 })
    }

    if (record.sender === 'user') {
      // Уведомить администратора о новом обращении
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'StudyHub <noreply@studyhb.ru>',
          to: adminEmail,
          subject: `Новое обращение: ${ticket.subject}`,
          html: `
            <h2>Новое обращение в поддержку</h2>
            <p><b>Тема:</b> ${ticket.subject}</p>
            <p><b>Сообщение:</b> ${record.message}</p>
            <p><a href="https://studyhb.ru">
              Ответить в панели администратора
            </a></p>
          `
        })
      })
      if (!res.ok) {
        const err = await res.text()
        console.error('Resend error (admin):', err)
        return new Response(JSON.stringify({ error: err }), { status: 500 })
      }

    } else if (record.sender === 'admin') {
      // Уведомить пользователя об ответе
      const { data: userData, error: userError } = await supabase.auth.admin.getUserById(ticket.user_id)
      if (userError || !userData?.user?.email) {
        console.error('User not found:', userError?.message)
        return new Response(JSON.stringify({ error: 'User not found' }), { status: 500 })
      }

      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${resendKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          from: 'StudyHub <noreply@studyhb.ru>',
          to: userData.user.email,
          subject: `Ответ на ваше обращение: ${ticket.subject}`,
          html: `
            <h2>Ответ на ваше обращение</h2>
            <p><b>Тема:</b> ${ticket.subject}</p>
            <p><b>Ответ:</b> ${record.message}</p>
            <p><a href="https://studyhb.ru">
              Открыть в приложении
            </a></p>
          `
        })
      })
      if (!res.ok) {
        const err = await res.text()
        console.error('Resend error (user):', err)
        return new Response(JSON.stringify({ error: err }), { status: 500 })
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    })

  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('notify-support error:', message)
    return new Response(JSON.stringify({ error: message }), { status: 500 })
  }
})
