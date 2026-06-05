-- ── Wallet tables ────────────────────────────────────────────────────────────
--
-- Run this in the Supabase SQL editor.
-- wallet_categories — income/expense categories per user (admin-only)
-- wallet_transactions — individual transactions (admin-only)
--
-- Access is restricted to users whose profiles.role = 'admin'.
-- The is_admin() helper from profiles.sql must already exist.

-- ── wallet_categories ─────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wallet_categories (
  id         BIGSERIAL PRIMARY KEY,
  user_id    UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT    NOT NULL,
  icon       TEXT    NOT NULL DEFAULT '💰',
  color      TEXT    NOT NULL DEFAULT '#6366f1',
  type       TEXT    NOT NULL DEFAULT 'expense' CHECK (type IN ('income','expense')),
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_deleted BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_categories ENABLE ROW LEVEL SECURITY;

-- Only the row owner AND only if that owner is an admin may read
CREATE POLICY "wallet_categories: admin read"
  ON public.wallet_categories FOR SELECT
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "wallet_categories: admin insert"
  ON public.wallet_categories FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "wallet_categories: admin update"
  ON public.wallet_categories FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ── wallet_transactions ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id          BIGSERIAL PRIMARY KEY,
  user_id     UUID    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category_id BIGINT  REFERENCES public.wallet_categories(id) ON DELETE SET NULL,
  amount      NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  type        TEXT    NOT NULL DEFAULT 'expense' CHECK (type IN ('income','expense')),
  note        TEXT,
  date        DATE    NOT NULL DEFAULT CURRENT_DATE,
  is_deleted  BOOLEAN NOT NULL DEFAULT false,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wallet_transactions: admin read"
  ON public.wallet_transactions FOR SELECT
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "wallet_transactions: admin insert"
  ON public.wallet_transactions FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

CREATE POLICY "wallet_transactions: admin update"
  ON public.wallet_transactions FOR UPDATE
  USING (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'admin'
    )
  );

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_wallet_categories_user   ON public.wallet_categories(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_user           ON public.wallet_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_date           ON public.wallet_transactions(date);
CREATE INDEX IF NOT EXISTS idx_wallet_tx_category       ON public.wallet_transactions(category_id);

-- ── Migration: drop old permissive policies if re-running ─────────────────────
-- Run these if you applied the previous version of this file:
--
--   DROP POLICY IF EXISTS "wallet_categories: own read"   ON public.wallet_categories;
--   DROP POLICY IF EXISTS "wallet_categories: own insert" ON public.wallet_categories;
--   DROP POLICY IF EXISTS "wallet_categories: own update" ON public.wallet_categories;
--   DROP POLICY IF EXISTS "wallet_transactions: own read"   ON public.wallet_transactions;
--   DROP POLICY IF EXISTS "wallet_transactions: own insert" ON public.wallet_transactions;
--   DROP POLICY IF EXISTS "wallet_transactions: own update" ON public.wallet_transactions;

-- ── Default categories (seeded per user on first login via app) ───────────────
-- The app seeds default categories client-side when wallet_categories is empty.
-- No server-side seeding needed.
