-- =============================================================================
-- StudyHub — Supabase PostgreSQL schema
-- =============================================================================
-- Таблицы зеркалируют локальную SQLite-базу приложения.
-- Каждая строка привязана к пользователю через user_id (auth.users).
-- RLS гарантирует, что пользователь видит только свои данные.
-- updated_at проставляется автоматически через триггер — используется
-- для разрешения конфликтов при будущей синхронизации.
-- =============================================================================

-- ── Вспомогательная функция: автоматически обновляет updated_at ──────────────
create or replace function handle_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;


-- =============================================================================
-- semesters
-- =============================================================================
create table if not exists semesters (
  id         bigint generated always as identity primary key,
  user_id    uuid        not null references auth.users on delete cascade,
  name       text        not null,
  start_date date,
  end_date   date,
  is_active  boolean     not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_semesters_user on semesters(user_id);

alter table semesters enable row level security;

create policy "semesters: select own" on semesters
  for select using (user_id = auth.uid());
create policy "semesters: insert own" on semesters
  for insert with check (user_id = auth.uid());
create policy "semesters: update own" on semesters
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "semesters: delete own" on semesters
  for delete using (user_id = auth.uid());

create trigger set_semesters_updated_at
  before update on semesters
  for each row execute function handle_updated_at();


-- =============================================================================
-- subjects
-- =============================================================================
create table if not exists subjects (
  id          bigint      generated always as identity primary key,
  user_id     uuid        not null references auth.users  on delete cascade,
  semester_id bigint      references semesters(id) on delete set null,
  name        text        not null,
  color       text        not null default '#4f46e5',
  description text,
  is_archived boolean     not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_subjects_user     on subjects(user_id);
create index if not exists idx_subjects_semester on subjects(semester_id);
create index if not exists idx_subjects_archived on subjects(is_archived);

alter table subjects enable row level security;

create policy "subjects: select own" on subjects
  for select using (user_id = auth.uid());
create policy "subjects: insert own" on subjects
  for insert with check (user_id = auth.uid());
create policy "subjects: update own" on subjects
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subjects: delete own" on subjects
  for delete using (user_id = auth.uid());

create trigger set_subjects_updated_at
  before update on subjects
  for each row execute function handle_updated_at();


-- =============================================================================
-- tasks
-- =============================================================================
create table if not exists tasks (
  id                   bigint      generated always as identity primary key,
  user_id              uuid        not null references auth.users on delete cascade,
  subject_id           bigint      not null references subjects(id) on delete cascade,
  title                text        not null,
  description          text,
  status               text        not null default 'not_started'
                       check (status in ('not_started', 'in_progress', 'done')),
  priority             text        not null default 'medium'
                       check (priority in ('low', 'medium', 'high')),
  due_date             date,
  recurrence_rule      text,
  recurrence_parent_id bigint      references tasks(id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_tasks_user     on tasks(user_id);
create index if not exists idx_tasks_subject  on tasks(subject_id);
create index if not exists idx_tasks_due_date on tasks(due_date);
create index if not exists idx_tasks_status   on tasks(status);

alter table tasks enable row level security;

create policy "tasks: select own" on tasks
  for select using (user_id = auth.uid());
create policy "tasks: insert own" on tasks
  for insert with check (user_id = auth.uid());
create policy "tasks: update own" on tasks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tasks: delete own" on tasks
  for delete using (user_id = auth.uid());

create trigger set_tasks_updated_at
  before update on tasks
  for each row execute function handle_updated_at();


-- =============================================================================
-- subtasks
-- =============================================================================
create table if not exists subtasks (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users on delete cascade,
  task_id    bigint      not null references tasks(id)  on delete cascade,
  title      text        not null,
  is_done    boolean     not null default false,
  sort_order integer     not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_subtasks_user on subtasks(user_id);
create index if not exists idx_subtasks_task on subtasks(task_id);

alter table subtasks enable row level security;

create policy "subtasks: select own" on subtasks
  for select using (user_id = auth.uid());
create policy "subtasks: insert own" on subtasks
  for insert with check (user_id = auth.uid());
create policy "subtasks: update own" on subtasks
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "subtasks: delete own" on subtasks
  for delete using (user_id = auth.uid());

create trigger set_subtasks_updated_at
  before update on subtasks
  for each row execute function handle_updated_at();


-- =============================================================================
-- tags
-- =============================================================================
-- Теги уникальны по имени в пределах одного пользователя.
create table if not exists tags (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users on delete cascade,
  name       text        not null,
  color      text        not null default '#6366f1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, name)
);

create index if not exists idx_tags_user on tags(user_id);

alter table tags enable row level security;

create policy "tags: select own" on tags
  for select using (user_id = auth.uid());
create policy "tags: insert own" on tags
  for insert with check (user_id = auth.uid());
create policy "tags: update own" on tags
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "tags: delete own" on tags
  for delete using (user_id = auth.uid());

create trigger set_tags_updated_at
  before update on tags
  for each row execute function handle_updated_at();


-- =============================================================================
-- task_tags  (таблица связи многие-ко-многим)
-- =============================================================================
create table if not exists task_tags (
  user_id    uuid        not null references auth.users on delete cascade,
  task_id    bigint      not null references tasks(id)  on delete cascade,
  tag_id     bigint      not null references tags(id)   on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (task_id, tag_id)
);

create index if not exists idx_task_tags_user on task_tags(user_id);
create index if not exists idx_task_tags_tag  on task_tags(tag_id);

alter table task_tags enable row level security;

create policy "task_tags: select own" on task_tags
  for select using (user_id = auth.uid());
create policy "task_tags: insert own" on task_tags
  for insert with check (user_id = auth.uid());
create policy "task_tags: update own" on task_tags
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "task_tags: delete own" on task_tags
  for delete using (user_id = auth.uid());

create trigger set_task_tags_updated_at
  before update on task_tags
  for each row execute function handle_updated_at();


-- =============================================================================
-- attachments  (только метаданные; байты файлов не хранятся в облаке)
-- =============================================================================
create table if not exists attachments (
  id                   bigint      generated always as identity primary key,
  user_id              uuid        not null references auth.users   on delete cascade,
  task_id              bigint      not null references tasks(id)    on delete cascade,
  filename             text        not null,
  filepath             text        not null,  -- локальный путь на устройстве
  size                 bigint      not null default 0,
  mime_type            text        not null default 'application/octet-stream',
  is_folder            boolean     not null default false,
  parent_attachment_id bigint      references attachments(id) on delete cascade,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index if not exists idx_attachments_user   on attachments(user_id);
create index if not exists idx_attachments_task   on attachments(task_id);
create index if not exists idx_attachments_parent on attachments(parent_attachment_id);

alter table attachments enable row level security;

create policy "attachments: select own" on attachments
  for select using (user_id = auth.uid());
create policy "attachments: insert own" on attachments
  for insert with check (user_id = auth.uid());
create policy "attachments: update own" on attachments
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "attachments: delete own" on attachments
  for delete using (user_id = auth.uid());

create trigger set_attachments_updated_at
  before update on attachments
  for each row execute function handle_updated_at();


-- =============================================================================
-- grades
-- =============================================================================
create table if not exists grades (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users   on delete cascade,
  subject_id bigint      not null references subjects(id) on delete cascade,
  title      text        not null,
  value      numeric     not null,
  max_value  numeric     not null default 100,
  weight     numeric     not null default 1,
  date       date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_grades_user    on grades(user_id);
create index if not exists idx_grades_subject on grades(subject_id);

alter table grades enable row level security;

create policy "grades: select own" on grades
  for select using (user_id = auth.uid());
create policy "grades: insert own" on grades
  for insert with check (user_id = auth.uid());
create policy "grades: update own" on grades
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "grades: delete own" on grades
  for delete using (user_id = auth.uid());

create trigger set_grades_updated_at
  before update on grades
  for each row execute function handle_updated_at();


-- =============================================================================
-- notes
-- =============================================================================
create table if not exists notes (
  id         bigint      generated always as identity primary key,
  user_id    uuid        not null references auth.users   on delete cascade,
  subject_id bigint      not null references subjects(id) on delete cascade,
  title      text        not null default 'Без названия',
  content    text        not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notes_user    on notes(user_id);
create index if not exists idx_notes_subject on notes(subject_id);
create index if not exists idx_notes_updated on notes(updated_at);

alter table notes enable row level security;

create policy "notes: select own" on notes
  for select using (user_id = auth.uid());
create policy "notes: insert own" on notes
  for insert with check (user_id = auth.uid());
create policy "notes: update own" on notes
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "notes: delete own" on notes
  for delete using (user_id = auth.uid());

create trigger set_notes_updated_at
  before update on notes
  for each row execute function handle_updated_at();


-- =============================================================================
-- study_sessions
-- =============================================================================
create table if not exists study_sessions (
  id               bigint      generated always as identity primary key,
  user_id          uuid        not null references auth.users   on delete cascade,
  subject_id       bigint      references subjects(id) on delete set null,
  task_id          bigint      references tasks(id)    on delete set null,
  type             text        not null default 'pomodoro'
                   check (type in ('pomodoro', 'short_break', 'long_break', 'manual')),
  duration_seconds integer     not null default 0,
  started_at       timestamptz not null,
  ended_at         timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index if not exists idx_sessions_user    on study_sessions(user_id);
create index if not exists idx_sessions_subject on study_sessions(subject_id);
create index if not exists idx_sessions_started on study_sessions(started_at);

alter table study_sessions enable row level security;

create policy "study_sessions: select own" on study_sessions
  for select using (user_id = auth.uid());
create policy "study_sessions: insert own" on study_sessions
  for insert with check (user_id = auth.uid());
create policy "study_sessions: update own" on study_sessions
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "study_sessions: delete own" on study_sessions
  for delete using (user_id = auth.uid());

create trigger set_study_sessions_updated_at
  before update on study_sessions
  for each row execute function handle_updated_at();


-- =============================================================================
-- schedule_entries
-- =============================================================================
create table if not exists schedule_entries (
  id          bigint      generated always as identity primary key,
  user_id     uuid        not null references auth.users   on delete cascade,
  subject_id  bigint      references subjects(id) on delete set null,
  title       text        not null,
  day_of_week smallint    not null check (day_of_week between 0 and 6),
  start_time  time        not null,
  end_time    time        not null,
  location    text,
  teacher     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_schedule_user on schedule_entries(user_id);
create index if not exists idx_schedule_day  on schedule_entries(day_of_week);

alter table schedule_entries enable row level security;

create policy "schedule_entries: select own" on schedule_entries
  for select using (user_id = auth.uid());
create policy "schedule_entries: insert own" on schedule_entries
  for insert with check (user_id = auth.uid());
create policy "schedule_entries: update own" on schedule_entries
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "schedule_entries: delete own" on schedule_entries
  for delete using (user_id = auth.uid());

create trigger set_schedule_entries_updated_at
  before update on schedule_entries
  for each row execute function handle_updated_at();


-- =============================================================================
-- ИНСТРУКЦИЯ ПО ПРИМЕНЕНИЮ
-- =============================================================================
--
-- 1. Откройте Dashboard вашего Supabase-проекта:
--       https://supabase.com/dashboard/project/<your-project-ref>
--
-- 2. Перейдите в раздел:
--       SQL Editor  (левая панель → значок базы данных)
--
-- 3. Нажмите "+ New query" (или "+ New snippet").
--
-- 4. Вставьте содержимое этого файла в редактор (Ctrl+A, затем вставить).
--
-- 5. Нажмите кнопку "Run" (или Ctrl+Enter).
--
-- 6. Убедитесь, что в панели результатов нет ошибок.
--    Все 11 таблиц появятся в разделе Table Editor.
--
-- ℹ️  Скрипт идемпотентен: повторное выполнение безопасно
--    (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS).
--    CREATE POLICY и CREATE TRIGGER не имеют IF NOT EXISTS —
--    при повторном запуске они вернут ошибку "already exists",
--    которую можно проигнорировать, или предварительно выполнить DROP:
--
--       drop policy if exists "semesters: select own" on semesters;
--       -- (аналогично для каждой политики)
--
-- =============================================================================
