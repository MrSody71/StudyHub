-- ── Support / Helpdesk ───────────────────────────────────────────────────────
-- Run this script once to set up the support feature.
-- Safe to re-run: uses IF NOT EXISTS / OR REPLACE.

-- ── Tables ───────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_tickets (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject    text        NOT NULL,
  status     text        NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS support_messages (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid        NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
  sender     text        NOT NULL CHECK (sender IN ('user', 'admin')),
  message    text        NOT NULL,
  is_read    boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS support_tickets_user_idx    ON support_tickets  (user_id);
CREATE INDEX IF NOT EXISTS support_messages_ticket_idx ON support_messages (ticket_id);

-- ── Trigger: auto-update ticket.updated_at on new message ─────────────────────

CREATE OR REPLACE FUNCTION _support_touch_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE support_tickets SET updated_at = now() WHERE id = NEW.ticket_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_message_touch ON support_messages;
CREATE TRIGGER support_message_touch
  AFTER INSERT ON support_messages
  FOR EACH ROW EXECUTE FUNCTION _support_touch_ticket();

-- ── RLS ───────────────────────────────────────────────────────────────────────

ALTER TABLE support_tickets  ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;

-- Drop old policies in case of re-run
DROP POLICY IF EXISTS "support_tickets_select"       ON support_tickets;
DROP POLICY IF EXISTS "support_tickets_insert"       ON support_tickets;
DROP POLICY IF EXISTS "support_tickets_update_admin" ON support_tickets;
DROP POLICY IF EXISTS "support_messages_select"      ON support_messages;
DROP POLICY IF EXISTS "support_messages_insert_user" ON support_messages;
DROP POLICY IF EXISTS "support_messages_insert_admin" ON support_messages;
DROP POLICY IF EXISTS "support_messages_update_read" ON support_messages;

-- Tickets: user sees own; admin sees all
CREATE POLICY "support_tickets_select" ON support_tickets
  FOR SELECT USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Tickets: user creates own
CREATE POLICY "support_tickets_insert" ON support_tickets
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Tickets: admin changes status
CREATE POLICY "support_tickets_update_admin" ON support_tickets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Messages: user sees own-ticket messages; admin sees all
CREATE POLICY "support_messages_select" ON support_messages
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Messages: user inserts with sender='user' for own tickets
CREATE POLICY "support_messages_insert_user" ON support_messages
  FOR INSERT WITH CHECK (
    sender = 'user'
    AND EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = auth.uid())
  );

-- Messages: admin inserts with sender='admin'
CREATE POLICY "support_messages_insert_admin" ON support_messages
  FOR INSERT WITH CHECK (
    sender = 'admin'
    AND EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Messages: mark as read (user for own-ticket messages, admin for all)
CREATE POLICY "support_messages_update_read" ON support_messages
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM support_tickets WHERE id = ticket_id AND user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- ── SECURITY DEFINER RPC — admin: all tickets with email + unread count ────────

CREATE OR REPLACE FUNCTION get_support_tickets_for_admin()
RETURNS TABLE (
  id         uuid,
  user_id    uuid,
  email      text,
  subject    text,
  status     text,
  created_at timestamptz,
  updated_at timestamptz,
  unread     bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.user_id,
    u.email::text,
    t.subject,
    t.status,
    t.created_at,
    t.updated_at,
    COUNT(m.id) FILTER (WHERE NOT m.is_read AND m.sender = 'user') AS unread
  FROM support_tickets t
  JOIN auth.users u ON u.id = t.user_id
  LEFT JOIN support_messages m ON m.ticket_id = t.id
  WHERE EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  GROUP BY t.id, t.user_id, u.email, t.subject, t.status, t.created_at, t.updated_at
  ORDER BY t.updated_at DESC;
$$;
