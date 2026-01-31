import path from 'node:path'
import { app } from 'electron'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

type DatabaseInstance = import('better-sqlite3').Database

const SCHEMA_VERSION = 1
let dbInstance: DatabaseInstance | null = null

function getDatabasePath() {
  return path.join(app.getPath('userData'), 'horus.db')
}

function getCurrentSchemaVersion(db: DatabaseInstance) {
  const row = db
    .prepare('SELECT MAX(version) AS version FROM schema_migrations')
    .get() as { version: number | null } | undefined

  return row?.version ?? 0
}

function applyMigrations(db: DatabaseInstance) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const currentVersion = getCurrentSchemaVersion(db)
  if (currentVersion >= SCHEMA_VERSION) {
    return
  }

  db.transaction(() => {
    if (currentVersion < 1) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS categories (
          id INTEGER PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          color TEXT,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS imports (
          id INTEGER PRIMARY KEY,
          source TEXT NOT NULL,
          file_name TEXT NOT NULL,
          imported_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS rules (
          id INTEGER PRIMARY KEY,
          matcher_type TEXT NOT NULL,
          matcher_value TEXT NOT NULL,
          category_id INTEGER NOT NULL,
          priority INTEGER NOT NULL DEFAULT 0,
          is_active INTEGER NOT NULL DEFAULT 1,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT,
          FOREIGN KEY (category_id) REFERENCES categories (id)
        );

        CREATE TABLE IF NOT EXISTS transactions (
          id INTEGER PRIMARY KEY,
          account TEXT,
          booking_date TEXT NOT NULL,
          value_date TEXT,
          amount REAL NOT NULL,
          currency TEXT NOT NULL,
          payee TEXT,
          purpose TEXT,
          iban TEXT,
          bic TEXT,
          reference TEXT,
          raw_hash TEXT NOT NULL UNIQUE,
          category_id INTEGER,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT,
          FOREIGN KEY (category_id) REFERENCES categories (id)
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_booking_date
          ON transactions (booking_date);
        CREATE INDEX IF NOT EXISTS idx_transactions_category_id
          ON transactions (category_id);
        CREATE INDEX IF NOT EXISTS idx_rules_priority
          ON rules (priority);

        INSERT INTO schema_migrations (version) VALUES (1);
      `)
    }
  })()
}

export function initializeDatabase() {
  if (dbInstance) {
    return dbInstance
  }

  const dbPath = getDatabasePath()
  const db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  applyMigrations(db)

  dbInstance = db
  return dbInstance
}

export function closeDatabase() {
  if (!dbInstance) {
    return
  }

  dbInstance.close()
  dbInstance = null
}

export function getDatabaseInfo() {
  const dbPath = getDatabasePath()
  const db = initializeDatabase()
  const schemaVersion = getCurrentSchemaVersion(db)

  return {
    path: dbPath,
    schemaVersion,
  }
}
