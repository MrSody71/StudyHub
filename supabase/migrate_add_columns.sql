-- ============================================================
--  StudyHub — add missing columns to existing Supabase tables
--  Run this in Supabase → SQL Editor → New query
--  Safe to run multiple times (ADD COLUMN IF NOT EXISTS).
-- ============================================================

ALTER TABLE semesters        ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE subjects         ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE tasks            ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE subtasks         ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE tags             ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE attachments      ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE grades           ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE notes            ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE study_sessions   ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;

ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS is_deleted boolean NOT NULL DEFAULT false;
ALTER TABLE schedule_entries ADD COLUMN IF NOT EXISTS entry_date text;

-- Refresh PostgREST schema cache so the new columns are visible immediately
NOTIFY pgrst, 'reload schema';
