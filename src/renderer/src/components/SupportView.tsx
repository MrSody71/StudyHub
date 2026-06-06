import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { SupportTicket, SupportMessage, TicketStatus } from '../types'

interface Props {
  onUnreadChange: (n: number) => void
  onClose:        () => void
}

const STATUS_LABELS: Record<TicketStatus, string> = {
  open:        'Открыт',
  in_progress: 'В работе',
  closed:      'Закрыт',
}

const STATUS_COLORS: Record<TicketStatus, string> = {
  open:        'var(--accent)',
  in_progress: '#f59e0b',
  closed:      'var(--text-tertiary)',
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

export default function SupportView({ onUnreadChange, onClose }: Props) {
  const { userProfile } = useAuth()
  const isAdmin = userProfile?.role === 'admin'

  // ── Admin state ────────────────────────────────────────────────────────────
  const [tickets, setTickets]           = useState<SupportTicket[]>([])
  const [statusFilter, setStatusFilter] = useState<TicketStatus | 'all'>('all')
  const [loadingTickets, setLoadingTickets] = useState(true)

  // ── Chat state (both user and admin) ──────────────────────────────────────
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages]             = useState<SupportMessage[]>([])
  const [loadingMsgs, setLoadingMsgs]       = useState(false)
  const [reply, setReply]                   = useState('')
  const [sending, setSending]               = useState(false)
  const [sendError, setSendError]           = useState<string | null>(null)

  // ── Global error ───────────────────────────────────────────────────────────
  const [globalError, setGlobalError] = useState<string | null>(null)

  const pollFnRef   = useRef<() => Promise<void>>(async () => {})
  const messagesEnd = useRef<HTMLDivElement | null>(null)
  const replyRef    = useRef<HTMLTextAreaElement | null>(null)

  // ── Load tickets ──────────────────────────────────────────────────────────

  const loadTickets = useCallback(async () => {
    const sb = getSupabase()
    if (!sb) {
      setGlobalError('Поддержка доступна только в облачной версии (Supabase)')
      setLoadingTickets(false)
      return
    }
    setGlobalError(null)

    if (isAdmin) {
      const { data, error } = await sb.rpc('get_support_tickets_for_admin')
      if (error) { setGlobalError(error.message) }
      else {
        const rows = (data as SupportTicket[]) ?? []
        setTickets(rows)
        onUnreadChange(rows.reduce((s, t) => s + (t.unread ?? 0), 0))
      }
    } else {
      const { data, error } = await sb
        .from('support_tickets')
        .select('*')
        .order('updated_at', { ascending: false })
      if (error) { setGlobalError(error.message) }
      else {
        const rows = (data as SupportTicket[]) ?? []
        setTickets(rows)
        const { count } = await sb
          .from('support_messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender', 'admin')
          .eq('is_read', false)
        onUnreadChange(count ?? 0)

        // Auto-select the latest open ticket for regular users
        if (!selectedTicket) {
          const open = rows.find((t) => t.status !== 'closed')
          if (open) setSelectedTicket(open)
        }
      }
    }
    setLoadingTickets(false)
  }, [isAdmin, onUnreadChange, selectedTicket])

  useEffect(() => { void loadTickets() }, [isAdmin, onUnreadChange]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load messages ─────────────────────────────────────────────────────────

  const loadMessages = useCallback(async (ticketId: string) => {
    const sb = getSupabase()
    if (!sb) return
    const { data } = await sb
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true })
    if (data) setMessages(data as SupportMessage[])
  }, [])

  const markRead = useCallback(async (ticketId: string) => {
    const sb = getSupabase()
    if (!sb) return
    await sb.from('support_messages')
      .update({ is_read: true })
      .eq('ticket_id', ticketId)
      .eq('sender', isAdmin ? 'user' : 'admin')
      .eq('is_read', false)
  }, [isAdmin])

  useEffect(() => {
    setSendError(null)
    if (!selectedTicket) { setMessages([]); return }
    setLoadingMsgs(true)
    loadMessages(selectedTicket.id).then(async () => {
      setLoadingMsgs(false)
      await markRead(selectedTicket.id)
      void loadTickets()
      setTimeout(() => replyRef.current?.focus(), 50)
    })
  }, [selectedTicket]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Polling ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedTicket) return
    pollFnRef.current = async () => {
      await loadMessages(selectedTicket.id)
      await markRead(selectedTicket.id)
      void loadTickets()
    }
  }, [selectedTicket, loadMessages, markRead, loadTickets])

  useEffect(() => {
    if (!selectedTicket) return
    const id = setInterval(() => void pollFnRef.current(), 5000)
    return () => clearInterval(id)
  }, [selectedTicket?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message (creates ticket on first message for users) ───────────────

  async function handleSend() {
    const text = reply.trim()
    if (!text || sending) return
    setSendError(null)

    const sb = getSupabase()
    if (!sb) { setSendError('Поддержка доступна только в облачной версии'); return }
    if (!userProfile) { setSendError('Войдите в аккаунт'); return }

    setSending(true)
    setReply('')

    try {
      let ticket = selectedTicket

      // Create ticket automatically on first message
      if (!ticket) {
        const subject = text.length > 60 ? text.slice(0, 57) + '…' : text
        const { data, error } = await sb
          .from('support_tickets')
          .insert({ user_id: userProfile.id, subject })
          .select()
          .single()
        if (error) throw error
        ticket = data as SupportTicket
        setSelectedTicket(ticket)
      }

      const { error } = await sb.from('support_messages').insert({
        ticket_id: ticket.id,
        sender:    isAdmin ? 'admin' : 'user',
        message:   text,
      })
      if (error) throw error

      await loadMessages(ticket.id)
      void loadTickets()
    } catch (e: unknown) {
      setReply(text)
      setSendError(e instanceof Error ? e.message : String(e))
    }

    setSending(false)
    replyRef.current?.focus()
  }

  // ── Admin: change ticket status ────────────────────────────────────────────

  async function handleStatusChange(ticketId: string, status: TicketStatus) {
    const sb = getSupabase()
    if (!sb) return
    const { error } = await sb.from('support_tickets').update({ status }).eq('id', ticketId)
    if (!error) {
      setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, status } : t))
      setSelectedTicket((prev) => prev?.id === ticketId ? { ...prev, status } : prev)
    }
  }

  // ── Filtered tickets (admin) ───────────────────────────────────────────────

  const filtered = statusFilter === 'all'
    ? tickets
    : tickets.filter((t) => t.status === statusFilter)

  // ── Whether input should be disabled ──────────────────────────────────────

  const inputDisabled = selectedTicket?.status === 'closed'

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="support-widget">

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="support-widget-header">
        {isAdmin && selectedTicket ? (
          <button
            className="support-widget-back btn btn-ghost btn-sm"
            onClick={() => { setSelectedTicket(null); setReply('') }}
          >
            ←
          </button>
        ) : (
          <span className="support-widget-icon">💬</span>
        )}

        <span className="support-widget-title">
          {isAdmin && selectedTicket ? selectedTicket.subject : 'Поддержка'}
        </span>

        {/* Admin: ticket history button */}
        {!isAdmin && tickets.length > 1 && (
          <button
            className="btn btn-ghost btn-sm"
            style={{ flexShrink: 0, fontSize: 11 }}
            onClick={() => setSelectedTicket(null)}
            title="История обращений"
          >
            ☰
          </button>
        )}

        {/* Admin: status selector */}
        {isAdmin && selectedTicket && (
          <select
            className="support-status-select"
            value={selectedTicket.status}
            onChange={(e) => void handleStatusChange(selectedTicket.id, e.target.value as TicketStatus)}
          >
            <option value="open">Открыт</option>
            <option value="in_progress">В работе</option>
            <option value="closed">Закрыт</option>
          </select>
        )}

        <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ flexShrink: 0 }}>✕</button>
      </div>

      {/* ── Admin: ticket list ────────────────────────────────────────────── */}
      {isAdmin && !selectedTicket && (
        <div className="support-widget-list">
          {globalError && (
            <p className="support-widget-hint" style={{ color: 'var(--danger)' }}>{globalError}</p>
          )}

          {!globalError && (
            <div className="support-filter-tabs">
              {(['all', 'open', 'in_progress', 'closed'] as const).map((s) => (
                <button
                  key={s}
                  className={`support-filter-tab${statusFilter === s ? ' active' : ''}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === 'all' ? 'Все' : STATUS_LABELS[s as TicketStatus]}
                </button>
              ))}
            </div>
          )}

          {loadingTickets ? (
            <p className="support-widget-hint">Загрузка…</p>
          ) : filtered.length === 0 ? (
            <p className="support-widget-hint">{globalError ? '' : 'Нет обращений'}</p>
          ) : (
            <div className="support-ticket-list">
              {filtered.map((ticket) => (
                <button
                  key={ticket.id}
                  className="support-ticket-item"
                  onClick={() => { setSelectedTicket(ticket); setReply('') }}
                >
                  <div className="support-ticket-row">
                    <span className="support-ticket-subject">{ticket.subject}</span>
                    {(ticket.unread ?? 0) > 0 && (
                      <span className="support-ticket-unread">{ticket.unread}</span>
                    )}
                  </div>
                  {ticket.email && (
                    <div className="support-ticket-email">{ticket.email}</div>
                  )}
                  <div className="support-ticket-meta">
                    <span
                      className="support-status-chip"
                      style={{ color: STATUS_COLORS[ticket.status], borderColor: STATUS_COLORS[ticket.status] }}
                    >
                      {STATUS_LABELS[ticket.status]}
                    </span>
                    <span className="support-ticket-date">{fmtDate(ticket.updated_at)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── User: ticket history (when explicitly browsing) ───────────────── */}
      {!isAdmin && !selectedTicket && tickets.length > 0 && (
        <div className="support-widget-list">
          <p className="support-widget-hint" style={{ paddingBottom: 0 }}>История обращений</p>
          <div className="support-ticket-list">
            {tickets.map((ticket) => (
              <button
                key={ticket.id}
                className="support-ticket-item"
                onClick={() => { setSelectedTicket(ticket); setReply('') }}
              >
                <div className="support-ticket-row">
                  <span className="support-ticket-subject">{ticket.subject}</span>
                  {(ticket.unread ?? 0) > 0 && (
                    <span className="support-ticket-unread">{ticket.unread}</span>
                  )}
                </div>
                <div className="support-ticket-meta">
                  <span
                    className="support-status-chip"
                    style={{ color: STATUS_COLORS[ticket.status], borderColor: STATUS_COLORS[ticket.status] }}
                  >
                    {STATUS_LABELS[ticket.status]}
                  </span>
                  <span className="support-ticket-date">{fmtDate(ticket.updated_at)}</span>
                </div>
              </button>
            ))}
            <button
              className="support-new-chat-btn"
              onClick={() => setSelectedTicket(null)}
            >
              + Новое обращение
            </button>
          </div>
        </div>
      )}

      {/* ── Chat messages ────────────────────────────────────────────────── */}
      {(selectedTicket || !isAdmin) && (
        <div className="support-widget-messages">
          {loadingMsgs || loadingTickets ? (
            <p className="support-widget-hint">Загрузка…</p>
          ) : messages.length === 0 ? (
            <div className="support-empty-chat">
              <span style={{ fontSize: 32 }}>💬</span>
              <p>Напишите нам — мы ответим как можно скорее</p>
            </div>
          ) : (
            messages.map((msg) => {
              const mine  = isAdmin ? msg.sender === 'admin' : msg.sender === 'user'
              const isNew = !msg.is_read && !mine
              return (
                <div key={msg.id} className={`support-msg${mine ? ' mine' : ' theirs'}${isNew ? ' new' : ''}`}>
                  <div className="support-bubble">{msg.message}</div>
                  <div className="support-msg-time">{fmtTime(msg.created_at)}</div>
                </div>
              )
            })
          )}
          <div ref={messagesEnd} />
        </div>
      )}

      {/* ── Reply bar — always visible for users ─────────────────────────── */}
      {(selectedTicket || !isAdmin) && (
        <>
          {sendError && (
            <p style={{ margin: '0 12px 4px', fontSize: 12, color: 'var(--danger)' }}>{sendError}</p>
          )}

          {inputDisabled ? (
            <div className="support-closed-notice">Обращение закрыто</div>
          ) : (
            <div className="support-reply-bar">
              <textarea
                ref={replyRef}
                className="support-reply-input"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Сообщение… (Enter — отправить)"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSend() }
                }}
              />
              <button
                className="support-send-btn"
                onClick={() => void handleSend()}
                disabled={sending || !reply.trim()}
                aria-label="Отправить"
              >
                {sending ? '…' : '➤'}
              </button>
            </div>
          )}
        </>
      )}

    </div>
  )
}
