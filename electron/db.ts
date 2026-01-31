import path from 'node:path'
import { app } from 'electron'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3') as typeof import('better-sqlite3')

type DatabaseInstance = import('better-sqlite3').Database
type RunResult = import('better-sqlite3').RunResult

const SCHEMA_VERSION = 7
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
  totalSpend: number
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

export function getDashboardSummary(month: string): DashboardSummaryRow {
  const db = initializeDatabase()
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
          ) as categorizedCount,
          (
            SELECT COUNT(1)
            FROM transactions t3
            LEFT JOIN transaction_categories tc3
              ON tc3.transaction_id = t3.id
            WHERE tc3.transaction_id IS NULL
              AND substr(t3.booking_date, 1, 7) = ?
          ) as uncategorizedCount
        FROM transactions t
        WHERE substr(t.booking_date, 1, 7) = ?
      `
    )
    .get(month, month, month, month) as DashboardSummaryRow | undefined

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

export function listDashboardCategorySpend(month: string) {
  const db = initializeDatabase()
  const rows = db
    .prepare(
      `
        SELECT
          c.id as categoryId,
          c.name as categoryName,
          COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) as totalSpend,
          COUNT(1) as transactionCount
        FROM transaction_categories tc
        INNER JOIN transactions t
          ON t.id = tc.transaction_id
        INNER JOIN categories c
          ON c.id = tc.category_id
        WHERE substr(t.booking_date, 1, 7) = ?
        GROUP BY c.id, c.name
        ORDER BY totalSpend DESC, c.name ASC
      `
    )
    .all(month) as DashboardCategorySpendRow[]

  return rows
}

export function listDashboardTrend(months = 6) {
  const db = initializeDatabase()
  const rows = db
    .prepare(
      `
        SELECT
          substr(booking_date, 1, 7) as month,
          COALESCE(SUM(CASE WHEN amount < 0 THEN -amount ELSE 0 END), 0) as totalSpend,
          COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) as totalIncome,
          COALESCE(SUM(amount), 0) as net
        FROM transactions
        GROUP BY month
        ORDER BY month DESC
        LIMIT ?
      `
    )
    .all(months) as DashboardTrendRow[]

  return rows
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

export type RuleRow = {
  id: number
  matcherType: string
  matcherValue: string
  categoryId: number
  priority: number
  isActive: number
}

export function listRules() {
  const db = initializeDatabase()
  const rows = db
    .prepare(
      `
        SELECT
          id,
          matcher_type as matcherType,
          matcher_value as matcherValue,
          category_id as categoryId,
          priority,
          is_active as isActive
        FROM rules
        ORDER BY priority DESC, id DESC
      `
    )
    .all() as RuleRow[]

  return rows
}

export type AiSettingsRow = {
  id: number
  model: string
  enabled: number
  confidenceThreshold: number
  inputCostPer1M: number | null
  outputCostPer1M: number | null
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
          output_cost_per_1m as outputCostPer1M
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
        VALUES (1, 'gpt-4o-mini-2024-07-18', 0, 0.85, 0.15, 0.6)
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
}) {
  const db = initializeDatabase()
  const current = getAiSettings()
  const next = {
    model: updates.model ?? current.model,
    enabled: updates.enabled ?? current.enabled,
    confidenceThreshold: updates.confidenceThreshold ?? current.confidenceThreshold,
    inputCostPer1M: updates.inputCostPer1M ?? current.inputCostPer1M,
    outputCostPer1M: updates.outputCostPer1M ?? current.outputCostPer1M,
  }

  db.prepare(
    `
      UPDATE ai_settings
      SET model = ?,
          enabled = ?,
          confidence_threshold = ?,
          input_cost_per_1m = ?,
          output_cost_per_1m = ?,
          updated_at = datetime('now')
      WHERE id = 1
    `
  ).run(
    next.model,
    next.enabled,
    next.confidenceThreshold,
    next.inputCostPer1M,
    next.outputCostPer1M
  )

  return getAiSettings()
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

export function listAiRequests(limit = 100) {
  const db = initializeDatabase()
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
        LIMIT ?
      `
    )
    .all(limit) as AiRequestRow[]
  return rows
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

export function createRule(input: {
  matcherType: string
  matcherValue: string
  categoryId: number
  priority?: number
  isActive?: number
}) {
  const db = initializeDatabase()
  const stmt = db.prepare(
    `
      INSERT INTO rules (
        matcher_type,
        matcher_value,
        category_id,
        priority,
        is_active
      ) VALUES (?, ?, ?, ?, ?)
    `
  )
  const result = stmt.run(
    input.matcherType,
    input.matcherValue,
    input.categoryId,
    input.priority ?? 100,
    input.isActive ?? 1
  ) as RunResult

  return result.lastInsertRowid as number
}

export function updateRule(
  id: number,
  updates: Partial<{
    matcherType: string
    matcherValue: string
    categoryId: number
    priority: number
    isActive: number
  }>
) {
  const db = initializeDatabase()
  const current = db
    .prepare(
      `
        SELECT
          matcher_type as matcherType,
          matcher_value as matcherValue,
          category_id as categoryId,
          priority,
          is_active as isActive
        FROM rules
        WHERE id = ?
      `
    )
    .get(id) as RuleRow | undefined

  if (!current) {
    return false
  }

  const next = {
    matcherType: updates.matcherType ?? current.matcherType,
    matcherValue: updates.matcherValue ?? current.matcherValue,
    categoryId: updates.categoryId ?? current.categoryId,
    priority: updates.priority ?? current.priority,
    isActive: updates.isActive ?? current.isActive,
  }

  db.prepare(
    `
      UPDATE rules
      SET matcher_type = ?,
          matcher_value = ?,
          category_id = ?,
          priority = ?,
          is_active = ?,
          updated_at = datetime('now')
      WHERE id = ?
    `
  ).run(
    next.matcherType,
    next.matcherValue,
    next.categoryId,
    next.priority,
    next.isActive,
    id
  )

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
}

function matchesRule(rule: RuleRow, tx: RuleMatchTransaction) {
  const value = rule.matcherValue.trim()
  if (!value) {
    return false
  }

  switch (rule.matcherType) {
    case 'payee': {
      return (tx.payee ?? '').toLowerCase().includes(value.toLowerCase())
    }
    case 'purpose': {
      return (tx.purpose ?? '').toLowerCase().includes(value.toLowerCase())
    }
    case 'iban': {
      return (tx.iban ?? '').toLowerCase().includes(value.toLowerCase())
    }
    case 'bic': {
      return (tx.bic ?? '').toLowerCase().includes(value.toLowerCase())
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
          matcher_value as matcherValue,
          category_id as categoryId,
          priority,
          is_active as isActive
        FROM rules
        WHERE is_active = 1
        ORDER BY priority DESC, id DESC
      `
    )
    .all() as RuleRow[]

  if (rules.length === 0) {
    return { applied: 0, transactionsMatched: 0 }
  }

  const transactions = db
    .prepare(
      `
        SELECT
          t.id,
          t.amount,
          t.payee,
          t.purpose,
          t.iban,
          t.bic
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
      let matched = false
      for (const rule of rules) {
        if (!matchesRule(rule, tx)) {
          continue
        }
        matched = true
        try {
          insertStmt.run(tx.id, rule.categoryId)
          applied += 1
        } catch (error) {
          const message = error instanceof Error ? error.message : ''
          if (!message.includes('UNIQUE constraint failed')) {
            throw error
          }
        }
      }
      if (matched) {
        transactionsMatched += 1
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
