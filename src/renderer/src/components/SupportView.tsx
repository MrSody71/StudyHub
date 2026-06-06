import { useState, useEffect, useRef, useCallback } from 'react'
import { getSupabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { SupportTicket, SupportMessage, TicketStatus } from '../types'

interface Props {
  onUnreadChange: (n: number) => void
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

export default function SupportView({ onUnreadChange }: Props) {
  const { userProfile } = useAuth()
  const isAdmin = userProfile?.role === 'admin'

  const [tickets, setTickets]                 = useState<SupportTicket[]>([])
  const [selectedTicket, setSelectedTicket]   = useState<SupportTicket | null>(null)
  const [messages, setMessages]               = useState<SupportMessage[]>([])
  const [statusFilter, setStatusFilter]       = useState<TicketStatus | 'all'>('all')
  const [loadingTickets, setLoadingTickets]   = useState(true)
  const [loadingMsgs, setLoadingMsgs]         = useState(false)
  const [globalError, setGlobalError]         = useState<string | null>(null)
  const [formError, setFormError]             = useState<string | null>(null)
  const [reply, setReply]                     = useState('')
  const [sending, setSending]                 = useState(false)
  const [showNewForm, setShowNewForm]         = useState(false)
  const [newSubject, setNewSubject]           = useState('')
  const [newMessage, setNewMessage]           = useState('')
  const [creating, setCreating]               = useState(false)
  const [mobileShowChat, setMobileShowChat]   = useState(false)

  const pollFnRef     = useRef<() => Promise<void>>(async () => {})
  const messagesEnd   = useRef<HTMLDivElement | null>(null)

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
        // count unread admin→user messages
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
    })
  }, [selectedTicket]) // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // ── Polling (5 s when chat is open) ───────────────────────────────────────

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
      setMobileShowChat(true)
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : String(e))
    }
    setCreating(false)
  }

  // ── Send reply ─────────────────────────────────────────────────────────────

  async function handleSendReply() {
    if (!reply.trim() || !selectedTicket || !userProfile) return
    const sb = getSupabase()
    if (!sb) return
    setSending(true)
    const { error } = await sb.from('support_messages').insert({
      ticket_id: selectedTicket.id,
      sender:    isAdmin ? 'admin' : 'user',
      message:   reply.trim(),
    })
    if (!error) {
      setReply('')
      await loadMessages(selectedTicket.id)
      void loadTickets()
    }
    setSending(false)
  }

  // ── Change ticket status (admin) ───────────────────────────────────────────

  async function handleStatusChange(ticketId: string, status: TicketStatus) {
    const sb = getSupabase()
    if (!sb) return
    const { error } = await sb
      .from('support_tickets')
      .update({ status })
      .eq('id', ticketId)
    if (!error) {
      setTickets((prev) => prev.map((t) => t.id === ticketId ? { ...t, status } : t))
      setSelectedTicket((prev) => prev?.id === ticketId ? { ...prev, status } : prev)
    }
  }

  // ── Select ticket ──────────────────────────────────────────────────────────

  function selectTicket(ticket: SupportTicket) {
    setSelectedTicket(ticket)
    setMobileShowChat(true)
    setReply('')
  }

  // ── Filtered list ──────────────────────────────────────────────────────────

  const filtered = statusFilter === 'all'
    ? tickets
    : tickets.filter((t) => t.status === statusFilter)

  // ── No Supabase ────────────────────────────────────────────────────────────

  if (globalError && tickets.length === 0 && !loadingTickets) {
    return (
      <div className="support-view">
        <div className="support-no-supabase">
          <span style={{ fontSize: 48 }}>☁️</span>
          <p>{globalError}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="support-view">

      {/* ── Ticket list panel ────────────────────────────────────────────── */}
      <div className={`support-list-panel${mobileShowChat ? ' support-mobile-hide' : ''}`}>
        <div className="support-list-header">
          <h2 className="support-title">Поддержка</h2>
          {!isAdmin && (
            <button className="btn btn-primary btn-sm" onClick={() => { setFormError(null); setShowNewForm(true) }}>
              + Обращение
            </button>
          )}
        </div>

        {isAdmin && (
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
          <p className="support-hint">Загрузка…</p>
        ) : filtered.length === 0 ? (
          <p className="support-hint">
            {isAdmin ? 'Нет обращений' : 'Обращений нет. Создайте первое!'}
          </p>
        ) : (
          <div className="support-ticket-list">
            {filtered.map((ticket) => (
              <button
                key={ticket.id}
                className={`support-ticket-item${selectedTicket?.id === ticket.id ? ' active' : ''}`}
                onClick={() => selectTicket(ticket)}
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

      {/* ── Chat panel ───────────────────────────────────────────────────── */}
      <div className={`support-chat-panel${!mobileShowChat ? ' support-mobile-hide' : ''}`}>
        {!selectedTicket ? (
          <div className="support-no-supabase">
            <span style={{ fontSize: 48 }}>💬</span>
            <p>Выберите обращение, чтобы открыть переписку</p>
          </div>
        ) : (
          <>
            <div className="support-chat-header">
              <button
                className="btn btn-ghost btn-sm support-back-btn"
                onClick={() => setMobileShowChat(false)}
              >
                ← Назад
              </button>
              <div className="support-chat-title">
                <span className="support-chat-subject">{selectedTicket.subject}</span>
                {isAdmin && selectedTicket.email && (
                  <span className="support-chat-email">{selectedTicket.email}</span>
                )}
              </div>
              {isAdmin && (
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
            </div>

            <div className="support-messages">
              {loadingMsgs ? (
                <p className="support-hint">Загрузка сообщений…</p>
              ) : messages.length === 0 ? (
                <p className="support-hint">Нет сообщений</p>
              ) : (
                messages.map((msg) => {
                  const mine = isAdmin ? msg.sender === 'admin' : msg.sender === 'user'
                  const newMsg = !msg.is_read && !mine
                  return (
                    <div key={msg.id} className={`support-msg${mine ? ' mine' : ' theirs'}${newMsg ? ' new' : ''}`}>
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
                  className="support-reply-input"
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  placeholder="Введите сообщение… (Enter — отправить, Shift+Enter — перенос)"
                  rows={2}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void handleSendReply() }
                  }}
                />
                <button
                  className="btn btn-primary"
                  onClick={() => void handleSendReply()}
                  disabled={sending || !reply.trim()}
                >
                  {sending ? '…' : 'Отправить'}
                </button>
              </div>
            ) : (
              <div className="support-closed-notice">Обращение закрыто</div>
            )}
          </>
        )}
      </div>

      {/* ── New ticket modal ─────────────────────────────────────────────── */}
      {showNewForm && (
        <div className="modal-overlay" onClick={() => setShowNewForm(false)}>
          <div className="modal" style={{ width: 480 }} onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">Новое обращение</span>
              <button className="btn btn-ghost btn-sm" onClick={() => setShowNewForm(false)}>✕</button>
            </div>
            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <input
                className="input"
                placeholder="Тема обращения"
                value={newSubject}
                onChange={(e) => setNewSubject(e.target.value)}
                autoFocus
              />
              <textarea
                className="input"
                placeholder="Опишите вашу проблему или вопрос…"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                rows={5}
                style={{ resize: 'vertical' }}
              />
              {formError && <p style={{ color: 'var(--danger)', fontSize: 13, margin: 0 }}>{formError}</p>}
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => setShowNewForm(false)}>Отмена</button>
              <button
                className="btn btn-primary"
                onClick={() => void handleCreateTicket()}
                disabled={creating || !newSubject.trim() || !newMessage.trim()}
              >
                {creating ? 'Отправка…' : 'Отправить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
