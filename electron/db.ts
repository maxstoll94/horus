import path from 'node:path'
import crypto from 'node:crypto'
import { app } from 'electron'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

type DatabaseInstance = import('better-sqlite3').Database
type RunResult = import('better-sqlite3').RunResult

const SCHEMA_VERSION = 22
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
          matcher_operator TEXT NOT NULL DEFAULT 'contains',
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

    if (currentVersion < 3) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_suggestions (
          id INTEGER PRIMARY KEY,
          transaction_id INTEGER NOT NULL,
          category_id INTEGER NOT NULL,
          confidence REAL NOT NULL,
          reason TEXT,
          model TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (transaction_id),
          FOREIGN KEY (transaction_id) REFERENCES transactions (id),
          FOREIGN KEY (category_id) REFERENCES categories (id)
        );

        CREATE INDEX IF NOT EXISTS idx_ai_suggestions_tx
          ON ai_suggestions (transaction_id);
        CREATE INDEX IF NOT EXISTS idx_ai_suggestions_cat
          ON ai_suggestions (category_id);

        INSERT INTO schema_migrations (version) VALUES (3);
      `)
    }

    if (currentVersion < 4) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_settings (
          id INTEGER PRIMARY KEY,
          model TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 0,
          confidence_threshold REAL NOT NULL DEFAULT 0.85,
          updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        INSERT INTO ai_settings (id, model, enabled, confidence_threshold)
        VALUES (1, 'gpt-4o-mini-2024-07-18', 0, 0.85)
        ON CONFLICT(id) DO NOTHING;

        INSERT INTO schema_migrations (version) VALUES (4);
      `)
    }

    if (currentVersion < 5) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_requests (
          id INTEGER PRIMARY KEY,
          model TEXT,
          request_payload TEXT,
          response_payload TEXT,
          status TEXT NOT NULL,
          error TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE INDEX IF NOT EXISTS idx_ai_requests_created
          ON ai_requests (created_at DESC);

        INSERT INTO schema_migrations (version) VALUES (5);
      `)
    }

    if (currentVersion < 6) {
      const columns = db.prepare(`PRAGMA table_info(ai_requests);`).all() as {
        name: string
      }[]
      const existing = new Set(columns.map((col) => col.name))
      const addColumn = (name: string, type: string) => {
        if (!existing.has(name)) {
          db.exec(`ALTER TABLE ai_requests ADD COLUMN ${name} ${type};`)
        }
      }

      addColumn('input_tokens', 'INTEGER')
      addColumn('output_tokens', 'INTEGER')
      addColumn('total_tokens', 'INTEGER')
      addColumn('cost_usd', 'REAL')

      db.exec(`INSERT INTO schema_migrations (version) VALUES (6);`)
    }

    if (currentVersion < 7) {
      const columns = db.prepare(`PRAGMA table_info(ai_settings);`).all() as {
        name: string
      }[]
      const existing = new Set(columns.map((col) => col.name))
      const addColumn = (name: string, type: string) => {
        if (!existing.has(name)) {
          db.exec(`ALTER TABLE ai_settings ADD COLUMN ${name} ${type};`)
        }
      }

      addColumn('input_cost_per_1m', 'REAL')
      addColumn('output_cost_per_1m', 'REAL')

      db.exec(`
        UPDATE ai_settings
        SET input_cost_per_1m = COALESCE(input_cost_per_1m, 0.15),
            output_cost_per_1m = COALESCE(output_cost_per_1m, 0.6)
        WHERE id = 1
      `)

      db.exec(`INSERT INTO schema_migrations (version) VALUES (7);`)
    }

    if (currentVersion < 8) {
      db.exec(`
        INSERT INTO categories (name, color)
        SELECT name, color
        FROM (
          SELECT 'Income' as name, '#2b4cff' as color UNION ALL
          SELECT 'Interest', '#6fd1ff' UNION ALL
          SELECT 'Investing', '#6fd1ff' UNION ALL
          SELECT 'Internal Transfer', '#9aa0a6' UNION ALL
          SELECT 'Coffee', '#c18b5f' UNION ALL
          SELECT 'Groceries', '#7ddc7d' UNION ALL
          SELECT 'Take Away', '#f2c14e' UNION ALL
          SELECT 'Fees', '#ff7a7a' UNION ALL
          SELECT 'Public Transport', '#8dd3c7' UNION ALL
          SELECT 'Car', '#a18bff' UNION ALL
          SELECT 'Hobby', '#ffb3c6' UNION ALL
          SELECT 'Healthcare', '#ff9f1c'
        )
        WHERE NOT EXISTS (SELECT 1 FROM categories);
      `)

      db.exec(`INSERT INTO schema_migrations (version) VALUES (8);`)
    }

    if (currentVersion < 9) {
      const columns = db.prepare(`PRAGMA table_info(rules);`).all() as {
        name: string
      }[]
      const existing = new Set(columns.map((col) => col.name))
      if (!existing.has('matcher_operator')) {
        db.exec(
          `ALTER TABLE rules ADD COLUMN matcher_operator TEXT NOT NULL DEFAULT 'contains';`
        )
      }
      db.exec(`INSERT INTO schema_migrations (version) VALUES (9);`)
    }

    if (currentVersion < 10) {
      const columns = db.prepare(`PRAGMA table_info(imports);`).all() as {
        name: string
      }[]
      const existing = new Set(columns.map((col) => col.name))
      if (!existing.has('file_hash')) {
        db.exec(`ALTER TABLE imports ADD COLUMN file_hash TEXT;`)
      }
      db.exec(
        `CREATE UNIQUE INDEX IF NOT EXISTS idx_imports_file_hash ON imports (file_hash);`
      )
      db.exec(`INSERT INTO schema_migrations (version) VALUES (10);`)
    }

    if (currentVersion < 11) {
      const catCols = db.prepare(`PRAGMA table_info(categories);`).all() as { name: string }[]
      const catExisting = new Set(catCols.map((col) => col.name))
      if (!catExisting.has('group_type')) {
        db.exec(`ALTER TABLE categories ADD COLUMN group_type TEXT NOT NULL DEFAULT 'variable_expense';`)
      }
      if (!catExisting.has('display_order')) {
        db.exec(`ALTER TABLE categories ADD COLUMN display_order INTEGER NOT NULL DEFAULT 0;`)
      }

      db.exec(`
        UPDATE categories SET group_type='income'   WHERE name IN ('Income','Interest') AND group_type='variable_expense';
        UPDATE categories SET group_type='savings'  WHERE name IN ('Investing') AND group_type='variable_expense';
        UPDATE categories SET group_type='transfer' WHERE name IN ('Internal Transfer') AND group_type='variable_expense';
      `)

      const txCols = db.prepare(`PRAGMA table_info(transactions);`).all() as { name: string }[]
      const txExisting = new Set(txCols.map((col) => col.name))
      if (!txExisting.has('source')) {
        db.exec(`ALTER TABLE transactions ADD COLUMN source TEXT NOT NULL DEFAULT 'import';`)
      }

      db.exec(`
        CREATE TABLE IF NOT EXISTS budgets (
          id INTEGER PRIMARY KEY,
          category_id INTEGER NOT NULL,
          year TEXT NOT NULL,
          cadence TEXT NOT NULL DEFAULT 'monthly',
          amount REAL NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT,
          UNIQUE(category_id, year),
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_budgets_year ON budgets(year);
        INSERT INTO schema_migrations (version) VALUES (11);
      `)
    }

    if (currentVersion < 12) {
      const catCols = db.prepare(`PRAGMA table_info(categories);`).all() as { name: string }[]
      const catExisting = new Set(catCols.map((col) => col.name))
      if (!catExisting.has('cadence')) {
        db.exec(`ALTER TABLE categories ADD COLUMN cadence TEXT NOT NULL DEFAULT 'monthly';`)
      }
      db.exec(`INSERT INTO schema_migrations (version) VALUES (12);`)
    }

    if (currentVersion < 13) {
      db.exec(`
        INSERT INTO categories (name, color, group_type)
        SELECT name, color, group_type FROM (
          SELECT 'Salary'           as name, '#4f46e5' as color, 'income'           as group_type UNION ALL
          SELECT 'Rent',                     '#6366f1',          'fixed_expense'                  UNION ALL
          SELECT 'Insurance',                '#8b5cf6',          'fixed_expense'                  UNION ALL
          SELECT 'Phone & Internet',         '#06b6d4',          'fixed_expense'                  UNION ALL
          SELECT 'Subscriptions',            '#f43f5e',          'fixed_expense'                  UNION ALL
          SELECT 'Gym',                      '#10b981',          'fixed_expense'                  UNION ALL
          SELECT 'Restaurants',              '#f59e0b',          'variable_expense'               UNION ALL
          SELECT 'Shopping',                 '#ec4899',          'variable_expense'               UNION ALL
          SELECT 'Travel',                   '#3b82f6',          'variable_expense'               UNION ALL
          SELECT 'Personal Care',            '#a78bfa',          'variable_expense'               UNION ALL
          SELECT 'Gifts & Donations',        '#ef4444',          'variable_expense'               UNION ALL
          SELECT 'Education',                '#84cc16',          'variable_expense'               UNION ALL
          SELECT 'Emergency Fund',           '#059669',          'savings'                        UNION ALL
          SELECT 'Pension',                  '#0891b2',          'savings'
        ) AS new_cats
        WHERE NOT EXISTS (SELECT 1 FROM categories WHERE name = new_cats.name);
      `)
      db.exec(`INSERT INTO schema_migrations (version) VALUES (13);`)
    }

    if (currentVersion < 14) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS chat_sessions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          title TEXT NOT NULL,
          messages TEXT NOT NULL DEFAULT '[]',
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT
        );
        INSERT INTO schema_migrations (version) VALUES (14);
      `)
    }

    if (currentVersion < 15) {
      // Migrate budgets: rename year → period (supports both YYYY and YYYY-MM)
      db.exec(`
        CREATE TABLE IF NOT EXISTS budgets_v15 (
          id INTEGER PRIMARY KEY,
          category_id INTEGER NOT NULL,
          period TEXT NOT NULL,
          cadence TEXT NOT NULL DEFAULT 'monthly',
          amount REAL NOT NULL,
          notes TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT,
          UNIQUE(category_id, period),
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );
        INSERT INTO budgets_v15 (id, category_id, period, cadence, amount, notes, created_at, updated_at)
          SELECT id, category_id, year, cadence, amount, notes, created_at, updated_at FROM budgets;
        DROP TABLE budgets;
        ALTER TABLE budgets_v15 RENAME TO budgets;
        CREATE INDEX IF NOT EXISTS idx_budgets_period ON budgets(period);
        INSERT INTO schema_migrations (version) VALUES (15);
      `)
    }

    if (currentVersion < 16) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS accounts (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          bank TEXT,
          type TEXT NOT NULL DEFAULT 'checking',
          identifier TEXT UNIQUE,
          anchor_balance REAL,
          anchor_date TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT
        );
      `)
      const txCols = db.prepare(`PRAGMA table_info(transactions);`).all() as { name: string }[]
      if (!txCols.some((col) => col.name === 'account_id')) {
        db.exec(`ALTER TABLE transactions ADD COLUMN account_id INTEGER REFERENCES accounts(id);`)
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);
        INSERT INTO schema_migrations (version) VALUES (16);
      `)
    }

    if (currentVersion < 17) {
      const aiCols = db.prepare(`PRAGMA table_info(ai_settings);`).all() as { name: string }[]
      if (!aiCols.some((col) => col.name === 'web_search')) {
        db.exec(`ALTER TABLE ai_settings ADD COLUMN web_search INTEGER NOT NULL DEFAULT 0;`)
      }
      db.exec(`INSERT INTO schema_migrations (version) VALUES (17);`)
    }

    if (currentVersion < 18) {
      // Payment method derived at import (direct debit, card terminal, ...) —
      // a strong categorization signal for rules and AI suggestions.
      const txCols18 = db.prepare(`PRAGMA table_info(transactions);`).all() as { name: string }[]
      if (!txCols18.some((col) => col.name === 'method')) {
        db.exec(`ALTER TABLE transactions ADD COLUMN method TEXT;`)
      }
      db.exec(`INSERT INTO schema_migrations (version) VALUES (18);`)
    }

    if (currentVersion < 19) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS tags (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL UNIQUE COLLATE NOCASE,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        CREATE TABLE IF NOT EXISTS transaction_tags (
          transaction_id INTEGER NOT NULL,
          tag_id INTEGER NOT NULL,
          PRIMARY KEY (transaction_id, tag_id),
          FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        INSERT INTO schema_migrations (version) VALUES (19);
      `)
    }

    if (currentVersion < 20) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS rule_tags (
          rule_id INTEGER NOT NULL,
          tag_id INTEGER NOT NULL,
          PRIMARY KEY (rule_id, tag_id),
          FOREIGN KEY (rule_id) REFERENCES rules(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );
        INSERT INTO schema_migrations (version) VALUES (20);
      `)
    }

    if (currentVersion < 21) {
      db.exec(`
        CREATE TABLE IF NOT EXISTS ai_tag_suggestions (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          transaction_id INTEGER NOT NULL,
          tag_name TEXT NOT NULL,
          confidence REAL NOT NULL,
          model TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (transaction_id, tag_name),
          FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_ai_tag_suggestions_tx ON ai_tag_suggestions (transaction_id);
        INSERT INTO schema_migrations (version) VALUES (21);
      `)
    }

    if (currentVersion < 22) {
      const aiCols22 = db.prepare(`PRAGMA table_info(ai_settings);`).all() as { name: string }[]
      if (!aiCols22.some((col) => col.name === 'api_key')) {
        db.exec(`ALTER TABLE ai_settings ADD COLUMN api_key TEXT;`)
      }
      db.exec(`INSERT INTO schema_migrations (version) VALUES (22);`)
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
  method?: string | null
  rawHash: string
}

export function insertImport(
  source: string,
  fileName: string,
  fileHash?: string | null
) {
  const db = initializeDatabase()
  const stmt = db.prepare(
    `INSERT INTO imports (source, file_name, file_hash) VALUES (?, ?, ?)`
  )
  const result = stmt.run(source, fileName, fileHash ?? null) as RunResult

  return result.lastInsertRowid as number
}

export function hasImportHash(fileHash: string) {
  const db = initializeDatabase()
  const row = db
    .prepare(`SELECT 1 FROM imports WHERE file_hash = ? LIMIT 1`)
    .get(fileHash) as { 1: number } | undefined
  return Boolean(row)
}

export function insertTransactions(rows: TransactionInsert[], accountId?: number | null) {
  const db = initializeDatabase()
  const insertStmt = db.prepare(`
    INSERT INTO transactions (
      account,
      account_id,
      booking_date,
      value_date,
      amount,
      currency,
      payee,
      purpose,
      iban,
      bic,
      reference,
      method,
      raw_hash
    ) VALUES (
      @account,
      @accountId,
      @bookingDate,
      @valueDate,
      @amount,
      @currency,
      @payee,
      @purpose,
      @iban,
      @bic,
      @reference,
      @method,
      @rawHash
    )
  `)

  let inserted = 0
  let skipped = 0

  const transaction = db.transaction((items: TransactionInsert[]) => {
    for (const item of items) {
      try {
        insertStmt.run({ ...item, accountId: accountId ?? null, method: item.method ?? null })
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

export function deleteTransaction(id: number) {
  const db = initializeDatabase()
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM transaction_categories WHERE transaction_id = ?`).run(id)
    const result = db.prepare(`DELETE FROM transactions WHERE id = ?`).run(id)
    return result.changes > 0
  })

  return tx()
}

export type AccountRow = {
  id: number
  name: string
  bank: string | null
  type: string
  identifier: string | null
  anchorBalance: number | null
  anchorDate: string | null
  currentBalance: number | null
  transactionCount: number
  lastBookingDate: string | null
}

export function getOrCreateAccount(input: {
  bank: string
  identifier: string
  type: 'checking' | 'savings' | 'credit'
  defaultName: string
}): number {
  const db = initializeDatabase()
  const existing = db
    .prepare(`SELECT id FROM accounts WHERE identifier = ?`)
    .get(input.identifier) as { id: number } | undefined
  if (existing) {
    return existing.id
  }
  const result = db
    .prepare(`INSERT INTO accounts (name, bank, type, identifier) VALUES (?, ?, ?, ?)`)
    .run(input.defaultName, input.bank, input.type, input.identifier)
  return result.lastInsertRowid as number
}

// Auto-anchor from import metadata: only move the anchor forward, never back,
// so a manual anchor or a newer statement is not overwritten by an older file.
export function maybeUpdateAccountAnchor(accountId: number, balance: number, date: string) {
  const db = initializeDatabase()
  db.prepare(`
    UPDATE accounts
    SET anchor_balance = ?, anchor_date = ?, updated_at = datetime('now')
    WHERE id = ? AND (anchor_date IS NULL OR anchor_date < ?)
  `).run(balance, date, accountId, date)
}

export function listAccounts(): AccountRow[] {
  const db = initializeDatabase()
  return db.prepare(`
    SELECT
      a.id,
      a.name,
      a.bank,
      a.type,
      a.identifier,
      a.anchor_balance as anchorBalance,
      a.anchor_date as anchorDate,
      CASE WHEN a.anchor_balance IS NOT NULL THEN
        a.anchor_balance + COALESCE((
          SELECT SUM(t.amount) FROM transactions t
          WHERE t.account_id = a.id AND t.booking_date > a.anchor_date
        ), 0)
      ELSE NULL END as currentBalance,
      (SELECT COUNT(1) FROM transactions t WHERE t.account_id = a.id) as transactionCount,
      (SELECT MAX(t.booking_date) FROM transactions t WHERE t.account_id = a.id) as lastBookingDate
    FROM accounts a
    ORDER BY a.type, a.name
  `).all() as AccountRow[]
}

export function updateAccount(id: number, updates: {
  name?: string
  type?: string
  anchorBalance?: number | null
  anchorDate?: string | null
}) {
  const db = initializeDatabase()
  const current = db.prepare(`SELECT name, type, anchor_balance, anchor_date FROM accounts WHERE id = ?`).get(id) as
    | { name: string; type: string; anchor_balance: number | null; anchor_date: string | null }
    | undefined
  if (!current) return false
  const validTypes = ['checking', 'savings', 'credit']
  const nextType = updates.type && validTypes.includes(updates.type) ? updates.type : current.type
  db.prepare(`
    UPDATE accounts
    SET name = ?, type = ?, anchor_balance = ?, anchor_date = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    updates.name?.trim() || current.name,
    nextType,
    updates.anchorBalance !== undefined ? updates.anchorBalance : current.anchor_balance,
    updates.anchorDate !== undefined ? updates.anchorDate : current.anchor_date,
    id
  )
  return true
}

export function deleteAccount(id: number) {
  const db = initializeDatabase()
  const tx = db.transaction(() => {
    db.prepare(
      `DELETE FROM ai_suggestions WHERE transaction_id IN (SELECT id FROM transactions WHERE account_id = ?)`
    ).run(id)
    db.prepare(
      `DELETE FROM transaction_categories WHERE transaction_id IN (SELECT id FROM transactions WHERE account_id = ?)`
    ).run(id)
    db.prepare(`DELETE FROM transactions WHERE account_id = ?`).run(id)
    const result = db.prepare(`DELETE FROM accounts WHERE id = ?`).run(id)
    return result.changes > 0
  })
  return tx()
}

export type TransactionRow = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
  categoryCount: number
  source: string
  accountName?: string | null
}

export type TransactionListFilters = {
  limit?: number
  offset?: number
  search?: string
  accountIds?: number[]
}

// Global account filter, applied across transactions/categorization/dashboard/
// budget queries — an empty or missing list means "no filter, show all".
function accountFilterClause(accountIds: number[] | undefined, alias: string) {
  const clean = (accountIds ?? []).filter((id) => Number.isInteger(id))
  if (clean.length === 0) {
    return { sql: '', params: [] as number[] }
  }
  return {
    sql: `${alias}.account_id IN (${clean.map(() => '?').join(', ')})`,
    params: clean,
  }
}

export type DashboardSummaryRow = {
  month: string
  totalIncome: number
  totalSpend: number
  net: number
  transactionCount: number
  categorizedCount: number
  uncategorizedCount: number
}

export type DashboardCategorySpendRow = {
  categoryId: number
  categoryName: string
  categoryColor: string | null
  totalSpend: number
  totalIncome: number
  transactionCount: number
}

export type DashboardTrendRow = {
  month: string
  totalSpend: number
  totalIncome: number
  net: number
}

export function listDashboardMonths() {
  const db = initializeDatabase()
  const rows = db
    .prepare(
      `
        SELECT DISTINCT substr(booking_date, 1, 7) as month
        FROM transactions
        ORDER BY month DESC
      `
    )
    .all() as { month: string }[]
  return rows.map((row) => row.month)
}

export function getDashboardSummary(month: string, accountIds?: number[]): DashboardSummaryRow {
  const db = initializeDatabase()
  const f1 = accountFilterClause(accountIds, 't2')
  const f2 = accountFilterClause(accountIds, 't3')
  const f3 = accountFilterClause(accountIds, 't')
  const row = db
    .prepare(
      `
        SELECT
          ? as month,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as totalIncome,
          COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) as totalSpend,
          COALESCE(SUM(amount), 0) as net,
          COUNT(1) as transactionCount,
          (
            SELECT COUNT(DISTINCT t2.id)
            FROM transactions t2
            INNER JOIN transaction_categories tc2
              ON tc2.transaction_id = t2.id
            WHERE substr(t2.booking_date, 1, 7) = ?
              ${f1.sql ? `AND ${f1.sql}` : ''}
          ) as categorizedCount,
          (
            SELECT COUNT(1)
            FROM transactions t3
            LEFT JOIN transaction_categories tc3
              ON tc3.transaction_id = t3.id
            WHERE tc3.transaction_id IS NULL
              AND substr(t3.booking_date, 1, 7) = ?
              ${f2.sql ? `AND ${f2.sql}` : ''}
          ) as uncategorizedCount
        FROM transactions t
        WHERE substr(t.booking_date, 1, 7) = ?
          AND NOT EXISTS (
            SELECT 1 FROM transaction_categories tc
            INNER JOIN categories c ON c.id = tc.category_id
            WHERE tc.transaction_id = t.id AND c.group_type = 'transfer'
          )
          ${f3.sql ? `AND ${f3.sql}` : ''}
      `
    )
    .get(month, month, ...f1.params, month, ...f2.params, month, ...f3.params) as
    | DashboardSummaryRow
    | undefined

  if (!row) {
    return {
      month,
      totalIncome: 0,
      totalSpend: 0,
      net: 0,
      transactionCount: 0,
      categorizedCount: 0,
      uncategorizedCount: 0,
    }
  }

  return row
}

export function getDashboardSummaryRange(
  startMonth: string,
  endMonth: string,
  accountIds?: number[]
): DashboardSummaryRow {
  const db = initializeDatabase()
  const f1 = accountFilterClause(accountIds, 't2')
  const f2 = accountFilterClause(accountIds, 't3')
  const f3 = accountFilterClause(accountIds, 't')
  const row = db
    .prepare(
      `
        SELECT
          ? as month,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as totalIncome,
          COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) as totalSpend,
          COALESCE(SUM(amount), 0) as net,
          COUNT(1) as transactionCount,
          (
            SELECT COUNT(DISTINCT t2.id)
            FROM transactions t2
            INNER JOIN transaction_categories tc2
              ON tc2.transaction_id = t2.id
            WHERE substr(t2.booking_date, 1, 7) BETWEEN ? AND ?
              ${f1.sql ? `AND ${f1.sql}` : ''}
          ) as categorizedCount,
          (
            SELECT COUNT(1)
            FROM transactions t3
            LEFT JOIN transaction_categories tc3
              ON tc3.transaction_id = t3.id
            WHERE tc3.transaction_id IS NULL
              AND substr(t3.booking_date, 1, 7) BETWEEN ? AND ?
              ${f2.sql ? `AND ${f2.sql}` : ''}
          ) as uncategorizedCount
        FROM transactions t
        WHERE substr(t.booking_date, 1, 7) BETWEEN ? AND ?
          AND NOT EXISTS (
            SELECT 1 FROM transaction_categories tc
            INNER JOIN categories c ON c.id = tc.category_id
            WHERE tc.transaction_id = t.id AND c.group_type = 'transfer'
          )
          ${f3.sql ? `AND ${f3.sql}` : ''}
      `
    )
    .get(
      `${startMonth} to ${endMonth}`,
      startMonth,
      endMonth,
      ...f1.params,
      startMonth,
      endMonth,
      ...f2.params,
      startMonth,
      endMonth,
      ...f3.params
    ) as DashboardSummaryRow | undefined

  if (!row) {
    return {
      month: `${startMonth} to ${endMonth}`,
      totalIncome: 0,
      totalSpend: 0,
      net: 0,
      transactionCount: 0,
      categorizedCount: 0,
      uncategorizedCount: 0,
    }
  }

  return row
}

export function listDashboardCategorySpend(month: string, accountIds?: number[]) {
  const db = initializeDatabase()
  const accountFilter = accountFilterClause(accountIds, 't')
  const rows = db
    .prepare(
      `
        SELECT
          c.id as categoryId,
          c.name as categoryName,
          c.color as categoryColor,
          COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) as totalSpend,
          COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) as totalIncome,
          COUNT(1) as transactionCount
        FROM transaction_categories tc
        INNER JOIN transactions t
          ON t.id = tc.transaction_id
        INNER JOIN categories c
          ON c.id = tc.category_id
        WHERE substr(t.booking_date, 1, 7) = ?
          ${accountFilter.sql ? `AND ${accountFilter.sql}` : ''}
        GROUP BY c.id, c.name
        ORDER BY totalSpend DESC, totalIncome DESC, c.name ASC
      `
    )
    .all(month, ...accountFilter.params) as DashboardCategorySpendRow[]

  return rows
}

export function listDashboardCategorySpendRange(
  startMonth: string,
  endMonth: string,
  accountIds?: number[]
) {
  const db = initializeDatabase()
  const accountFilter = accountFilterClause(accountIds, 't')
  const rows = db
    .prepare(
      `
        SELECT
          c.id as categoryId,
          c.name as categoryName,
          c.color as categoryColor,
          COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) as totalSpend,
          COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) as totalIncome,
          COUNT(1) as transactionCount
        FROM transaction_categories tc
        INNER JOIN transactions t
          ON t.id = tc.transaction_id
        INNER JOIN categories c
          ON c.id = tc.category_id
        WHERE substr(t.booking_date, 1, 7) BETWEEN ? AND ?
          ${accountFilter.sql ? `AND ${accountFilter.sql}` : ''}
        GROUP BY c.id, c.name, c.color
        ORDER BY totalSpend DESC, totalIncome DESC, c.name ASC
      `
    )
    .all(startMonth, endMonth, ...accountFilter.params) as DashboardCategorySpendRow[]

  return rows
}

export type DashboardTagSpendRow = {
  tagId: number
  tagName: string
  totalSpend: number
  totalIncome: number
  transactionCount: number
}

// Mirrors listDashboardCategorySpend exactly, joining transaction_tags
// instead of transaction_categories — an INNER JOIN so untagged
// transactions are excluded, not just zeroed out.
export function listDashboardTagSpend(month: string, accountIds?: number[]) {
  const db = initializeDatabase()
  const accountFilter = accountFilterClause(accountIds, 't')
  const rows = db
    .prepare(
      `
        SELECT
          tg.id as tagId,
          tg.name as tagName,
          COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) as totalSpend,
          COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) as totalIncome,
          COUNT(1) as transactionCount
        FROM transaction_tags tt
        INNER JOIN transactions t
          ON t.id = tt.transaction_id
        INNER JOIN tags tg
          ON tg.id = tt.tag_id
        WHERE substr(t.booking_date, 1, 7) = ?
          ${accountFilter.sql ? `AND ${accountFilter.sql}` : ''}
        GROUP BY tg.id, tg.name
        ORDER BY totalSpend DESC, totalIncome DESC, tg.name ASC
      `
    )
    .all(month, ...accountFilter.params) as DashboardTagSpendRow[]

  return rows
}

export function listDashboardTagSpendRange(startMonth: string, endMonth: string, accountIds?: number[]) {
  const db = initializeDatabase()
  const accountFilter = accountFilterClause(accountIds, 't')
  const rows = db
    .prepare(
      `
        SELECT
          tg.id as tagId,
          tg.name as tagName,
          COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) as totalSpend,
          COALESCE(SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END), 0) as totalIncome,
          COUNT(1) as transactionCount
        FROM transaction_tags tt
        INNER JOIN transactions t
          ON t.id = tt.transaction_id
        INNER JOIN tags tg
          ON tg.id = tt.tag_id
        WHERE substr(t.booking_date, 1, 7) BETWEEN ? AND ?
          ${accountFilter.sql ? `AND ${accountFilter.sql}` : ''}
        GROUP BY tg.id, tg.name
        ORDER BY totalSpend DESC, totalIncome DESC, tg.name ASC
      `
    )
    .all(startMonth, endMonth, ...accountFilter.params) as DashboardTagSpendRow[]

  return rows
}

export type TagTransactionRow = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
}

// Drill-down list for the dashboard's tag breakdown. Mirrors
// listCategorizedTransactions's un-scoped-by-month behavior (all-time for
// the selected entity), just filtered by tag instead of category.
export function listTransactionsByTag(
  tagId: number,
  filters: TransactionListFilters = {}
): { rows: TagTransactionRow[]; total: number } {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0
  const accountFilter = accountFilterClause(filters.accountIds, 't')
  const where = `WHERE tt.tag_id = ?${accountFilter.sql ? ` AND ${accountFilter.sql}` : ''}`

  const total = db
    .prepare(
      `
        SELECT COUNT(1) as total
        FROM transaction_tags tt
        INNER JOIN transactions t
          ON t.id = tt.transaction_id
        ${where}
      `
    )
    .get(tagId, ...accountFilter.params) as { total: number }

  const rows = db
    .prepare(
      `
        SELECT
          t.id,
          t.booking_date as bookingDate,
          t.amount,
          t.currency,
          t.payee,
          t.purpose
        FROM transaction_tags tt
        INNER JOIN transactions t
          ON t.id = tt.transaction_id
        ${where}
        ORDER BY t.booking_date DESC, t.id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(tagId, ...accountFilter.params, limit, offset) as TagTransactionRow[]

  return { rows, total: total.total }
}

export function listDashboardTrend(months = 6, accountIds?: number[]) {
  const db = initializeDatabase()
  const accountFilter = accountFilterClause(accountIds, 't')
  const rows = db
    .prepare(
      `
        SELECT
          substr(booking_date, 1, 7) as month,
          COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) as totalSpend,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as totalIncome,
          COALESCE(SUM(amount), 0) as net
        FROM transactions t
        WHERE NOT EXISTS (
          SELECT 1 FROM transaction_categories tc
          INNER JOIN categories c ON c.id = tc.category_id
          WHERE tc.transaction_id = t.id AND c.group_type = 'transfer'
        )
          ${accountFilter.sql ? `AND ${accountFilter.sql}` : ''}
        GROUP BY month
        ORDER BY month DESC
        LIMIT ?
      `
    )
    .all(...accountFilter.params, months) as DashboardTrendRow[]

  return rows
}

export function listTransactions(filters: TransactionListFilters = {}) {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0
  const search = filters.search?.trim()
  const params: Array<string | number> = []
  const conditions: string[] = []

  if (search) {
    const term = `%${search.toLowerCase()}%`
    conditions.push(`(lower(t.payee) LIKE ? OR lower(t.purpose) LIKE ?)`)
    params.push(term, term)
  }
  const accountFilter = accountFilterClause(filters.accountIds, 't')
  if (accountFilter.sql) {
    conditions.push(accountFilter.sql)
    params.push(...accountFilter.params)
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

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
          t.source,
          a.name as accountName,
          (
            SELECT COUNT(1)
            FROM transaction_categories tc
            WHERE tc.transaction_id = t.id
          ) as categoryCount
        FROM transactions t
        LEFT JOIN accounts a ON a.id = t.account_id
        ${where}
        ORDER BY t.booking_date DESC, t.id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(...params, limit, offset) as TransactionRow[]

  const total = db
    .prepare(
      `
        SELECT COUNT(1) as total
        FROM transactions t
        ${where}
      `
    )
    .get(...params) as { total: number }

  return { rows, total: total.total }
}

export type UncategorizedTransactionRow = Omit<TransactionRow, 'categoryCount'> & {
  categoryCount: 0
  iban?: string | null
  method?: string | null
}

export function listUncategorizedTransactions(filters: TransactionListFilters = {}) {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0
  const params: number[] = []
  const conditions = ['tc.transaction_id IS NULL']

  const accountFilter = accountFilterClause(filters.accountIds, 't')
  if (accountFilter.sql) {
    conditions.push(accountFilter.sql)
    params.push(...accountFilter.params)
  }
  const where = `WHERE ${conditions.join(' AND ')}`

  const total = db
    .prepare(
      `
        SELECT COUNT(1) as total
        FROM transactions t
        LEFT JOIN transaction_categories tc
          ON tc.transaction_id = t.id
        ${where}
      `
    )
    .get(...params) as { total: number }

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
          t.iban,
          t.method,
          t.source,
          0 as categoryCount
        FROM transactions t
        LEFT JOIN transaction_categories tc
          ON tc.transaction_id = t.id
        ${where}
        ORDER BY t.booking_date DESC, t.id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(...params, limit, offset) as UncategorizedTransactionRow[]

  return { rows, total: total.total }
}

// Tags: free-form to create, normalized to lowercase-kebab so "Italy 2026"
// and "italy-2026" are one tag. No financial semantics — they never affect
// totals, so they are safe to apply liberally and cheap to undo.
export function normalizeTagName(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, '-').replace(/-+/g, '-')
}

export type TagRow = {
  id: number
  name: string
  usageCount: number
}

export function getOrCreateTag(name: string): number | null {
  const normalized = normalizeTagName(name)
  if (!normalized) return null
  const db = initializeDatabase()
  const existing = db.prepare(`SELECT id FROM tags WHERE name = ?`).get(normalized) as { id: number } | undefined
  if (existing) return existing.id
  const result = db.prepare(`INSERT INTO tags (name) VALUES (?)`).run(normalized)
  return result.lastInsertRowid as number
}

function insertTransactionTag(transactionId: number, tagId: number) {
  const db = initializeDatabase()
  try {
    db.prepare(`INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?, ?)`).run(transactionId, tagId)
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('UNIQUE') || message.includes('PRIMARY KEY')) return false
    throw error
  }
}

export function addTransactionTag(transactionId: number, tagName: string) {
  const tagId = getOrCreateTag(tagName)
  if (!tagId) return false
  return insertTransactionTag(transactionId, tagId)
}

// For rule-apply paths where the tag id is already known/validated — skips
// the name lookup/creation addTransactionTag does.
export function addTransactionTagById(transactionId: number, tagId: number) {
  return insertTransactionTag(transactionId, tagId)
}

export function removeTransactionTag(transactionId: number, tagId: number) {
  const db = initializeDatabase()
  const result = db.prepare(`DELETE FROM transaction_tags WHERE transaction_id = ? AND tag_id = ?`).run(transactionId, tagId)
  return result.changes > 0
}

export function listTags(filters: { limit?: number; offset?: number; search?: string } = {}): { rows: TagRow[]; total: number } {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0
  const search = filters.search?.trim()
  const params: Array<string | number> = []

  const where = search
    ? (() => {
        const term = `%${search.toLowerCase()}%`
        params.push(term)
        return `WHERE lower(t.name) LIKE ?`
      })()
    : ''

  const rows = db
    .prepare(
      `
        SELECT t.id, t.name, COUNT(tt.transaction_id) as usageCount
        FROM tags t
        LEFT JOIN transaction_tags tt ON tt.tag_id = t.id
        ${where}
        GROUP BY t.id
        ORDER BY usageCount DESC, t.name ASC
        LIMIT ? OFFSET ?
      `
    )
    .all(...params, limit, offset) as TagRow[]

  const total = db
    .prepare(
      `
        SELECT COUNT(1) as total
        FROM tags t
        ${where}
      `
    )
    .get(...params) as { total: number }

  return { rows, total: total.total }
}

export function listTagsForTransactions(transactionIds: number[]) {
  if (transactionIds.length === 0) return []
  const db = initializeDatabase()
  const placeholders = transactionIds.map(() => '?').join(', ')
  return db.prepare(`
    SELECT tt.transaction_id as transactionId, t.id as tagId, t.name
    FROM transaction_tags tt
    INNER JOIN tags t ON t.id = tt.tag_id
    WHERE tt.transaction_id IN (${placeholders})
    ORDER BY t.name
  `).all(...transactionIds) as Array<{ transactionId: number; tagId: number; name: string }>
}

// Renaming to an existing tag's name merges the two.
export function renameTag(id: number, newName: string) {
  const normalized = normalizeTagName(newName)
  if (!normalized) return false
  const db = initializeDatabase()
  const target = db.prepare(`SELECT id FROM tags WHERE name = ? AND id != ?`).get(normalized, id) as { id: number } | undefined
  const tx = db.transaction(() => {
    if (target) {
      db.prepare(`INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id)
        SELECT transaction_id, ? FROM transaction_tags WHERE tag_id = ?`).run(target.id, id)
      db.prepare(`DELETE FROM transaction_tags WHERE tag_id = ?`).run(id)
      db.prepare(`DELETE FROM tags WHERE id = ?`).run(id)
    } else {
      db.prepare(`UPDATE tags SET name = ? WHERE id = ?`).run(normalized, id)
    }
  })
  tx()
  return true
}

export function deleteTag(id: number) {
  const db = initializeDatabase()
  const tx = db.transaction(() => {
    db.prepare(`DELETE FROM transaction_tags WHERE tag_id = ?`).run(id)
    const result = db.prepare(`DELETE FROM tags WHERE id = ?`).run(id)
    return result.changes > 0
  })
  return tx()
}

// Compact payee → category history for the AI suggester: how the user has
// categorized each payee so far, most frequent first.
export function getPayeeCategoryHints(limit = 100) {
  const db = initializeDatabase()
  return db.prepare(`
    SELECT t.payee as payee, c.name as category, COUNT(*) as timesUsed
    FROM transactions t
    INNER JOIN transaction_categories tc ON tc.transaction_id = t.id
    INNER JOIN categories c ON c.id = tc.category_id
    WHERE t.payee IS NOT NULL AND t.payee != ''
    GROUP BY t.payee, c.name
    ORDER BY timesUsed DESC
    LIMIT ?
  `).all(limit) as Array<{ payee: string; category: string; timesUsed: number }>
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

export function listCategorizedTransactions(
  filters: TransactionListFilters & { categoryIds?: number[] } = {}
) {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0
  const categoryIds = Array.isArray(filters.categoryIds)
    ? filters.categoryIds.filter((id) => Number.isInteger(id))
    : []

  const accountFilter = accountFilterClause(filters.accountIds, 't')
  const conditions: string[] = []
  if (categoryIds.length > 0) {
    conditions.push(`tc.category_id IN (${categoryIds.map(() => '?').join(',')})`)
  }
  if (accountFilter.sql) {
    conditions.push(accountFilter.sql)
  }
  const filterClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
  const filterParams = [...categoryIds, ...accountFilter.params]

  const total = db
    .prepare(
      `
        SELECT COUNT(DISTINCT t.id) as total
        FROM transactions t
        INNER JOIN transaction_categories tc
          ON tc.transaction_id = t.id
        ${filterClause}
      `
    )
    .get(...filterParams) as { total: number }

  const rows = db
    .prepare(
      `
        WITH page_ids AS (
          SELECT t.id
          FROM transactions t
          INNER JOIN transaction_categories tc
            ON tc.transaction_id = t.id
          ${filterClause}
          GROUP BY t.id
          ORDER BY t.booking_date DESC, t.id DESC
          LIMIT ? OFFSET ?
        )
        SELECT
          t.id,
          t.booking_date as bookingDate,
          t.amount,
          t.currency,
          t.payee,
          t.purpose,
          t.source,
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
        WHERE t.id IN (SELECT id FROM page_ids)
        ORDER BY t.booking_date DESC, t.id DESC
      `
    )
    .all(...filterParams, limit, offset) as CategorizedTransactionRow[]

  return { rows, total: total?.total ?? 0 }
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
  groupType: string
  displayOrder: number
}

export function listCategories(filters: { limit?: number; offset?: number; search?: string } = {}) {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0
  const search = filters.search?.trim()
  const params: Array<string | number> = []

  const where = search
    ? (() => {
        const term = `%${search.toLowerCase()}%`
        params.push(term)
        return `WHERE lower(name) LIKE ?`
      })()
    : ''

  const rows = db
    .prepare(
      `
        SELECT
          id,
          name,
          color,
          is_active as isActive,
          group_type as groupType,
          display_order as displayOrder
        FROM categories
        ${where}
        ORDER BY name ASC
        LIMIT ? OFFSET ?
      `
    )
    .all(...params, limit, offset) as CategoryRow[]

  const total = db
    .prepare(
      `
        SELECT COUNT(1) as total
        FROM categories
        ${where}
      `
    )
    .get(...params) as { total: number }

  return { rows, total: total.total }
}

export type RuleRow = {
  id: number
  matcherType: string
  matcherOperator: string
  matcherValue: string
  categoryId: number
  priority: number
  isActive: number
  tagIds: number[]
}

// Batch-fetches rule_tags for a set of rules, used by listRules and the
// apply-rules pass so neither does one query per rule.
export function listTagIdsByRule(ruleIds: number[]): Map<number, number[]> {
  const map = new Map<number, number[]>()
  if (ruleIds.length === 0) return map
  const db = initializeDatabase()
  const placeholders = ruleIds.map(() => '?').join(', ')
  const rows = db
    .prepare(`SELECT rule_id as ruleId, tag_id as tagId FROM rule_tags WHERE rule_id IN (${placeholders})`)
    .all(...ruleIds) as Array<{ ruleId: number; tagId: number }>
  for (const row of rows) {
    const existing = map.get(row.ruleId)
    if (existing) {
      existing.push(row.tagId)
    } else {
      map.set(row.ruleId, [row.tagId])
    }
  }
  return map
}

export function listRules(filters: { limit?: number; offset?: number; search?: string } = {}) {
  const db = initializeDatabase()
  const limit = filters.limit ?? 200
  const offset = filters.offset ?? 0
  const search = filters.search?.trim()
  const params: Array<string | number> = []

  const where = search
    ? (() => {
        const term = `%${search.toLowerCase()}%`
        params.push(term, term)
        return `WHERE lower(r.matcher_value) LIKE ? OR lower(c.name) LIKE ?`
      })()
    : ''

  const rows = db
    .prepare(
      `
        SELECT
          r.id,
          r.matcher_type as matcherType,
          r.matcher_operator as matcherOperator,
          r.matcher_value as matcherValue,
          r.category_id as categoryId,
          r.priority,
          r.is_active as isActive
        FROM rules r
        LEFT JOIN categories c ON c.id = r.category_id
        ${where}
        ORDER BY r.priority DESC, r.id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(...params, limit, offset) as Array<Omit<RuleRow, 'tagIds'>>

  const tagsByRule = listTagIdsByRule(rows.map((row) => row.id))
  const rowsWithTags: RuleRow[] = rows.map((row) => ({
    ...row,
    tagIds: tagsByRule.get(row.id) ?? [],
  }))

  const total = db
    .prepare(
      `
        SELECT COUNT(1) as total
        FROM rules r
        LEFT JOIN categories c ON c.id = r.category_id
        ${where}
      `
    )
    .get(...params) as { total: number }

  return { rows: rowsWithTags, total: total.total }
}

export type AiSettingsRow = {
  id: number
  model: string
  enabled: number
  confidenceThreshold: number
  inputCostPer1M: number | null
  outputCostPer1M: number | null
  webSearch: number
  apiKey: string | null
}

export function getAiSettings() {
  const db = initializeDatabase()
  const row = db
    .prepare(
      `
        SELECT
          id,
          model,
          enabled,
          confidence_threshold as confidenceThreshold,
          input_cost_per_1m as inputCostPer1M,
          output_cost_per_1m as outputCostPer1M,
          web_search as webSearch,
          api_key as apiKey
        FROM ai_settings
        WHERE id = 1
      `
    )
  .get() as AiSettingsRow | undefined

  if (!row) {
    db.prepare(
      `
        INSERT INTO ai_settings (
          id,
          model,
          enabled,
          confidence_threshold,
          input_cost_per_1m,
          output_cost_per_1m
        )
        VALUES (1, 'gpt-4o-mini-2024-07-18', 0, 0.9, 0.15, 0.6)
      `
    ).run()
    return getAiSettings()
  }

  return row
}

export function updateAiSettings(updates: {
  model?: string
  enabled?: number
  confidenceThreshold?: number
  inputCostPer1M?: number | null
  outputCostPer1M?: number | null
  webSearch?: number
  apiKey?: string | null
}) {
  const db = initializeDatabase()
  const current = getAiSettings()
  const next = {
    model: updates.model ?? current.model,
    enabled: updates.enabled ?? current.enabled,
    confidenceThreshold: updates.confidenceThreshold ?? current.confidenceThreshold,
    inputCostPer1M: updates.inputCostPer1M ?? current.inputCostPer1M,
    outputCostPer1M: updates.outputCostPer1M ?? current.outputCostPer1M,
    webSearch: updates.webSearch ?? current.webSearch,
    apiKey: updates.apiKey !== undefined ? updates.apiKey : current.apiKey,
  }

  db.prepare(
    `
      UPDATE ai_settings
      SET model = ?,
          enabled = ?,
          confidence_threshold = ?,
          input_cost_per_1m = ?,
          output_cost_per_1m = ?,
          web_search = ?,
          api_key = ?,
          updated_at = datetime('now')
      WHERE id = 1
    `
  ).run(
    next.model,
    next.enabled,
    next.confidenceThreshold,
    next.inputCostPer1M,
    next.outputCostPer1M,
    next.webSearch,
    next.apiKey
  )

  return getAiSettings()
}

export function getEffectiveOpenAiKey(): { key: string | null; source: 'settings' | 'env' | null } {
  const settings = getAiSettings()
  const stored = settings.apiKey?.trim()
  if (stored) {
    return { key: stored, source: 'settings' }
  }
  const envKey = process.env.OPENAI_API_KEY?.trim()
  if (envKey) {
    return { key: envKey, source: 'env' }
  }
  return { key: null, source: null }
}

export type AiRequestRow = {
  id: number
  model: string | null
  requestPayload: string | null
  responsePayload: string | null
  status: string
  error: string | null
  inputTokens: number | null
  outputTokens: number | null
  totalTokens: number | null
  costUsd: number | null
  createdAt: string
}

export function insertAiRequest(input: {
  model?: string | null
  requestPayload?: string | null
  responsePayload?: string | null
  status: string
  error?: string | null
  inputTokens?: number | null
  outputTokens?: number | null
  totalTokens?: number | null
  costUsd?: number | null
}) {
  const db = initializeDatabase()
  const result = db
    .prepare(
      `
        INSERT INTO ai_requests (
          model,
          request_payload,
          response_payload,
          status,
          error,
          input_tokens,
          output_tokens,
          total_tokens,
          cost_usd
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
    .run(
      input.model ?? null,
      input.requestPayload ?? null,
      input.responsePayload ?? null,
      input.status,
      input.error ?? null,
      input.inputTokens ?? null,
      input.outputTokens ?? null,
      input.totalTokens ?? null,
      input.costUsd ?? null
    )
  return result.lastInsertRowid as number
}

export function listAiRequests(filters: { limit?: number; offset?: number } = {}) {
  const db = initializeDatabase()
  const limit = filters.limit ?? 100
  const offset = filters.offset ?? 0

  const rows = db
    .prepare(
      `
        SELECT
          id,
          model,
          request_payload as requestPayload,
          response_payload as responsePayload,
          status,
          error,
          input_tokens as inputTokens,
          output_tokens as outputTokens,
          total_tokens as totalTokens,
          cost_usd as costUsd,
          created_at as createdAt
        FROM ai_requests
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
      `
    )
    .all(limit, offset) as AiRequestRow[]

  const total = db
    .prepare(`SELECT COUNT(1) as total FROM ai_requests`)
    .get() as { total: number }

  return { rows, total: total.total }
}

export type ChatSessionRow = {
  id: number
  title: string
  messageCount: number
  createdAt: string
  updatedAt: string | null
}

export type ChatSessionDetail = {
  id: number
  title: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  createdAt: string
  updatedAt: string | null
}

export function createChatSession(title: string, messages: Array<{ role: string; content: string }>): number {
  const db = initializeDatabase()
  const result = db.prepare(`
    INSERT INTO chat_sessions (title, messages) VALUES (?, ?)
  `).run(title, JSON.stringify(messages))
  return result.lastInsertRowid as number
}

export function updateChatSession(id: number, messages: Array<{ role: string; content: string }>) {
  const db = initializeDatabase()
  db.prepare(`
    UPDATE chat_sessions SET messages = ?, updated_at = datetime('now') WHERE id = ?
  `).run(JSON.stringify(messages), id)
}

export function listChatSessions(): ChatSessionRow[] {
  const db = initializeDatabase()
  return db.prepare(`
    SELECT id, title,
      json_array_length(messages) as messageCount,
      created_at as createdAt,
      updated_at as updatedAt
    FROM chat_sessions
    ORDER BY COALESCE(updated_at, created_at) DESC
    LIMIT 50
  `).all() as ChatSessionRow[]
}

export function getChatSession(id: number): ChatSessionDetail | null {
  const db = initializeDatabase()
  const row = db.prepare(`
    SELECT id, title, messages, created_at as createdAt, updated_at as updatedAt
    FROM chat_sessions WHERE id = ?
  `).get(id) as { id: number; title: string; messages: string; createdAt: string; updatedAt: string | null } | undefined
  if (!row) return null
  return { ...row, messages: JSON.parse(row.messages) }
}

export function deleteChatSession(id: number) {
  const db = initializeDatabase()
  db.prepare(`DELETE FROM chat_sessions WHERE id = ?`).run(id)
}

export type AiSuggestionRow = {
  transactionId: number
  categoryId: number
  confidence: number
  reason: string | null
  model: string | null
}

export function upsertAiSuggestions(
  rows: Array<{
    transactionId: number
    categoryId: number
    confidence: number
    reason?: string | null
    model?: string | null
  }>
) {
  const db = initializeDatabase()
  const stmt = db.prepare(
    `
      INSERT INTO ai_suggestions (
        transaction_id,
        category_id,
        confidence,
        reason,
        model
      ) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(transaction_id) DO UPDATE SET
        category_id = excluded.category_id,
        confidence = excluded.confidence,
        reason = excluded.reason,
        model = excluded.model,
        created_at = datetime('now')
    `
  )

  const run = db.transaction((items: typeof rows) => {
    for (const item of items) {
      stmt.run(
        item.transactionId,
        item.categoryId,
        item.confidence,
        item.reason ?? null,
        item.model ?? null
      )
    }
  })

  run(rows)
}

export function getAiSuggestionsForTransactions(transactionIds: number[]) {
  if (transactionIds.length === 0) {
    return []
  }

  const db = initializeDatabase()
  const placeholders = transactionIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
        SELECT
          transaction_id as transactionId,
          category_id as categoryId,
          confidence,
          reason,
          model
        FROM ai_suggestions
        WHERE transaction_id IN (${placeholders})
      `
    )
    .all(...transactionIds) as AiSuggestionRow[]

  return rows
}

export type AiTagSuggestionRow = {
  transactionId: number
  tagName: string
  confidence: number
  model: string | null
}

export function upsertAiTagSuggestions(
  rows: Array<{
    transactionId: number
    tagName: string
    confidence: number
    model?: string | null
  }>
) {
  const db = initializeDatabase()
  const stmt = db.prepare(
    `
      INSERT INTO ai_tag_suggestions (
        transaction_id,
        tag_name,
        confidence,
        model
      ) VALUES (?, ?, ?, ?)
      ON CONFLICT(transaction_id, tag_name) DO UPDATE SET
        confidence = excluded.confidence,
        model = excluded.model,
        created_at = datetime('now')
    `
  )

  const run = db.transaction((items: typeof rows) => {
    for (const item of items) {
      const normalized = normalizeTagName(item.tagName)
      if (!normalized) continue
      stmt.run(item.transactionId, normalized, item.confidence, item.model ?? null)
    }
  })

  run(rows)
}

export function getAiTagSuggestionsForTransactions(transactionIds: number[]) {
  if (transactionIds.length === 0) {
    return []
  }

  const db = initializeDatabase()
  const placeholders = transactionIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `
        SELECT
          transaction_id as transactionId,
          tag_name as tagName,
          confidence,
          model
        FROM ai_tag_suggestions
        WHERE transaction_id IN (${placeholders})
      `
    )
    .all(...transactionIds) as AiTagSuggestionRow[]

  return rows
}

export function createRule(input: {
  matcherType: string
  matcherOperator?: string
  matcherValue: string
  categoryId: number
  priority?: number
  isActive?: number
  tagIds?: number[]
}) {
  const db = initializeDatabase()
  const stmt = db.prepare(
    `
      INSERT INTO rules (
        matcher_type,
        matcher_operator,
        matcher_value,
        category_id,
        priority,
        is_active
      ) VALUES (?, ?, ?, ?, ?, ?)
    `
  )
  const insertTag = db.prepare(`INSERT OR IGNORE INTO rule_tags (rule_id, tag_id) VALUES (?, ?)`)

  const run = db.transaction(() => {
    const result = stmt.run(
      input.matcherType,
      input.matcherOperator ?? 'contains',
      input.matcherValue,
      input.categoryId,
      input.priority ?? 100,
      input.isActive ?? 1
    ) as RunResult
    const ruleId = result.lastInsertRowid as number
    for (const tagId of input.tagIds ?? []) {
      insertTag.run(ruleId, tagId)
    }
    return ruleId
  })

  return run()
}

type RuleScalarRow = Omit<RuleRow, 'tagIds'>

export function updateRule(
  id: number,
  updates: Partial<{
    matcherType: string
    matcherOperator: string
    matcherValue: string
    categoryId: number
    priority: number
    isActive: number
    tagIds: number[]
  }>
) {
  const db = initializeDatabase()
  const current = db
    .prepare(
      `
        SELECT
          matcher_type as matcherType,
          matcher_operator as matcherOperator,
          matcher_value as matcherValue,
          category_id as categoryId,
          priority,
          is_active as isActive
        FROM rules
        WHERE id = ?
      `
    )
    .get(id) as RuleScalarRow | undefined

  if (!current) {
    return false
  }

  const next = {
    matcherType: updates.matcherType ?? current.matcherType,
    matcherOperator: updates.matcherOperator ?? current.matcherOperator,
    matcherValue: updates.matcherValue ?? current.matcherValue,
    categoryId: updates.categoryId ?? current.categoryId,
    priority: updates.priority ?? current.priority,
    isActive: updates.isActive ?? current.isActive,
  }

  const run = db.transaction(() => {
    db.prepare(
      `
        UPDATE rules
        SET matcher_type = ?,
            matcher_operator = ?,
            matcher_value = ?,
            category_id = ?,
            priority = ?,
            is_active = ?,
            updated_at = datetime('now')
        WHERE id = ?
      `
    ).run(
      next.matcherType,
      next.matcherOperator,
      next.matcherValue,
      next.categoryId,
      next.priority,
      next.isActive,
      id
    )

    if (updates.tagIds !== undefined) {
      db.prepare(`DELETE FROM rule_tags WHERE rule_id = ?`).run(id)
      const insertTag = db.prepare(`INSERT OR IGNORE INTO rule_tags (rule_id, tag_id) VALUES (?, ?)`)
      for (const tagId of updates.tagIds) {
        insertTag.run(id, tagId)
      }
    }
  })

  run()

  return true
}

export function deleteRule(id: number) {
  const db = initializeDatabase()
  const result = db.prepare(`DELETE FROM rules WHERE id = ?`).run(id) as RunResult
  return result.changes > 0
}

type RuleMatchTransaction = {
  id: number
  amount: number
  payee: string | null
  purpose: string | null
  iban: string | null
  bic: string | null
  method: string | null
}

function matchesRule(rule: RuleScalarRow, tx: RuleMatchTransaction) {
  const value = rule.matcherValue.trim()
  if (!value) {
    return false
  }
  const operator = (rule.matcherOperator || 'contains').toLowerCase()
  const matchesText = (field: string | null) => {
    const haystack = (field ?? '').toLowerCase()
    const needle = value.toLowerCase()
    if (operator === 'equals') {
      return haystack === needle
    }
    return haystack.includes(needle)
  }

  switch (rule.matcherType) {
    case 'payee': {
      return matchesText(tx.payee)
    }
    case 'purpose': {
      return matchesText(tx.purpose)
    }
    case 'iban': {
      return matchesText(tx.iban)
    }
    case 'bic': {
      return matchesText(tx.bic)
    }
    case 'method': {
      return matchesText(tx.method)
    }
    case 'amount': {
      const target = Number.parseFloat(value.replace(',', '.'))
      if (Number.isNaN(target)) {
        return false
      }
      return Math.abs(tx.amount - target) < 0.0001
    }
    case 'direction': {
      const normalized = value.toLowerCase()
      const isIncome = tx.amount > 0
      if (['in', 'income', 'credit', '+', 'plus'].includes(normalized)) {
        return isIncome
      }
      if (['out', 'expense', 'debit', '-', 'minus'].includes(normalized)) {
        return !isIncome
      }
      return false
    }
    default:
      return false
  }
}

export function applyRulesToUncategorized() {
  const db = initializeDatabase()
  const rules = db
    .prepare(
      `
        SELECT
          id,
          matcher_type as matcherType,
          matcher_operator as matcherOperator,
          matcher_value as matcherValue,
          category_id as categoryId,
          priority,
          is_active as isActive
        FROM rules
        WHERE is_active = 1
        ORDER BY priority DESC, id DESC
      `
    )
    .all() as Array<Omit<RuleRow, 'tagIds'>>

  if (rules.length === 0) {
    return { applied: 0, transactionsMatched: 0 }
  }

  const tagsByRule = listTagIdsByRule(rules.map((rule) => rule.id))

  const transactions = db
    .prepare(
      `
        SELECT
          t.id,
          t.amount,
          t.payee,
          t.purpose,
          t.iban,
          t.bic,
          t.method
        FROM transactions t
        LEFT JOIN transaction_categories tc
          ON tc.transaction_id = t.id
        WHERE tc.transaction_id IS NULL
      `
    )
    .all() as RuleMatchTransaction[]

  if (transactions.length === 0) {
    return { applied: 0, transactionsMatched: 0 }
  }

  const insertStmt = db.prepare(
    `INSERT INTO transaction_categories (transaction_id, category_id) VALUES (?, ?)`
  )

  let applied = 0
  let transactionsMatched = 0

  const run = db.transaction(() => {
    for (const tx of transactions) {
      // First match wins (rules are ordered by priority DESC) so overlapping
      // matchers like 'DKB' ⊂ 'DKB AG' resolve deterministically.
      for (const rule of rules) {
        if (!matchesRule(rule, tx)) {
          continue
        }
        try {
          insertStmt.run(tx.id, rule.categoryId)
          applied += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (!message.includes('UNIQUE constraint failed')) {
            throw error
          }
        }
        for (const tagId of tagsByRule.get(rule.id) ?? []) {
          addTransactionTagById(tx.id, tagId)
        }
        transactionsMatched += 1
        break
      }
    }
  })

  run()

  return { applied, transactionsMatched }
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
  const nextColor = updates.color !== undefined ? updates.color : current.color
  const nextIsActive = updates.isActive !== undefined ? updates.isActive : current.isActive

  db.prepare(
    `
      UPDATE categories
      SET name = ?, color = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `
  ).run(nextName, nextColor, nextIsActive, id)

  return true
}

export function deleteCategory(id: number) {
  const db = initializeDatabase()
  try {
    const result = db.prepare(`DELETE FROM categories WHERE id = ?`).run(id) as RunResult
    return { deleted: result.changes > 0, archived: false }
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (message.includes('FOREIGN KEY')) {
      db.prepare(
        `
          UPDATE categories
          SET is_active = 0,
              updated_at = datetime('now')
          WHERE id = ?
        `
      ).run(id)
      return { deleted: false, archived: true }
    }
    throw error
  }
}

export type BudgetRow = {
  id: number
  categoryId: number
  categoryName: string
  categoryColor: string | null
  groupType: string
  period: string
  cadence: string
  amount: number
  notes: string | null
  createdAt: string
  updatedAt: string | null
}

export type BudgetActualRow = {
  categoryId: number
  categoryName: string
  groupType: string
  actual: number
}

export function listBudgets(period: string): BudgetRow[] {
  const db = initializeDatabase()
  const rows = db.prepare(`
    SELECT
      b.id,
      b.category_id as categoryId,
      c.name as categoryName,
      c.color as categoryColor,
      c.group_type as groupType,
      b.period,
      b.cadence,
      b.amount,
      b.notes,
      b.created_at as createdAt,
      b.updated_at as updatedAt
    FROM budgets b
    INNER JOIN categories c ON c.id = b.category_id
    WHERE b.period = ?
    ORDER BY c.group_type, c.display_order, c.name
  `).all(period) as BudgetRow[]
  return rows
}

export function upsertBudget(input: {
  categoryId: number
  period: string
  cadence: string
  amount: number
  notes?: string | null
}) {
  const db = initializeDatabase()
  const result = db.prepare(`
    INSERT INTO budgets (category_id, period, cadence, amount, notes)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(category_id, period) DO UPDATE SET
      cadence = excluded.cadence,
      amount = excluded.amount,
      notes = excluded.notes,
      updated_at = datetime('now')
  `).run(input.categoryId, input.period, input.cadence, input.amount, input.notes ?? null) as RunResult
  return result.lastInsertRowid as number
}

export function deleteBudget(id: number) {
  const db = initializeDatabase()
  const result = db.prepare(`DELETE FROM budgets WHERE id = ?`).run(id) as RunResult
  return result.changes > 0
}

export function getBudgetActuals(year: string, month?: string, accountIds?: number[]): BudgetActualRow[] {
  const db = initializeDatabase()
  const dateFilter = month
    ? `substr(t.booking_date, 1, 7) = '${month}'`
    : `substr(t.booking_date, 1, 4) = '${year}'`
  const accountFilter = accountFilterClause(accountIds, 't')

  const rows = db.prepare(`
    WITH cat_counts AS (
      SELECT transaction_id, COUNT(*) AS n
      FROM transaction_categories
      GROUP BY transaction_id
    )
    SELECT
      c.id AS categoryId,
      c.name AS categoryName,
      c.group_type AS groupType,
      COALESCE(SUM(t.amount / cc.n), 0) AS actual
    FROM transaction_categories tc
    INNER JOIN transactions t ON t.id = tc.transaction_id
    INNER JOIN categories c   ON c.id = tc.category_id
    INNER JOIN cat_counts cc  ON cc.transaction_id = t.id
    WHERE ${dateFilter}
      ${accountFilter.sql ? `AND ${accountFilter.sql}` : ''}
    GROUP BY c.id
  `).all(...accountFilter.params) as BudgetActualRow[]
  return rows
}

export function copyBudgetsFromYear(fromYear: string, toYear: string) {
  const db = initializeDatabase()
  const result = db.prepare(`
    INSERT OR IGNORE INTO budgets (category_id, period, cadence, amount, notes)
    SELECT category_id, ?, cadence, amount, notes
    FROM budgets
    WHERE period = ?
  `).run(toYear, fromYear) as RunResult
  return { copied: result.changes }
}

export function updateCategoryGroup(id: number, groupType: string, displayOrder?: number) {
  const validGroups = ['income', 'fixed_expense', 'variable_expense', 'savings', 'transfer']
  if (!validGroups.includes(groupType)) {
    return false
  }
  const db = initializeDatabase()
  if (displayOrder !== undefined) {
    db.prepare(`UPDATE categories SET group_type = ?, display_order = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(groupType, displayOrder, id)
  } else {
    db.prepare(`UPDATE categories SET group_type = ?, updated_at = datetime('now') WHERE id = ?`)
      .run(groupType, id)
  }
  return true
}

export function createManualTransaction(input: {
  bookingDate: string
  amount: number
  currency: string
  payee?: string | null
  purpose?: string | null
  account?: string | null
  categoryIds?: number[]
}) {
  const db = initializeDatabase()
  const rawHash = `manual:${crypto.randomBytes(16).toString('hex')}`

  return db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO transactions (account, booking_date, amount, currency, payee, purpose, raw_hash, source)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'manual')
    `).run(
      input.account ?? null,
      input.bookingDate,
      input.amount,
      input.currency,
      input.payee ?? null,
      input.purpose ?? null,
      rawHash
    ) as RunResult

    const id = result.lastInsertRowid as number

    if (input.categoryIds && input.categoryIds.length > 0) {
      const insertCat = db.prepare(`INSERT OR IGNORE INTO transaction_categories (transaction_id, category_id) VALUES (?, ?)`)
      for (const catId of input.categoryIds) {
        insertCat.run(id, catId)
      }
    }

    return id
  })()
}

export function updateManualTransaction(id: number, updates: {
  bookingDate?: string
  amount?: number
  currency?: string
  payee?: string | null
  purpose?: string | null
  account?: string | null
}) {
  const db = initializeDatabase()
  const row = db.prepare(`SELECT source FROM transactions WHERE id = ?`).get(id) as { source: string } | undefined
  if (!row) {
    return false
  }

  const current = db.prepare(`
    SELECT account, booking_date as bookingDate, amount, currency, payee, purpose
    FROM transactions WHERE id = ?
  `).get(id) as { account: string | null; bookingDate: string; amount: number; currency: string; payee: string | null; purpose: string | null } | undefined

  if (!current) return false

  db.prepare(`
    UPDATE transactions
    SET account = ?, booking_date = ?, amount = ?, currency = ?, payee = ?, purpose = ?, updated_at = datetime('now')
    WHERE id = ? AND source = 'manual'
  `).run(
    updates.account !== undefined ? updates.account : current.account,
    updates.bookingDate ?? current.bookingDate,
    updates.amount ?? current.amount,
    updates.currency ?? current.currency,
    updates.payee !== undefined ? updates.payee : current.payee,
    updates.purpose !== undefined ? updates.purpose : current.purpose,
    id
  )
  return true
}

export function clearTransactions() {
  const db = initializeDatabase()
  db.transaction(() => {
    db.exec(`
      DELETE FROM transaction_tags;
      DELETE FROM ai_tag_suggestions;
      DELETE FROM transaction_categories;
      DELETE FROM transactions;
      DELETE FROM imports;
    `)
  })()
}

// Lean best-practice taxonomy: categories answer "what kind of spending".
// Merchant-level detail (Netflix, Degiro, ...) belongs to rules/recurring
// detection, direction detail (DKB→ING) to accounts — not to categories.
const SEED_CATEGORIES: Array<[name: string, color: string, groupType: string]> = [
  ['Salary',              '#4f46e5', 'income'],
  ['Other Income',        '#6fd1ff', 'income'],
  ['Rent',                '#6366f1', 'fixed_expense'],
  ['Utilities & Internet','#0ea5e9', 'fixed_expense'],
  ['Insurance',           '#8b5cf6', 'fixed_expense'],
  ['Subscriptions',       '#f43f5e', 'fixed_expense'],
  ['Groceries',           '#7ddc7d', 'variable_expense'],
  ['Transport',           '#14b8a6', 'variable_expense'],
  ['Dining Out',          '#f59e0b', 'variable_expense'],
  ['Shopping',            '#ec4899', 'variable_expense'],
  ['Leisure & Travel',    '#3b82f6', 'variable_expense'],
  ['Savings',             '#10b981', 'savings'],
  ['Investments',         '#059669', 'savings'],
  ['Transfer',            '#9aa0a6', 'transfer'],
]

export function clearAndResetData() {
  const db = initializeDatabase()

  db.transaction(() => {
    db.exec(`
      DELETE FROM transaction_tags;
      DELETE FROM ai_tag_suggestions;
      DELETE FROM rule_tags;
      DELETE FROM tags;
      DELETE FROM transaction_categories;
      DELETE FROM transactions;
      DELETE FROM imports;
      DELETE FROM rules;
      DELETE FROM budgets;
      DELETE FROM ai_suggestions;
      DELETE FROM ai_requests;
      DELETE FROM chat_sessions;
      DELETE FROM categories;
      DELETE FROM accounts;
    `)

    const insertCategory = db.prepare(
      `INSERT INTO categories (name, color, group_type, display_order) VALUES (?, ?, ?, ?)`
    )
    SEED_CATEGORIES.forEach(([name, color, groupType], index) => {
      insertCategory.run(name, color, groupType, index)
    })
  })()
}

