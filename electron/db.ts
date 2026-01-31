import path from 'node:path'
import { app } from 'electron'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

type DatabaseInstance = import('better-sqlite3').Database
type RunResult = import('better-sqlite3').RunResult

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

export type TransactionInsert = {
  account?: string | null
  bookingDate: string
  valueDate?: string | null
  amount: number
  currency: string
  payee?: string | null
  purpose?: string | null
  iban?: string | null
  bic?: string | null
  reference?: string | null
  rawHash: string
}

export function insertImport(source: string, fileName: string) {
  const db = initializeDatabase()
  const stmt = db.prepare(
    `INSERT INTO imports (source, file_name) VALUES (?, ?)`
  )
  const result = stmt.run(source, fileName) as RunResult

  return result.lastInsertRowid as number
}

export function insertTransactions(rows: TransactionInsert[]) {
  const db = initializeDatabase()
  const insertStmt = db.prepare(`
    INSERT INTO transactions (
      account,
      booking_date,
      value_date,
      amount,
      currency,
      payee,
      purpose,
      iban,
      bic,
      reference,
      raw_hash
    ) VALUES (
      @account,
      @bookingDate,
      @valueDate,
      @amount,
      @currency,
      @payee,
      @purpose,
      @iban,
      @bic,
      @reference,
      @rawHash
    )
  `)

  let inserted = 0
  let skipped = 0

  const transaction = db.transaction((items: TransactionInsert[]) => {
    for (const item of items) {
      try {
        insertStmt.run(item)
        inserted += 1
      } catch (error) {
        const message = error instanceof Error ? error.message : ''
        if (message.includes('UNIQUE constraint failed: transactions.raw_hash')) {
          skipped += 1
          continue
        }

        throw error
      }
    }
  })

  transaction(rows)

  return { inserted, skipped }
}

export type TransactionRow = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
  categoryId: number | null
}

export type TransactionListFilters = {
  limit?: number
  offset?: number
}

export function listTransactions(filters: TransactionListFilters = {}) {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0

  const rows = db
    .prepare(
      `
        SELECT
          id,
          booking_date as bookingDate,
          amount,
          currency,
          payee,
          purpose,
          category_id as categoryId
        FROM transactions
        ORDER BY booking_date DESC, id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(limit, offset) as TransactionRow[]

  return rows
}
