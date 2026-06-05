-- ============================================================
--  StudyHub — Supabase schema
--  Run this entire script in Supabase → SQL Editor → New query
-- ============================================================

-- ── semesters ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS semesters (
  user_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id         bigint  NOT NULL,
  name       text    NOT NULL,
  start_date text,
  end_date   text,
  is_active  boolean NOT NULL DEFAULT false,
  is_deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE semesters ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS semesters_uid_id ON semesters (user_id, id);
CREATE POLICY "semesters: own rows" ON semesters
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── subjects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
  user_id          uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id               bigint NOT NULL,
  semester_id      bigint,
  name             text   NOT NULL,
  color            text   NOT NULL DEFAULT '#4f46e5',
  description      text,
  is_archived      boolean NOT NULL DEFAULT false,
  moodle_course_id text,
  is_deleted       boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE subjects ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS subjects_uid_id ON subjects (user_id, id);
CREATE POLICY "subjects: own rows" ON subjects
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── tasks ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tasks (
  user_id              uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                   bigint NOT NULL,
  subject_id           bigint NOT NULL,
  title                text   NOT NULL,
  description          text,
  status               text   NOT NULL DEFAULT 'not_started'
                       CHECK (status IN ('not_started','in_progress','done')),
  priority             text   NOT NULL DEFAULT 'medium'
                       CHECK (priority IN ('low','medium','high')),
  due_date             text,
  recurrence_rule      text,
  recurrence_parent_id bigint,
  moodle_assignment_id text,
  is_deleted           boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS tasks_uid_id ON tasks (user_id, id);
CREATE POLICY "tasks: own rows" ON tasks
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── subtasks ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subtasks (
  user_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id         bigint  NOT NULL,
  task_id    bigint  NOT NULL,
  title      text    NOT NULL,
  is_done    boolean NOT NULL DEFAULT false,
  sort_order integer NOT NULL DEFAULT 0,
  is_deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE subtasks ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS subtasks_uid_id ON subtasks (user_id, id);
CREATE POLICY "subtasks: own rows" ON subtasks
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── tags ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tags (
  user_id    uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id         bigint NOT NULL,
  name       text   NOT NULL,
  color      text   NOT NULL DEFAULT '#6366f1',
  is_deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS tags_uid_id ON tags (user_id, id);
CREATE POLICY "tags: own rows" ON tags
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── task_tags ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_tags (
  user_id    uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  task_id    bigint NOT NULL,
  tag_id     bigint NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, task_id, tag_id)
);
ALTER TABLE task_tags ENABLE ROW LEVEL SECURITY;
CREATE POLICY "task_tags: own rows" ON task_tags
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── attachments ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attachments (
  user_id              uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id                   bigint NOT NULL,
  task_id              bigint,
  subject_id           bigint,
  filename             text   NOT NULL,
  filepath             text   NOT NULL,
  size                 bigint NOT NULL DEFAULT 0,
  mime_type            text   NOT NULL DEFAULT 'application/octet-stream',
  is_folder            boolean NOT NULL DEFAULT false,
  parent_attachment_id bigint,
  moodle_file_url      text,
  storage_path         text,
  is_deleted           boolean NOT NULL DEFAULT false,
  updated_at           timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS attachments_uid_id ON attachments (user_id, id);
CREATE POLICY "attachments: own rows" ON attachments
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── grades ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS grades (
  user_id    uuid    NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id         bigint  NOT NULL,
  subject_id bigint  NOT NULL,
  title      text    NOT NULL,
  value      numeric NOT NULL,
  max_value  numeric NOT NULL DEFAULT 100,
  weight     numeric NOT NULL DEFAULT 1,
  date       text,
  is_deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE grades ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS grades_uid_id ON grades (user_id, id);
CREATE POLICY "grades: own rows" ON grades
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── notes ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notes (
  user_id    uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id         bigint NOT NULL,
  subject_id bigint NOT NULL,
  title      text   NOT NULL DEFAULT 'Без названия',
  content    text   NOT NULL DEFAULT '',
  is_deleted boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE notes ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS notes_uid_id ON notes (user_id, id);
CREATE POLICY "notes: own rows" ON notes
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── study_sessions ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_sessions (
  user_id          uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id               bigint NOT NULL,
  subject_id       bigint,
  task_id          bigint,
  type             text   NOT NULL DEFAULT 'pomodoro'
                   CHECK (type IN ('pomodoro','short_break','long_break','manual')),
  duration_seconds integer NOT NULL DEFAULT 0,
  started_at       text   NOT NULL,
  ended_at         text,
  is_deleted       boolean NOT NULL DEFAULT false,
  updated_at       timestamptz NOT NULL DEFAULT now(),
  created_at       timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE study_sessions ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS study_sessions_uid_id ON study_sessions (user_id, id);
CREATE POLICY "study_sessions: own rows" ON study_sessions
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── schedule_entries ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS schedule_entries (
  user_id     uuid   NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  id          bigint NOT NULL,
  subject_id  bigint,
  title       text   NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  start_time  text   NOT NULL,
  end_time    text   NOT NULL,
  location    text,
  teacher     text,
  entry_date  text,
  is_deleted  boolean NOT NULL DEFAULT false,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);
ALTER TABLE schedule_entries ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX IF NOT EXISTS schedule_entries_uid_id ON schedule_entries (user_id, id);
CREATE POLICY "schedule_entries: own rows" ON schedule_entries
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
