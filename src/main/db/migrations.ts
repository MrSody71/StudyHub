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
