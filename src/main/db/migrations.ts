import Database from 'better-sqlite3'

interface Migration {
  version: number
  up: (db: Database.Database) => void
}

// Add new migrations here — each gets a unique version number.
// Never modify existing migrations; always add a new one.
const migrations: Migration[] = [
  {
    version: 1,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS settings (
          key   TEXT PRIMARY KEY,
          value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS subjects (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          name        TEXT    NOT NULL,
          color       TEXT    NOT NULL DEFAULT '#4f46e5',
          description TEXT,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS tasks (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          title       TEXT    NOT NULL,
          description TEXT,
          status      TEXT    NOT NULL DEFAULT 'not_started'
                      CHECK (status IN ('not_started','in_progress','done')),
          priority    TEXT    NOT NULL DEFAULT 'medium'
                      CHECK (priority IN ('low','medium','high')),
          due_date    TEXT,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS attachments (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          filename   TEXT    NOT NULL,
          filepath   TEXT    NOT NULL,
          size       INTEGER NOT NULL DEFAULT 0,
          mime_type  TEXT    NOT NULL DEFAULT 'application/octet-stream',
          created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );

        INSERT OR IGNORE INTO settings (key, value) VALUES ('theme', 'light');
      `)
    }
  },
  {
    version: 2,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS subtasks (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          task_id    INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          title      TEXT    NOT NULL,
          is_done    INTEGER NOT NULL DEFAULT 0 CHECK (is_done IN (0, 1)),
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_subtasks_task_id ON subtasks(task_id);
      `)
    }
  },
  {
    version: 3,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT    NOT NULL UNIQUE,
          color      TEXT    NOT NULL DEFAULT '#6366f1',
          created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );

        CREATE TABLE IF NOT EXISTS task_tags (
          task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
          tag_id  INTEGER NOT NULL REFERENCES tags(id)  ON DELETE CASCADE,
          PRIMARY KEY (task_id, tag_id)
        );

        CREATE INDEX IF NOT EXISTS idx_task_tags_task_id ON task_tags(task_id);
        CREATE INDEX IF NOT EXISTS idx_task_tags_tag_id  ON task_tags(tag_id);
      `)
    }
  },
  {
    version: 4,
    up: (db) => {
      db.exec(`ALTER TABLE tasks ADD COLUMN recurrence_rule TEXT;`)
      db.exec(`ALTER TABLE tasks ADD COLUMN recurrence_parent_id INTEGER;`)
    }
  },
  {
    version: 5,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS schedule_entries (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_id  INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
          title       TEXT    NOT NULL,
          day_of_week INTEGER NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
          start_time  TEXT    NOT NULL,
          end_time    TEXT    NOT NULL,
          location    TEXT,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_schedule_day ON schedule_entries(day_of_week);
      `)
    }
  },
  {
    version: 6,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS study_sessions (
          id               INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_id       INTEGER REFERENCES subjects(id) ON DELETE SET NULL,
          task_id          INTEGER REFERENCES tasks(id)    ON DELETE SET NULL,
          type             TEXT    NOT NULL DEFAULT 'pomodoro'
                           CHECK (type IN ('pomodoro','short_break','long_break','manual')),
          duration_seconds INTEGER NOT NULL DEFAULT 0,
          started_at       TEXT    NOT NULL,
          ended_at         TEXT,
          created_at       TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_subject   ON study_sessions(subject_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_started   ON study_sessions(started_at);

        INSERT OR IGNORE INTO settings (key, value) VALUES ('pomodoro.work',       '25');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('pomodoro.shortBreak', '5');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('pomodoro.longBreak',  '15');
        INSERT OR IGNORE INTO settings (key, value) VALUES ('pomodoro.interval',   '4');
      `)
    }
  },
  {
    version: 7,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS grades (
          id          INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          title       TEXT    NOT NULL,
          value       REAL    NOT NULL,
          max_value   REAL    NOT NULL DEFAULT 100,
          weight      REAL    NOT NULL DEFAULT 1,
          date        TEXT,
          created_at  TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_grades_subject ON grades(subject_id);

        INSERT OR IGNORE INTO settings (key, value) VALUES ('grades.scale', '100');
      `)
    }
  },
  {
    version: 8,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS notes (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
          title      TEXT    NOT NULL DEFAULT 'Без названия',
          content    TEXT    NOT NULL DEFAULT '',
          updated_at TEXT    NOT NULL DEFAULT (datetime('now','localtime')),
          created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );
        CREATE INDEX IF NOT EXISTS idx_notes_subject ON notes(subject_id);
        CREATE INDEX IF NOT EXISTS idx_notes_updated ON notes(updated_at);
      `)
    }
  },
  {
    version: 9,
    up: (db) => {
      db.exec(`
        CREATE TABLE IF NOT EXISTS semesters (
          id         INTEGER PRIMARY KEY AUTOINCREMENT,
          name       TEXT    NOT NULL,
          start_date TEXT,
          end_date   TEXT,
          is_active  INTEGER NOT NULL DEFAULT 0 CHECK (is_active IN (0, 1)),
          created_at TEXT    NOT NULL DEFAULT (datetime('now','localtime'))
        );

        ALTER TABLE subjects ADD COLUMN semester_id INTEGER REFERENCES semesters(id) ON DELETE SET NULL;
        ALTER TABLE subjects ADD COLUMN is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0, 1));

        CREATE INDEX IF NOT EXISTS idx_subjects_semester  ON subjects(semester_id);
        CREATE INDEX IF NOT EXISTS idx_subjects_archived  ON subjects(is_archived);
      `)
    }
  },
  {
    version: 10,
    up: (db) => {
      db.exec(`
        ALTER TABLE attachments ADD COLUMN is_folder             INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE attachments ADD COLUMN parent_attachment_id  INTEGER
          REFERENCES attachments(id) ON DELETE CASCADE;

        CREATE INDEX IF NOT EXISTS idx_attachments_parent ON attachments(parent_attachment_id);
        CREATE INDEX IF NOT EXISTS idx_attachments_task   ON attachments(task_id);
      `)
    }
  }
]

export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (
      version INTEGER NOT NULL DEFAULT 0
    );
  `)

  const row = db
    .prepare('SELECT version FROM schema_version')
    .get() as { version: number } | undefined

  const currentVersion = row?.version ?? 0

  if (!row) {
    db.prepare('INSERT INTO schema_version (version) VALUES (0)').run()
  }

  // Sort ascending so dependencies are always created before dependents
  const pending = migrations
    .filter((m) => m.version > currentVersion)
    .sort((a, b) => a.version - b.version)

  for (const migration of pending) {
    const apply = db.transaction(() => {
      migration.up(db)
      db.prepare('UPDATE schema_version SET version = ?').run(migration.version)
    })
    apply()
    console.log(`[DB] Applied migration v${migration.version}`)
  }
}
