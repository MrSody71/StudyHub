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

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
}

export default function SupportView({ onUnreadChange, onClose }: Props) {
  const { userProfile } = useAuth()
  const isAdmin = userProfile?.role === 'admin'

  const [tickets, setTickets]               = useState<SupportTicket[]>([])
  const [selectedTicket, setSelectedTicket] = useState<SupportTicket | null>(null)
  const [messages, setMessages]             = useState<SupportMessage[]>([])
  const [statusFilter, setStatusFilter]     = useState<TicketStatus | 'all'>('all')
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [loadingMsgs, setLoadingMsgs]       = useState(false)
  const [globalError, setGlobalError]       = useState<string | null>(null)
  const [formError, setFormError]           = useState<string | null>(null)
  const [reply, setReply]                   = useState('')
  const [sending, setSending]               = useState(false)
  const [showNewForm, setShowNewForm]       = useState(false)
  const [newSubject, setNewSubject]         = useState('')
  const [newMessage, setNewMessage]         = useState('')
  const [creating, setCreating]             = useState(false)

  const pollFnRef   = useRef<() => Promise<void>>(async () => {})
  const messagesEnd = useRef<HTMLDivElement | null>(null)
  const replyRef    = useRef<HTMLTextAreaElement | null>(null)

  // ── Tickets ────────────────────────────────────────────────────────────────

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
        setTickets((data as SupportTicket[]) ?? [])
        const { count } = await sb
          .from('support_messages')
          .select('id', { count: 'exact', head: true })
          .eq('sender', 'admin')
          .eq('is_read', false)
        onUnreadChange(count ?? 0)
      }
    }
    setLoadingTickets(false)
  }, [isAdmin, onUnreadChange])

  useEffect(() => { void loadTickets() }, [loadTickets])

  // ── Messages ───────────────────────────────────────────────────────────────

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
    if (!selectedTicket) { setMessages([]); return }
    setLoadingMsgs(true)
    loadMessages(selectedTicket.id).then(async () => {
      setLoadingMsgs(false)
      await markRead(selectedTicket.id)
      void loadTickets()
      // focus reply input
      setTimeout(() => replyRef.current?.focus(), 50)
    })
  }, [selectedTicket]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Polling ────────────────────────────────────────────────────────────────

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

  // ── Create ticket ──────────────────────────────────────────────────────────

  async function handleCreateTicket() {
    if (!newSubject.trim() || !newMessage.trim()) return
    const sb = getSupabase()
    if (!sb || !userProfile) return
    setCreating(true)
    setFormError(null)
    try {
      const { data: ticket, error: tErr } = await sb
        .from('support_tickets')
        .insert({ user_id: userProfile.id, subject: newSubject.trim() })
        .select()
        .single()
      if (tErr) throw tErr
      const { error: mErr } = await sb.from('support_messages').insert({
        ticket_id: (ticket as SupportTicket).id,
        sender:    'user',
        message:   newMessage.trim(),
      })
      if (mErr) throw mErr
      setShowNewForm(false)
      setNewSubject('')
      setNewMessage('')
      await loadTickets()
      setSelectedTicket(ticket as SupportTicket)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e))
    }
    setCreating(false)
  }

  // ── Send reply ─────────────────────────────────────────────────────────────

  async function handleSendReply() {
    const text = reply.trim()
    if (!text || !selectedTicket || !userProfile) return
    const sb = getSupabase()
    if (!sb) return
    setSending(true)
    setReply('')
    const { error } = await sb.from('support_messages').insert({
      ticket_id: selectedTicket.id,
      sender:    isAdmin ? 'admin' : 'user',
      message:   text,
    })
    if (error) {
      setReply(text) // restore on failure
    } else {
      await loadMessages(selectedTicket.id)
      void loadTickets()
    }
    setSending(false)
    replyRef.current?.focus()
  }

  // ── Change status ──────────────────────────────────────────────────────────

  async function handleStatusChange(ticketId: string, status: TicketStatus) {
    const sb = getSupabase()
    if (!sb) return
    const { error } = await sb.from('support_tickets').update({ status }).eq('id', ticketId)
    if (!error) {
      setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, status } : t))
      setSelectedTicket((prev) => prev?.id === ticketId ? { ...prev, status } : prev)
    }
  }

  // ── Filtered tickets ───────────────────────────────────────────────────────

  const filtered = statusFilter === 'all'
    ? tickets
    : tickets.filter((t) => t.status === statusFilter)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="support-widget">

      {/* ── Panel header ─────────────────────────────────────────────────── */}
      <div className="support-widget-header">
        {(selectedTicket || showNewForm) ? (
          <button className="support-widget-back btn btn-ghost btn-sm" onClick={() => {
            setSelectedTicket(null)
            setReply('')
            setShowNewForm(false)
            setFormError(null)
          }}>
            ←
          </button>
        ) : (
          <span className="support-widget-icon">💬</span>
        )}

        <span className="support-widget-title">
          {selectedTicket ? selectedTicket.subject : showNewForm ? 'Новое обращение' : 'Поддержка'}
        </span>

        {/* New ticket button — visible for users on ticket list */}
        {!isAdmin && !selectedTicket && !showNewForm && (
          <button
            className="btn btn-primary btn-sm"
            style={{ flexShrink: 0 }}
            onClick={() => { setFormError(null); setNewSubject(''); setNewMessage(''); setShowNewForm(true) }}
          >
            + Обращение
          </button>
        )}

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

      {/* ── New ticket inline form ────────────────────────────────────────── */}
      {!selectedTicket && showNewForm && (
        <div className="support-new-form">
          <input
            className="input"
            placeholder="Тема обращения"
            value={newSubject}
            onChange={(e) => setNewSubject(e.target.value)}
            autoFocus
          />
          <textarea
            className="input support-new-message"
            placeholder="Опишите вашу проблему…"
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
          />
          {formError && <p className="support-form-error">{formError}</p>}
          <div className="support-new-actions">
            <button className="btn btn-secondary btn-sm" onClick={() => { setShowNewForm(false); setFormError(null) }}>Отмена</button>
            <button
              className="btn btn-primary btn-sm"
              onClick={() => void handleCreateTicket()}
              disabled={creating || !newSubject.trim() || !newMessage.trim()}
            >
              {creating ? 'Отправка…' : 'Отправить'}
            </button>
          </div>
        </div>
      )}

      {/* ── Ticket list ───────────────────────────────────────────────────── */}
      {!selectedTicket && !showNewForm && (
        <div className="support-widget-list">
          {/* Error / no supabase */}
          {globalError && (
            <p className="support-widget-hint" style={{ color: 'var(--danger)' }}>{globalError}</p>
          )}

          {/* Admin filter tabs */}
          {isAdmin && !globalError && (
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
            <p className="support-widget-hint">
              {globalError ? '' : isAdmin ? 'Нет обращений' : 'Обращений нет'}
            </p>
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
                  {isAdmin && ticket.email && (
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

      {/* ── Chat ──────────────────────────────────────────────────────────── */}
      {selectedTicket && (
        <>
          {isAdmin && selectedTicket.email && (
            <div className="support-chat-email-bar">{selectedTicket.email}</div>
          )}

          <div className="support-widget-messages">
            {loadingMsgs ? (
              <p className="support-widget-hint">Загрузка…</p>
            ) : messages.length === 0 ? (
              <p className="support-widget-hint">Нет сообщений</p>
            ) : (
              messages.map((msg) => {
                const mine   = isAdmin ? msg.sender === 'admin' : msg.sender === 'user'
                const isNew  = !msg.is_read && !mine
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

          {selectedTicket.status !== 'closed' ? (
            <div className="support-reply-bar">
              <textarea
                ref={replyRef}
                className="support-reply-input"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Сообщение… (Enter — отправить)"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendReply() }
                }}
              />
              <button
                className="support-send-btn"
                onClick={() => void handleSendReply()}
                disabled={sending || !reply.trim()}
                aria-label="Отправить"
              >
                {sending ? '…' : '➤'}
              </button>
            </div>
          ) : (
            <div className="support-closed-notice">Обращение закрыто</div>
          )}
        </>
      )}

    </div>
  )
}
