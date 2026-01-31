import path from 'node:path'
import { app } from 'electron'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

type DatabaseInstance = import('better-sqlite3').Database
type RunResult = import('better-sqlite3').RunResult

const SCHEMA_VERSION = 2
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
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT
        );

        CREATE TABLE IF NOT EXISTS transaction_categories (
          id INTEGER PRIMARY KEY,
          transaction_id INTEGER NOT NULL,
          category_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (transaction_id, category_id),
          FOREIGN KEY (transaction_id) REFERENCES transactions (id),
          FOREIGN KEY (category_id) REFERENCES categories (id)
        );

        CREATE INDEX IF NOT EXISTS idx_transactions_booking_date
          ON transactions (booking_date);
        CREATE INDEX IF NOT EXISTS idx_transaction_categories_tx
          ON transaction_categories (transaction_id);
        CREATE INDEX IF NOT EXISTS idx_transaction_categories_cat
          ON transaction_categories (category_id);
        CREATE INDEX IF NOT EXISTS idx_rules_priority
          ON rules (priority);

        INSERT INTO schema_migrations (version) VALUES (1);
      `)
    }

    if (currentVersion < 2) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS transaction_categories (
          id INTEGER PRIMARY KEY,
          transaction_id INTEGER NOT NULL,
          category_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (transaction_id, category_id),
          FOREIGN KEY (transaction_id) REFERENCES transactions (id),
          FOREIGN KEY (category_id) REFERENCES categories (id)
        );
      `)

      const columns = db.prepare(`PRAGMA table_info(transactions);`).all() as {
        name: string
      }[]
      const hasCategoryColumn = columns.some((col) => col.name === 'category_id')
      const tableExists = (name: string) =>
        db
          .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`)
          .get(name)

      if (hasCategoryColumn) {
        db.exec(`
          INSERT OR IGNORE INTO transaction_categories (transaction_id, category_id)
          SELECT id, category_id FROM transactions WHERE category_id IS NOT NULL;
        `)

        if (tableExists('transactions_old')) {
          db.exec(`DROP TABLE transactions_old;`)
        }

        db.exec(`ALTER TABLE transactions RENAME TO transactions_old;`)
        db.exec(`
          CREATE TABLE transactions (
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
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT
          );
        `)
        db.exec(`
          INSERT INTO transactions (
            id,
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
            raw_hash,
            created_at,
            updated_at
          )
          SELECT
            id,
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
            raw_hash,
            created_at,
            updated_at
          FROM transactions_old;
        `)
        db.exec(`DROP TABLE transactions_old;`)
      } else if (tableExists('transactions_old')) {
        db.exec(`
          INSERT OR IGNORE INTO transaction_categories (transaction_id, category_id)
          SELECT id, category_id FROM transactions_old WHERE category_id IS NOT NULL;
        `)
        db.exec(`
          INSERT INTO transactions (
            id,
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
            raw_hash,
            created_at,
            updated_at
          )
          SELECT
            id,
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
            raw_hash,
            created_at,
            updated_at
          FROM transactions_old;
        `)
        db.exec(`DROP TABLE transactions_old;`)
      }

      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_transactions_booking_date
          ON transactions (booking_date);
        CREATE INDEX IF NOT EXISTS idx_transaction_categories_tx
          ON transaction_categories (transaction_id);
        CREATE INDEX IF NOT EXISTS idx_transaction_categories_cat
          ON transaction_categories (category_id);
        INSERT INTO schema_migrations (version) VALUES (2);
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
  categoryCount: number
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
          t.id,
          t.booking_date as bookingDate,
          t.amount,
          t.currency,
          t.payee,
          t.purpose,
          (
            SELECT COUNT(1)
            FROM transaction_categories tc
            WHERE tc.transaction_id = t.id
          ) as categoryCount
        FROM transactions t
        ORDER BY booking_date DESC, id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(limit, offset) as TransactionRow[]

  return rows
}

export type UncategorizedTransactionRow = Omit<TransactionRow, 'categoryCount'> & {
  categoryCount: 0
}

export function listUncategorizedTransactions(filters: TransactionListFilters = {}) {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0

  const rows = db
    .prepare(
      `
        SELECT
          t.id,
          t.booking_date as bookingDate,
          t.amount,
          t.currency,
          t.payee,
          t.purpose,
          0 as categoryCount
        FROM transactions t
        LEFT JOIN transaction_categories tc
          ON tc.transaction_id = t.id
        WHERE tc.transaction_id IS NULL
        ORDER BY t.booking_date DESC, t.id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(limit, offset) as UncategorizedTransactionRow[]

  return rows
}

export function addTransactionCategory(transactionId: number, categoryId: number) {
  const db = initializeDatabase()
  const stmt = db.prepare(
    `INSERT INTO transaction_categories (transaction_id, category_id) VALUES (?, ?)`
  )

  try {
    stmt.run(transactionId, categoryId)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('UNIQUE constraint failed')) {
      return false
    }
    throw error
  }
}

export type CategorizedTransactionRow = TransactionRow & {
  categoryId: number
  categoryName: string
}

export function listCategorizedTransactions(filters: TransactionListFilters = {}) {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0

  const rows = db
    .prepare(
      `
        SELECT
          t.id,
          t.booking_date as bookingDate,
          t.amount,
          t.currency,
          t.payee,
          t.purpose,
          (
            SELECT COUNT(1)
            FROM transaction_categories tc2
            WHERE tc2.transaction_id = t.id
          ) as categoryCount,
          tc.category_id as categoryId,
          c.name as categoryName
        FROM transactions t
        INNER JOIN transaction_categories tc
          ON tc.transaction_id = t.id
        INNER JOIN categories c
          ON c.id = tc.category_id
        ORDER BY t.booking_date DESC, t.id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(limit, offset) as CategorizedTransactionRow[]

  return rows
}

export function removeTransactionCategory(transactionId: number, categoryId: number) {
  const db = initializeDatabase()
  const stmt = db.prepare(
    `DELETE FROM transaction_categories WHERE transaction_id = ? AND category_id = ?`
  )
  const result = stmt.run(transactionId, categoryId) as RunResult
  return result.changes > 0
}

export type CategoryRow = {
  id: number
  name: string
  color: string | null
  isActive: number
}

export function listCategories() {
  const db = initializeDatabase()
  const rows = db
    .prepare(
      `
        SELECT
          id,
          name,
          color,
          is_active as isActive
        FROM categories
        ORDER BY name ASC
      `
    )
    .all() as CategoryRow[]

  return rows
}

export function createCategory(name: string, color?: string | null) {
  const db = initializeDatabase()
  const stmt = db.prepare(
    `INSERT INTO categories (name, color) VALUES (?, ?)`
  )
  const result = stmt.run(name.trim(), color ?? null) as RunResult
  return result.lastInsertRowid as number
}

export function updateCategory(
  id: number,
  updates: { name?: string; color?: string | null; isActive?: number }
) {
  const db = initializeDatabase()
  const current = db
    .prepare(
      `
        SELECT name, color, is_active as isActive
        FROM categories
        WHERE id = ?
      `
    )
    .get(id) as { name: string; color: string | null; isActive: number } | undefined

  if (!current) {
    return false
  }

  const nextName = updates.name?.trim() ?? current.name
  const nextColor =
    updates.color !== undefined ? updates.color : current.color
  const nextIsActive =
    updates.isActive !== undefined ? updates.isActive : current.isActive

  db.prepare(
    `
      UPDATE categories
      SET name = ?, color = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `
  ).run(nextName, nextColor, nextIsActive, id)

  return true
}
