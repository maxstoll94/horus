import require$$0 from "fs";
import require$$1 from "path";
import require$$2 from "os";
import require$$3 from "crypto";
import { app, BrowserWindow, ipcMain, dialog } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readFile } from "node:fs/promises";
import crypto from "node:crypto";
var config = {};
var main = { exports: {} };
const version = "17.2.3";
const require$$4 = {
  version
};
var hasRequiredMain;
function requireMain() {
  if (hasRequiredMain) return main.exports;
  hasRequiredMain = 1;
  const fs = require$$0;
  const path2 = require$$1;
  const os = require$$2;
  const crypto2 = require$$3;
  const packageJson = require$$4;
  const version2 = packageJson.version;
  const TIPS = [
    "🔐 encrypt with Dotenvx: https://dotenvx.com",
    "🔐 prevent committing .env to code: https://dotenvx.com/precommit",
    "🔐 prevent building .env in docker: https://dotenvx.com/prebuild",
    "📡 add observability to secrets: https://dotenvx.com/ops",
    "👥 sync secrets across teammates & machines: https://dotenvx.com/ops",
    "🗂️ backup and recover secrets: https://dotenvx.com/ops",
    "✅ audit secrets and track compliance: https://dotenvx.com/ops",
    "🔄 add secrets lifecycle management: https://dotenvx.com/ops",
    "🔑 add access controls to secrets: https://dotenvx.com/ops",
    "🛠️  run anywhere with `dotenvx run -- yourcommand`",
    "⚙️  specify custom .env file path with { path: '/custom/path/.env' }",
    "⚙️  enable debug logging with { debug: true }",
    "⚙️  override existing env vars with { override: true }",
    "⚙️  suppress all logs with { quiet: true }",
    "⚙️  write to custom object with { processEnv: myObject }",
    "⚙️  load multiple .env files with { path: ['.env.local', '.env'] }"
  ];
  function _getRandomTip() {
    return TIPS[Math.floor(Math.random() * TIPS.length)];
  }
  function parseBoolean(value) {
    if (typeof value === "string") {
      return !["false", "0", "no", "off", ""].includes(value.toLowerCase());
    }
    return Boolean(value);
  }
  function supportsAnsi() {
    return process.stdout.isTTY;
  }
  function dim(text) {
    return supportsAnsi() ? `\x1B[2m${text}\x1B[0m` : text;
  }
  const LINE = /(?:^|^)\s*(?:export\s+)?([\w.-]+)(?:\s*=\s*?|:\s+?)(\s*'(?:\\'|[^'])*'|\s*"(?:\\"|[^"])*"|\s*`(?:\\`|[^`])*`|[^#\r\n]+)?\s*(?:#.*)?(?:$|$)/mg;
  function parse2(src) {
    const obj = {};
    let lines = src.toString();
    lines = lines.replace(/\r\n?/mg, "\n");
    let match;
    while ((match = LINE.exec(lines)) != null) {
      const key = match[1];
      let value = match[2] || "";
      value = value.trim();
      const maybeQuote = value[0];
      value = value.replace(/^(['"`])([\s\S]*)\1$/mg, "$2");
      if (maybeQuote === '"') {
        value = value.replace(/\\n/g, "\n");
        value = value.replace(/\\r/g, "\r");
      }
      obj[key] = value;
    }
    return obj;
  }
  function _parseVault(options) {
    options = options || {};
    const vaultPath = _vaultPath(options);
    options.path = vaultPath;
    const result = DotenvModule.configDotenv(options);
    if (!result.parsed) {
      const err = new Error(`MISSING_DATA: Cannot parse ${vaultPath} for an unknown reason`);
      err.code = "MISSING_DATA";
      throw err;
    }
    const keys = _dotenvKey(options).split(",");
    const length = keys.length;
    let decrypted;
    for (let i = 0; i < length; i++) {
      try {
        const key = keys[i].trim();
        const attrs = _instructions(result, key);
        decrypted = DotenvModule.decrypt(attrs.ciphertext, attrs.key);
        break;
      } catch (error) {
        if (i + 1 >= length) {
          throw error;
        }
      }
    }
    return DotenvModule.parse(decrypted);
  }
  function _warn(message) {
    console.error(`[dotenv@${version2}][WARN] ${message}`);
  }
  function _debug(message) {
    console.log(`[dotenv@${version2}][DEBUG] ${message}`);
  }
  function _log(message) {
    console.log(`[dotenv@${version2}] ${message}`);
  }
  function _dotenvKey(options) {
    if (options && options.DOTENV_KEY && options.DOTENV_KEY.length > 0) {
      return options.DOTENV_KEY;
    }
    if (process.env.DOTENV_KEY && process.env.DOTENV_KEY.length > 0) {
      return process.env.DOTENV_KEY;
    }
    return "";
  }
  function _instructions(result, dotenvKey) {
    let uri;
    try {
      uri = new URL(dotenvKey);
    } catch (error) {
      if (error.code === "ERR_INVALID_URL") {
        const err = new Error("INVALID_DOTENV_KEY: Wrong format. Must be in valid uri format like dotenv://:key_1234@dotenvx.com/vault/.env.vault?environment=development");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      }
      throw error;
    }
    const key = uri.password;
    if (!key) {
      const err = new Error("INVALID_DOTENV_KEY: Missing key part");
      err.code = "INVALID_DOTENV_KEY";
      throw err;
    }
    const environment = uri.searchParams.get("environment");
    if (!environment) {
      const err = new Error("INVALID_DOTENV_KEY: Missing environment part");
      err.code = "INVALID_DOTENV_KEY";
      throw err;
    }
    const environmentKey = `DOTENV_VAULT_${environment.toUpperCase()}`;
    const ciphertext = result.parsed[environmentKey];
    if (!ciphertext) {
      const err = new Error(`NOT_FOUND_DOTENV_ENVIRONMENT: Cannot locate environment ${environmentKey} in your .env.vault file.`);
      err.code = "NOT_FOUND_DOTENV_ENVIRONMENT";
      throw err;
    }
    return { ciphertext, key };
  }
  function _vaultPath(options) {
    let possibleVaultPath = null;
    if (options && options.path && options.path.length > 0) {
      if (Array.isArray(options.path)) {
        for (const filepath of options.path) {
          if (fs.existsSync(filepath)) {
            possibleVaultPath = filepath.endsWith(".vault") ? filepath : `${filepath}.vault`;
          }
        }
      } else {
        possibleVaultPath = options.path.endsWith(".vault") ? options.path : `${options.path}.vault`;
      }
    } else {
      possibleVaultPath = path2.resolve(process.cwd(), ".env.vault");
    }
    if (fs.existsSync(possibleVaultPath)) {
      return possibleVaultPath;
    }
    return null;
  }
  function _resolveHome(envPath) {
    return envPath[0] === "~" ? path2.join(os.homedir(), envPath.slice(1)) : envPath;
  }
  function _configVault(options) {
    const debug = parseBoolean(process.env.DOTENV_CONFIG_DEBUG || options && options.debug);
    const quiet = parseBoolean(process.env.DOTENV_CONFIG_QUIET || options && options.quiet);
    if (debug || !quiet) {
      _log("Loading env from encrypted .env.vault");
    }
    const parsed = DotenvModule._parseVault(options);
    let processEnv = process.env;
    if (options && options.processEnv != null) {
      processEnv = options.processEnv;
    }
    DotenvModule.populate(processEnv, parsed, options);
    return { parsed };
  }
  function configDotenv(options) {
    const dotenvPath = path2.resolve(process.cwd(), ".env");
    let encoding = "utf8";
    let processEnv = process.env;
    if (options && options.processEnv != null) {
      processEnv = options.processEnv;
    }
    let debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || options && options.debug);
    let quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || options && options.quiet);
    if (options && options.encoding) {
      encoding = options.encoding;
    } else {
      if (debug) {
        _debug("No encoding is specified. UTF-8 is used by default");
      }
    }
    let optionPaths = [dotenvPath];
    if (options && options.path) {
      if (!Array.isArray(options.path)) {
        optionPaths = [_resolveHome(options.path)];
      } else {
        optionPaths = [];
        for (const filepath of options.path) {
          optionPaths.push(_resolveHome(filepath));
        }
      }
    }
    let lastError;
    const parsedAll = {};
    for (const path22 of optionPaths) {
      try {
        const parsed = DotenvModule.parse(fs.readFileSync(path22, { encoding }));
        DotenvModule.populate(parsedAll, parsed, options);
      } catch (e) {
        if (debug) {
          _debug(`Failed to load ${path22} ${e.message}`);
        }
        lastError = e;
      }
    }
    const populated = DotenvModule.populate(processEnv, parsedAll, options);
    debug = parseBoolean(processEnv.DOTENV_CONFIG_DEBUG || debug);
    quiet = parseBoolean(processEnv.DOTENV_CONFIG_QUIET || quiet);
    if (debug || !quiet) {
      const keysCount = Object.keys(populated).length;
      const shortPaths = [];
      for (const filePath of optionPaths) {
        try {
          const relative = path2.relative(process.cwd(), filePath);
          shortPaths.push(relative);
        } catch (e) {
          if (debug) {
            _debug(`Failed to load ${filePath} ${e.message}`);
          }
          lastError = e;
        }
      }
      _log(`injecting env (${keysCount}) from ${shortPaths.join(",")} ${dim(`-- tip: ${_getRandomTip()}`)}`);
    }
    if (lastError) {
      return { parsed: parsedAll, error: lastError };
    } else {
      return { parsed: parsedAll };
    }
  }
  function config2(options) {
    if (_dotenvKey(options).length === 0) {
      return DotenvModule.configDotenv(options);
    }
    const vaultPath = _vaultPath(options);
    if (!vaultPath) {
      _warn(`You set DOTENV_KEY but you are missing a .env.vault file at ${vaultPath}. Did you forget to build it?`);
      return DotenvModule.configDotenv(options);
    }
    return DotenvModule._configVault(options);
  }
  function decrypt(encrypted, keyStr) {
    const key = Buffer.from(keyStr.slice(-64), "hex");
    let ciphertext = Buffer.from(encrypted, "base64");
    const nonce = ciphertext.subarray(0, 12);
    const authTag = ciphertext.subarray(-16);
    ciphertext = ciphertext.subarray(12, -16);
    try {
      const aesgcm = crypto2.createDecipheriv("aes-256-gcm", key, nonce);
      aesgcm.setAuthTag(authTag);
      return `${aesgcm.update(ciphertext)}${aesgcm.final()}`;
    } catch (error) {
      const isRange = error instanceof RangeError;
      const invalidKeyLength = error.message === "Invalid key length";
      const decryptionFailed = error.message === "Unsupported state or unable to authenticate data";
      if (isRange || invalidKeyLength) {
        const err = new Error("INVALID_DOTENV_KEY: It must be 64 characters long (or more)");
        err.code = "INVALID_DOTENV_KEY";
        throw err;
      } else if (decryptionFailed) {
        const err = new Error("DECRYPTION_FAILED: Please check your DOTENV_KEY");
        err.code = "DECRYPTION_FAILED";
        throw err;
      } else {
        throw error;
      }
    }
  }
  function populate(processEnv, parsed, options = {}) {
    const debug = Boolean(options && options.debug);
    const override = Boolean(options && options.override);
    const populated = {};
    if (typeof parsed !== "object") {
      const err = new Error("OBJECT_REQUIRED: Please check the processEnv argument being passed to populate");
      err.code = "OBJECT_REQUIRED";
      throw err;
    }
    for (const key of Object.keys(parsed)) {
      if (Object.prototype.hasOwnProperty.call(processEnv, key)) {
        if (override === true) {
          processEnv[key] = parsed[key];
          populated[key] = parsed[key];
        }
        if (debug) {
          if (override === true) {
            _debug(`"${key}" is already defined and WAS overwritten`);
          } else {
            _debug(`"${key}" is already defined and was NOT overwritten`);
          }
        }
      } else {
        processEnv[key] = parsed[key];
        populated[key] = parsed[key];
      }
    }
    return populated;
  }
  const DotenvModule = {
    configDotenv,
    _configVault,
    _parseVault,
    config: config2,
    decrypt,
    parse: parse2,
    populate
  };
  main.exports.configDotenv = DotenvModule.configDotenv;
  main.exports._configVault = DotenvModule._configVault;
  main.exports._parseVault = DotenvModule._parseVault;
  main.exports.config = DotenvModule.config;
  main.exports.decrypt = DotenvModule.decrypt;
  main.exports.parse = DotenvModule.parse;
  main.exports.populate = DotenvModule.populate;
  main.exports = DotenvModule;
  return main.exports;
}
var envOptions;
var hasRequiredEnvOptions;
function requireEnvOptions() {
  if (hasRequiredEnvOptions) return envOptions;
  hasRequiredEnvOptions = 1;
  const options = {};
  if (process.env.DOTENV_CONFIG_ENCODING != null) {
    options.encoding = process.env.DOTENV_CONFIG_ENCODING;
  }
  if (process.env.DOTENV_CONFIG_PATH != null) {
    options.path = process.env.DOTENV_CONFIG_PATH;
  }
  if (process.env.DOTENV_CONFIG_QUIET != null) {
    options.quiet = process.env.DOTENV_CONFIG_QUIET;
  }
  if (process.env.DOTENV_CONFIG_DEBUG != null) {
    options.debug = process.env.DOTENV_CONFIG_DEBUG;
  }
  if (process.env.DOTENV_CONFIG_OVERRIDE != null) {
    options.override = process.env.DOTENV_CONFIG_OVERRIDE;
  }
  if (process.env.DOTENV_CONFIG_DOTENV_KEY != null) {
    options.DOTENV_KEY = process.env.DOTENV_CONFIG_DOTENV_KEY;
  }
  envOptions = options;
  return envOptions;
}
var cliOptions;
var hasRequiredCliOptions;
function requireCliOptions() {
  if (hasRequiredCliOptions) return cliOptions;
  hasRequiredCliOptions = 1;
  const re = /^dotenv_config_(encoding|path|quiet|debug|override|DOTENV_KEY)=(.+)$/;
  cliOptions = function optionMatcher(args) {
    const options = args.reduce(function(acc, cur) {
      const matches = cur.match(re);
      if (matches) {
        acc[matches[1]] = matches[2];
      }
      return acc;
    }, {});
    if (!("quiet" in options)) {
      options.quiet = "true";
    }
    return options;
  };
  return cliOptions;
}
var hasRequiredConfig;
function requireConfig() {
  if (hasRequiredConfig) return config;
  hasRequiredConfig = 1;
  (function() {
    requireMain().config(
      Object.assign(
        {},
        requireEnvOptions(),
        requireCliOptions()(process.argv)
      )
    );
  })();
  return config;
}
requireConfig();
const require$1 = createRequire(import.meta.url);
const Database = require$1("better-sqlite3");
const SCHEMA_VERSION = 8;
let dbInstance = null;
function getDatabasePath() {
  return path.join(app.getPath("userData"), "horus.db");
}
function getCurrentSchemaVersion(db) {
  const row = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
  return row?.version ?? 0;
}
function applyMigrations(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const currentVersion = getCurrentSchemaVersion(db);
  if (currentVersion >= SCHEMA_VERSION) {
    return;
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
      `);
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
      `);
      const columns = db.prepare(`PRAGMA table_info(transactions);`).all();
      const hasCategoryColumn = columns.some((col) => col.name === "category_id");
      const tableExists = (name) => db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name = ?`).get(name);
      if (hasCategoryColumn) {
        db.exec(`
          INSERT OR IGNORE INTO transaction_categories (transaction_id, category_id)
          SELECT id, category_id FROM transactions WHERE category_id IS NOT NULL;
        `);
        if (tableExists("transactions_old")) {
          db.exec(`DROP TABLE transactions_old;`);
        }
        db.exec(`ALTER TABLE transactions RENAME TO transactions_old;`);
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
        `);
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
        `);
        db.exec(`DROP TABLE transactions_old;`);
      } else if (tableExists("transactions_old")) {
        db.exec(`
          INSERT OR IGNORE INTO transaction_categories (transaction_id, category_id)
          SELECT id, category_id FROM transactions_old WHERE category_id IS NOT NULL;
        `);
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
        `);
        db.exec(`DROP TABLE transactions_old;`);
      }
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_transactions_booking_date
          ON transactions (booking_date);
        CREATE INDEX IF NOT EXISTS idx_transaction_categories_tx
          ON transaction_categories (transaction_id);
        CREATE INDEX IF NOT EXISTS idx_transaction_categories_cat
          ON transaction_categories (category_id);
        INSERT INTO schema_migrations (version) VALUES (2);
      `);
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
      `);
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
      `);
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
      `);
    }
    if (currentVersion < 6) {
      const columns = db.prepare(`PRAGMA table_info(ai_requests);`).all();
      const existing = new Set(columns.map((col) => col.name));
      const addColumn = (name, type) => {
        if (!existing.has(name)) {
          db.exec(`ALTER TABLE ai_requests ADD COLUMN ${name} ${type};`);
        }
      };
      addColumn("input_tokens", "INTEGER");
      addColumn("output_tokens", "INTEGER");
      addColumn("total_tokens", "INTEGER");
      addColumn("cost_usd", "REAL");
      db.exec(`INSERT INTO schema_migrations (version) VALUES (6);`);
    }
    if (currentVersion < 7) {
      const columns = db.prepare(`PRAGMA table_info(ai_settings);`).all();
      const existing = new Set(columns.map((col) => col.name));
      const addColumn = (name, type) => {
        if (!existing.has(name)) {
          db.exec(`ALTER TABLE ai_settings ADD COLUMN ${name} ${type};`);
        }
      };
      addColumn("input_cost_per_1m", "REAL");
      addColumn("output_cost_per_1m", "REAL");
      db.exec(`
        UPDATE ai_settings
        SET input_cost_per_1m = COALESCE(input_cost_per_1m, 0.15),
            output_cost_per_1m = COALESCE(output_cost_per_1m, 0.6)
        WHERE id = 1
      `);
      db.exec(`INSERT INTO schema_migrations (version) VALUES (7);`);
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
      `);
      db.exec(`INSERT INTO schema_migrations (version) VALUES (8);`);
    }
  })();
}
function initializeDatabase() {
  if (dbInstance) {
    return dbInstance;
  }
  const dbPath = getDatabasePath();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  applyMigrations(db);
  dbInstance = db;
  return dbInstance;
}
function closeDatabase() {
  if (!dbInstance) {
    return;
  }
  dbInstance.close();
  dbInstance = null;
}
function getDatabaseInfo() {
  const dbPath = getDatabasePath();
  const db = initializeDatabase();
  const schemaVersion = getCurrentSchemaVersion(db);
  return {
    path: dbPath,
    schemaVersion
  };
}
function insertImport(source, fileName) {
  const db = initializeDatabase();
  const stmt = db.prepare(
    `INSERT INTO imports (source, file_name) VALUES (?, ?)`
  );
  const result = stmt.run(source, fileName);
  return result.lastInsertRowid;
}
function insertTransactions(rows) {
  const db = initializeDatabase();
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
  `);
  let inserted = 0;
  let skipped = 0;
  const transaction = db.transaction((items) => {
    for (const item of items) {
      try {
        insertStmt.run(item);
        inserted += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "";
        if (message.includes("UNIQUE constraint failed: transactions.raw_hash")) {
          skipped += 1;
          continue;
        }
        throw error;
      }
    }
  });
  transaction(rows);
  return { inserted, skipped };
}
function listDashboardMonths() {
  const db = initializeDatabase();
  const rows = db.prepare(
    `
        SELECT DISTINCT substr(booking_date, 1, 7) as month
        FROM transactions
        ORDER BY month DESC
      `
  ).all();
  return rows.map((row) => row.month);
}
function getDashboardSummary(month) {
  const db = initializeDatabase();
  const row = db.prepare(
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
  ).get(month, month, month, month);
  if (!row) {
    return {
      month,
      totalIncome: 0,
      totalSpend: 0,
      net: 0,
      transactionCount: 0,
      categorizedCount: 0,
      uncategorizedCount: 0
    };
  }
  return row;
}
function getDashboardSummaryRange(startMonth, endMonth) {
  const db = initializeDatabase();
  const row = db.prepare(
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
          ) as categorizedCount,
          (
            SELECT COUNT(1)
            FROM transactions t3
            LEFT JOIN transaction_categories tc3
              ON tc3.transaction_id = t3.id
            WHERE tc3.transaction_id IS NULL
              AND substr(t3.booking_date, 1, 7) BETWEEN ? AND ?
          ) as uncategorizedCount
        FROM transactions t
        WHERE substr(t.booking_date, 1, 7) BETWEEN ? AND ?
      `
  ).get(
    `${startMonth} to ${endMonth}`,
    startMonth,
    endMonth,
    startMonth,
    endMonth,
    startMonth,
    endMonth
  );
  if (!row) {
    return {
      month: `${startMonth} to ${endMonth}`,
      totalIncome: 0,
      totalSpend: 0,
      net: 0,
      transactionCount: 0,
      categorizedCount: 0,
      uncategorizedCount: 0
    };
  }
  return row;
}
function listDashboardCategorySpend(month) {
  const db = initializeDatabase();
  const rows = db.prepare(
    `
        SELECT
          c.id as categoryId,
          c.name as categoryName,
          c.color as categoryColor,
          COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) as totalSpend,
          COUNT(1) as transactionCount
        FROM transaction_categories tc
        INNER JOIN transactions t
          ON t.id = tc.transaction_id
        INNER JOIN categories c
          ON c.id = tc.category_id
        WHERE substr(t.booking_date, 1, 7) = ?
          AND t.amount < 0
        GROUP BY c.id, c.name
        ORDER BY totalSpend DESC, c.name ASC
      `
  ).all(month);
  return rows;
}
function listDashboardCategorySpendRange(startMonth, endMonth) {
  const db = initializeDatabase();
  const rows = db.prepare(
    `
        SELECT
          c.id as categoryId,
          c.name as categoryName,
          c.color as categoryColor,
          COALESCE(SUM(CASE WHEN t.amount < 0 THEN -t.amount ELSE 0 END), 0) as totalSpend,
          COUNT(1) as transactionCount
        FROM transaction_categories tc
        INNER JOIN transactions t
          ON t.id = tc.transaction_id
        INNER JOIN categories c
          ON c.id = tc.category_id
        WHERE substr(t.booking_date, 1, 7) BETWEEN ? AND ?
          AND t.amount < 0
        GROUP BY c.id, c.name, c.color
        ORDER BY totalSpend DESC, c.name ASC
      `
  ).all(startMonth, endMonth);
  return rows;
}
function listDashboardTrend(months = 6) {
  const db = initializeDatabase();
  const rows = db.prepare(
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
  ).all(months);
  return rows;
}
function listTransactions(filters = {}) {
  const db = initializeDatabase();
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;
  const rows = db.prepare(
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
  ).all(limit, offset);
  return rows;
}
function listUncategorizedTransactions(filters = {}) {
  const db = initializeDatabase();
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;
  const rows = db.prepare(
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
  ).all(limit, offset);
  return rows;
}
function addTransactionCategory(transactionId, categoryId) {
  const db = initializeDatabase();
  const stmt = db.prepare(
    `INSERT INTO transaction_categories (transaction_id, category_id) VALUES (?, ?)`
  );
  try {
    stmt.run(transactionId, categoryId);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("UNIQUE constraint failed")) {
      return false;
    }
    throw error;
  }
}
function listCategorizedTransactions(filters = {}) {
  const db = initializeDatabase();
  const limit = filters.limit ?? 200;
  const offset = filters.offset ?? 0;
  const categoryIds = Array.isArray(filters.categoryIds) ? filters.categoryIds.filter((id) => Number.isInteger(id)) : [];
  const filterClause = categoryIds.length > 0 ? `WHERE tc.category_id IN (${categoryIds.map(() => "?").join(",")})` : "";
  const total = db.prepare(
    `
        SELECT COUNT(DISTINCT t.id) as total
        FROM transactions t
        INNER JOIN transaction_categories tc
          ON tc.transaction_id = t.id
        ${filterClause}
      `
  ).get(...categoryIds);
  const rows = db.prepare(
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
  ).all(...categoryIds, limit, offset);
  return { rows, total: total?.total ?? 0 };
}
function removeTransactionCategory(transactionId, categoryId) {
  const db = initializeDatabase();
  const stmt = db.prepare(
    `DELETE FROM transaction_categories WHERE transaction_id = ? AND category_id = ?`
  );
  const result = stmt.run(transactionId, categoryId);
  return result.changes > 0;
}
function listCategories() {
  const db = initializeDatabase();
  const rows = db.prepare(
    `
        SELECT
          id,
          name,
          color,
          is_active as isActive
        FROM categories
        ORDER BY name ASC
      `
  ).all();
  return rows;
}
function listRules() {
  const db = initializeDatabase();
  const rows = db.prepare(
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
  ).all();
  return rows;
}
function getAiSettings() {
  const db = initializeDatabase();
  const row = db.prepare(
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
  ).get();
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
    ).run();
    return getAiSettings();
  }
  return row;
}
function updateAiSettings(updates) {
  const db = initializeDatabase();
  const current = getAiSettings();
  const next = {
    model: updates.model ?? current.model,
    enabled: updates.enabled ?? current.enabled,
    confidenceThreshold: updates.confidenceThreshold ?? current.confidenceThreshold,
    inputCostPer1M: updates.inputCostPer1M ?? current.inputCostPer1M,
    outputCostPer1M: updates.outputCostPer1M ?? current.outputCostPer1M
  };
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
  );
  return getAiSettings();
}
function insertAiRequest(input) {
  const db = initializeDatabase();
  const result = db.prepare(
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
  ).run(
    input.model ?? null,
    input.requestPayload ?? null,
    input.responsePayload ?? null,
    input.status,
    input.error ?? null,
    input.inputTokens ?? null,
    input.outputTokens ?? null,
    input.totalTokens ?? null,
    input.costUsd ?? null
  );
  return result.lastInsertRowid;
}
function listAiRequests(limit = 100) {
  const db = initializeDatabase();
  const rows = db.prepare(
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
  ).all(limit);
  return rows;
}
function upsertAiSuggestions(rows) {
  const db = initializeDatabase();
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
  );
  const run = db.transaction((items) => {
    for (const item of items) {
      stmt.run(
        item.transactionId,
        item.categoryId,
        item.confidence,
        item.reason ?? null,
        item.model ?? null
      );
    }
  });
  run(rows);
}
function getAiSuggestionsForTransactions(transactionIds) {
  if (transactionIds.length === 0) {
    return [];
  }
  const db = initializeDatabase();
  const placeholders = transactionIds.map(() => "?").join(", ");
  const rows = db.prepare(
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
  ).all(...transactionIds);
  return rows;
}
function createRule(input) {
  const db = initializeDatabase();
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
  );
  const result = stmt.run(
    input.matcherType,
    input.matcherValue,
    input.categoryId,
    input.priority ?? 100,
    input.isActive ?? 1
  );
  return result.lastInsertRowid;
}
function updateRule(id, updates) {
  const db = initializeDatabase();
  const current = db.prepare(
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
  ).get(id);
  if (!current) {
    return false;
  }
  const next = {
    matcherType: updates.matcherType ?? current.matcherType,
    matcherValue: updates.matcherValue ?? current.matcherValue,
    categoryId: updates.categoryId ?? current.categoryId,
    priority: updates.priority ?? current.priority,
    isActive: updates.isActive ?? current.isActive
  };
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
  );
  return true;
}
function deleteRule(id) {
  const db = initializeDatabase();
  const result = db.prepare(`DELETE FROM rules WHERE id = ?`).run(id);
  return result.changes > 0;
}
function matchesRule(rule, tx) {
  const value = rule.matcherValue.trim();
  if (!value) {
    return false;
  }
  switch (rule.matcherType) {
    case "payee": {
      return (tx.payee ?? "").toLowerCase().includes(value.toLowerCase());
    }
    case "purpose": {
      return (tx.purpose ?? "").toLowerCase().includes(value.toLowerCase());
    }
    case "iban": {
      return (tx.iban ?? "").toLowerCase().includes(value.toLowerCase());
    }
    case "bic": {
      return (tx.bic ?? "").toLowerCase().includes(value.toLowerCase());
    }
    case "amount": {
      const target = Number.parseFloat(value.replace(",", "."));
      if (Number.isNaN(target)) {
        return false;
      }
      return Math.abs(tx.amount - target) < 1e-4;
    }
    case "direction": {
      const normalized = value.toLowerCase();
      const isIncome = tx.amount > 0;
      if (["in", "income", "credit", "+", "plus"].includes(normalized)) {
        return isIncome;
      }
      if (["out", "expense", "debit", "-", "minus"].includes(normalized)) {
        return !isIncome;
      }
      return false;
    }
    default:
      return false;
  }
}
function applyRulesToUncategorized() {
  const db = initializeDatabase();
  const rules = db.prepare(
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
  ).all();
  if (rules.length === 0) {
    return { applied: 0, transactionsMatched: 0 };
  }
  const transactions = db.prepare(
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
  ).all();
  if (transactions.length === 0) {
    return { applied: 0, transactionsMatched: 0 };
  }
  const insertStmt = db.prepare(
    `INSERT INTO transaction_categories (transaction_id, category_id) VALUES (?, ?)`
  );
  let applied = 0;
  let transactionsMatched = 0;
  const run = db.transaction(() => {
    for (const tx of transactions) {
      let matched = false;
      for (const rule of rules) {
        if (!matchesRule(rule, tx)) {
          continue;
        }
        matched = true;
        try {
          insertStmt.run(tx.id, rule.categoryId);
          applied += 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : "";
          if (!message.includes("UNIQUE constraint failed")) {
            throw error;
          }
        }
      }
      if (matched) {
        transactionsMatched += 1;
      }
    }
  });
  run();
  return { applied, transactionsMatched };
}
function createCategory(name, color) {
  const db = initializeDatabase();
  const stmt = db.prepare(
    `INSERT INTO categories (name, color) VALUES (?, ?)`
  );
  const result = stmt.run(name.trim(), color ?? null);
  return result.lastInsertRowid;
}
function updateCategory(id, updates) {
  const db = initializeDatabase();
  const current = db.prepare(
    `
        SELECT name, color, is_active as isActive
        FROM categories
        WHERE id = ?
      `
  ).get(id);
  if (!current) {
    return false;
  }
  const nextName = updates.name?.trim() ?? current.name;
  const nextColor = updates.color !== void 0 ? updates.color : current.color;
  const nextIsActive = updates.isActive !== void 0 ? updates.isActive : current.isActive;
  db.prepare(
    `
      UPDATE categories
      SET name = ?, color = ?, is_active = ?, updated_at = datetime('now')
      WHERE id = ?
    `
  ).run(nextName, nextColor, nextIsActive, id);
  return true;
}
function deleteCategory(id) {
  const db = initializeDatabase();
  try {
    const result = db.prepare(`DELETE FROM categories WHERE id = ?`).run(id);
    return { deleted: result.changes > 0, archived: false };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("FOREIGN KEY")) {
      db.prepare(
        `
          UPDATE categories
          SET is_active = 0,
              updated_at = datetime('now')
          WHERE id = ?
        `
      ).run(id);
      return { deleted: false, archived: true };
    }
    throw error;
  }
}
class CsvError extends Error {
  constructor(code, message, options, ...contexts) {
    if (Array.isArray(message)) message = message.join(" ").trim();
    super(message);
    if (Error.captureStackTrace !== void 0) {
      Error.captureStackTrace(this, CsvError);
    }
    this.code = code;
    for (const context of contexts) {
      for (const key in context) {
        const value = context[key];
        this[key] = Buffer.isBuffer(value) ? value.toString(options.encoding) : value == null ? value : JSON.parse(JSON.stringify(value));
      }
    }
  }
}
const is_object = function(obj) {
  return typeof obj === "object" && obj !== null && !Array.isArray(obj);
};
const normalize_columns_array = function(columns) {
  const normalizedColumns = [];
  for (let i = 0, l = columns.length; i < l; i++) {
    const column = columns[i];
    if (column === void 0 || column === null || column === false) {
      normalizedColumns[i] = { disabled: true };
    } else if (typeof column === "string") {
      normalizedColumns[i] = { name: column };
    } else if (is_object(column)) {
      if (typeof column.name !== "string") {
        throw new CsvError("CSV_OPTION_COLUMNS_MISSING_NAME", [
          "Option columns missing name:",
          `property "name" is required at position ${i}`,
          "when column is an object literal"
        ]);
      }
      normalizedColumns[i] = column;
    } else {
      throw new CsvError("CSV_INVALID_COLUMN_DEFINITION", [
        "Invalid column definition:",
        "expect a string or a literal object,",
        `got ${JSON.stringify(column)} at position ${i}`
      ]);
    }
  }
  return normalizedColumns;
};
class ResizeableBuffer {
  constructor(size = 100) {
    this.size = size;
    this.length = 0;
    this.buf = Buffer.allocUnsafe(size);
  }
  prepend(val) {
    if (Buffer.isBuffer(val)) {
      const length = this.length + val.length;
      if (length >= this.size) {
        this.resize();
        if (length >= this.size) {
          throw Error("INVALID_BUFFER_STATE");
        }
      }
      const buf = this.buf;
      this.buf = Buffer.allocUnsafe(this.size);
      val.copy(this.buf, 0);
      buf.copy(this.buf, val.length);
      this.length += val.length;
    } else {
      const length = this.length++;
      if (length === this.size) {
        this.resize();
      }
      const buf = this.clone();
      this.buf[0] = val;
      buf.copy(this.buf, 1, 0, length);
    }
  }
  append(val) {
    const length = this.length++;
    if (length === this.size) {
      this.resize();
    }
    this.buf[length] = val;
  }
  clone() {
    return Buffer.from(this.buf.slice(0, this.length));
  }
  resize() {
    const length = this.length;
    this.size = this.size * 2;
    const buf = Buffer.allocUnsafe(this.size);
    this.buf.copy(buf, 0, 0, length);
    this.buf = buf;
  }
  toString(encoding) {
    if (encoding) {
      return this.buf.slice(0, this.length).toString(encoding);
    } else {
      return Uint8Array.prototype.slice.call(this.buf.slice(0, this.length));
    }
  }
  toJSON() {
    return this.toString("utf8");
  }
  reset() {
    this.length = 0;
  }
}
const np = 12;
const cr$1 = 13;
const nl$1 = 10;
const space = 32;
const tab = 9;
const init_state = function(options) {
  return {
    bomSkipped: false,
    bufBytesStart: 0,
    castField: options.cast_function,
    commenting: false,
    // Current error encountered by a record
    error: void 0,
    enabled: options.from_line === 1,
    escaping: false,
    escapeIsQuote: Buffer.isBuffer(options.escape) && Buffer.isBuffer(options.quote) && Buffer.compare(options.escape, options.quote) === 0,
    // columns can be `false`, `true`, `Array`
    expectedRecordLength: Array.isArray(options.columns) ? options.columns.length : void 0,
    field: new ResizeableBuffer(20),
    firstLineToHeaders: options.cast_first_line_to_header,
    needMoreDataSize: Math.max(
      // Skip if the remaining buffer smaller than comment
      options.comment !== null ? options.comment.length : 0,
      ...options.delimiter.map((delimiter) => delimiter.length),
      // Skip if the remaining buffer can be escape sequence
      options.quote !== null ? options.quote.length : 0
    ),
    previousBuf: void 0,
    quoting: false,
    stop: false,
    rawBuffer: new ResizeableBuffer(100),
    record: [],
    recordHasError: false,
    record_length: 0,
    recordDelimiterMaxLength: options.record_delimiter.length === 0 ? 0 : Math.max(...options.record_delimiter.map((v) => v.length)),
    trimChars: [
      Buffer.from(" ", options.encoding)[0],
      Buffer.from("	", options.encoding)[0]
    ],
    wasQuoting: false,
    wasRowDelimiter: false,
    timchars: [
      Buffer.from(Buffer.from([cr$1], "utf8").toString(), options.encoding),
      Buffer.from(Buffer.from([nl$1], "utf8").toString(), options.encoding),
      Buffer.from(Buffer.from([np], "utf8").toString(), options.encoding),
      Buffer.from(Buffer.from([space], "utf8").toString(), options.encoding),
      Buffer.from(Buffer.from([tab], "utf8").toString(), options.encoding)
    ]
  };
};
const underscore = function(str) {
  return str.replace(/([A-Z])/g, function(_, match) {
    return "_" + match.toLowerCase();
  });
};
const normalize_options = function(opts) {
  const options = {};
  for (const opt in opts) {
    options[underscore(opt)] = opts[opt];
  }
  if (options.encoding === void 0 || options.encoding === true) {
    options.encoding = "utf8";
  } else if (options.encoding === null || options.encoding === false) {
    options.encoding = null;
  } else if (typeof options.encoding !== "string" && options.encoding !== null) {
    throw new CsvError(
      "CSV_INVALID_OPTION_ENCODING",
      [
        "Invalid option encoding:",
        "encoding must be a string or null to return a buffer,",
        `got ${JSON.stringify(options.encoding)}`
      ],
      options
    );
  }
  if (options.bom === void 0 || options.bom === null || options.bom === false) {
    options.bom = false;
  } else if (options.bom !== true) {
    throw new CsvError(
      "CSV_INVALID_OPTION_BOM",
      [
        "Invalid option bom:",
        "bom must be true,",
        `got ${JSON.stringify(options.bom)}`
      ],
      options
    );
  }
  options.cast_function = null;
  if (options.cast === void 0 || options.cast === null || options.cast === false || options.cast === "") {
    options.cast = void 0;
  } else if (typeof options.cast === "function") {
    options.cast_function = options.cast;
    options.cast = true;
  } else if (options.cast !== true) {
    throw new CsvError(
      "CSV_INVALID_OPTION_CAST",
      [
        "Invalid option cast:",
        "cast must be true or a function,",
        `got ${JSON.stringify(options.cast)}`
      ],
      options
    );
  }
  if (options.cast_date === void 0 || options.cast_date === null || options.cast_date === false || options.cast_date === "") {
    options.cast_date = false;
  } else if (options.cast_date === true) {
    options.cast_date = function(value) {
      const date = Date.parse(value);
      return !isNaN(date) ? new Date(date) : value;
    };
  } else if (typeof options.cast_date !== "function") {
    throw new CsvError(
      "CSV_INVALID_OPTION_CAST_DATE",
      [
        "Invalid option cast_date:",
        "cast_date must be true or a function,",
        `got ${JSON.stringify(options.cast_date)}`
      ],
      options
    );
  }
  options.cast_first_line_to_header = void 0;
  if (options.columns === true) {
    options.cast_first_line_to_header = void 0;
  } else if (typeof options.columns === "function") {
    options.cast_first_line_to_header = options.columns;
    options.columns = true;
  } else if (Array.isArray(options.columns)) {
    options.columns = normalize_columns_array(options.columns);
  } else if (options.columns === void 0 || options.columns === null || options.columns === false) {
    options.columns = false;
  } else {
    throw new CsvError(
      "CSV_INVALID_OPTION_COLUMNS",
      [
        "Invalid option columns:",
        "expect an array, a function or true,",
        `got ${JSON.stringify(options.columns)}`
      ],
      options
    );
  }
  if (options.group_columns_by_name === void 0 || options.group_columns_by_name === null || options.group_columns_by_name === false) {
    options.group_columns_by_name = false;
  } else if (options.group_columns_by_name !== true) {
    throw new CsvError(
      "CSV_INVALID_OPTION_GROUP_COLUMNS_BY_NAME",
      [
        "Invalid option group_columns_by_name:",
        "expect an boolean,",
        `got ${JSON.stringify(options.group_columns_by_name)}`
      ],
      options
    );
  } else if (options.columns === false) {
    throw new CsvError(
      "CSV_INVALID_OPTION_GROUP_COLUMNS_BY_NAME",
      [
        "Invalid option group_columns_by_name:",
        "the `columns` mode must be activated."
      ],
      options
    );
  }
  if (options.comment === void 0 || options.comment === null || options.comment === false || options.comment === "") {
    options.comment = null;
  } else {
    if (typeof options.comment === "string") {
      options.comment = Buffer.from(options.comment, options.encoding);
    }
    if (!Buffer.isBuffer(options.comment)) {
      throw new CsvError(
        "CSV_INVALID_OPTION_COMMENT",
        [
          "Invalid option comment:",
          "comment must be a buffer or a string,",
          `got ${JSON.stringify(options.comment)}`
        ],
        options
      );
    }
  }
  if (options.comment_no_infix === void 0 || options.comment_no_infix === null || options.comment_no_infix === false) {
    options.comment_no_infix = false;
  } else if (options.comment_no_infix !== true) {
    throw new CsvError(
      "CSV_INVALID_OPTION_COMMENT",
      [
        "Invalid option comment_no_infix:",
        "value must be a boolean,",
        `got ${JSON.stringify(options.comment_no_infix)}`
      ],
      options
    );
  }
  const delimiter_json = JSON.stringify(options.delimiter);
  if (!Array.isArray(options.delimiter))
    options.delimiter = [options.delimiter];
  if (options.delimiter.length === 0) {
    throw new CsvError(
      "CSV_INVALID_OPTION_DELIMITER",
      [
        "Invalid option delimiter:",
        "delimiter must be a non empty string or buffer or array of string|buffer,",
        `got ${delimiter_json}`
      ],
      options
    );
  }
  options.delimiter = options.delimiter.map(function(delimiter) {
    if (delimiter === void 0 || delimiter === null || delimiter === false) {
      return Buffer.from(",", options.encoding);
    }
    if (typeof delimiter === "string") {
      delimiter = Buffer.from(delimiter, options.encoding);
    }
    if (!Buffer.isBuffer(delimiter) || delimiter.length === 0) {
      throw new CsvError(
        "CSV_INVALID_OPTION_DELIMITER",
        [
          "Invalid option delimiter:",
          "delimiter must be a non empty string or buffer or array of string|buffer,",
          `got ${delimiter_json}`
        ],
        options
      );
    }
    return delimiter;
  });
  if (options.escape === void 0 || options.escape === true) {
    options.escape = Buffer.from('"', options.encoding);
  } else if (typeof options.escape === "string") {
    options.escape = Buffer.from(options.escape, options.encoding);
  } else if (options.escape === null || options.escape === false) {
    options.escape = null;
  }
  if (options.escape !== null) {
    if (!Buffer.isBuffer(options.escape)) {
      throw new Error(
        `Invalid Option: escape must be a buffer, a string or a boolean, got ${JSON.stringify(options.escape)}`
      );
    }
  }
  if (options.from === void 0 || options.from === null) {
    options.from = 1;
  } else {
    if (typeof options.from === "string" && /\d+/.test(options.from)) {
      options.from = parseInt(options.from);
    }
    if (Number.isInteger(options.from)) {
      if (options.from < 0) {
        throw new Error(
          `Invalid Option: from must be a positive integer, got ${JSON.stringify(opts.from)}`
        );
      }
    } else {
      throw new Error(
        `Invalid Option: from must be an integer, got ${JSON.stringify(options.from)}`
      );
    }
  }
  if (options.from_line === void 0 || options.from_line === null) {
    options.from_line = 1;
  } else {
    if (typeof options.from_line === "string" && /\d+/.test(options.from_line)) {
      options.from_line = parseInt(options.from_line);
    }
    if (Number.isInteger(options.from_line)) {
      if (options.from_line <= 0) {
        throw new Error(
          `Invalid Option: from_line must be a positive integer greater than 0, got ${JSON.stringify(opts.from_line)}`
        );
      }
    } else {
      throw new Error(
        `Invalid Option: from_line must be an integer, got ${JSON.stringify(opts.from_line)}`
      );
    }
  }
  if (options.ignore_last_delimiters === void 0 || options.ignore_last_delimiters === null) {
    options.ignore_last_delimiters = false;
  } else if (typeof options.ignore_last_delimiters === "number") {
    options.ignore_last_delimiters = Math.floor(options.ignore_last_delimiters);
    if (options.ignore_last_delimiters === 0) {
      options.ignore_last_delimiters = false;
    }
  } else if (typeof options.ignore_last_delimiters !== "boolean") {
    throw new CsvError(
      "CSV_INVALID_OPTION_IGNORE_LAST_DELIMITERS",
      [
        "Invalid option `ignore_last_delimiters`:",
        "the value must be a boolean value or an integer,",
        `got ${JSON.stringify(options.ignore_last_delimiters)}`
      ],
      options
    );
  }
  if (options.ignore_last_delimiters === true && options.columns === false) {
    throw new CsvError(
      "CSV_IGNORE_LAST_DELIMITERS_REQUIRES_COLUMNS",
      [
        "The option `ignore_last_delimiters`",
        "requires the activation of the `columns` option"
      ],
      options
    );
  }
  if (options.info === void 0 || options.info === null || options.info === false) {
    options.info = false;
  } else if (options.info !== true) {
    throw new Error(
      `Invalid Option: info must be true, got ${JSON.stringify(options.info)}`
    );
  }
  if (options.max_record_size === void 0 || options.max_record_size === null || options.max_record_size === false) {
    options.max_record_size = 0;
  } else if (Number.isInteger(options.max_record_size) && options.max_record_size >= 0) ;
  else if (typeof options.max_record_size === "string" && /\d+/.test(options.max_record_size)) {
    options.max_record_size = parseInt(options.max_record_size);
  } else {
    throw new Error(
      `Invalid Option: max_record_size must be a positive integer, got ${JSON.stringify(options.max_record_size)}`
    );
  }
  if (options.objname === void 0 || options.objname === null || options.objname === false) {
    options.objname = void 0;
  } else if (Buffer.isBuffer(options.objname)) {
    if (options.objname.length === 0) {
      throw new Error(`Invalid Option: objname must be a non empty buffer`);
    }
    if (options.encoding === null) ;
    else {
      options.objname = options.objname.toString(options.encoding);
    }
  } else if (typeof options.objname === "string") {
    if (options.objname.length === 0) {
      throw new Error(`Invalid Option: objname must be a non empty string`);
    }
  } else if (typeof options.objname === "number") ;
  else {
    throw new Error(
      `Invalid Option: objname must be a string or a buffer, got ${options.objname}`
    );
  }
  if (options.objname !== void 0) {
    if (typeof options.objname === "number") {
      if (options.columns !== false) {
        throw Error(
          "Invalid Option: objname index cannot be combined with columns or be defined as a field"
        );
      }
    } else {
      if (options.columns === false) {
        throw Error(
          "Invalid Option: objname field must be combined with columns or be defined as an index"
        );
      }
    }
  }
  if (options.on_record === void 0 || options.on_record === null) {
    options.on_record = void 0;
  } else if (typeof options.on_record !== "function") {
    throw new CsvError(
      "CSV_INVALID_OPTION_ON_RECORD",
      [
        "Invalid option `on_record`:",
        "expect a function,",
        `got ${JSON.stringify(options.on_record)}`
      ],
      options
    );
  }
  if (options.on_skip !== void 0 && options.on_skip !== null && typeof options.on_skip !== "function") {
    throw new Error(
      `Invalid Option: on_skip must be a function, got ${JSON.stringify(options.on_skip)}`
    );
  }
  if (options.quote === null || options.quote === false || options.quote === "") {
    options.quote = null;
  } else {
    if (options.quote === void 0 || options.quote === true) {
      options.quote = Buffer.from('"', options.encoding);
    } else if (typeof options.quote === "string") {
      options.quote = Buffer.from(options.quote, options.encoding);
    }
    if (!Buffer.isBuffer(options.quote)) {
      throw new Error(
        `Invalid Option: quote must be a buffer or a string, got ${JSON.stringify(options.quote)}`
      );
    }
  }
  if (options.raw === void 0 || options.raw === null || options.raw === false) {
    options.raw = false;
  } else if (options.raw !== true) {
    throw new Error(
      `Invalid Option: raw must be true, got ${JSON.stringify(options.raw)}`
    );
  }
  if (options.record_delimiter === void 0) {
    options.record_delimiter = [];
  } else if (typeof options.record_delimiter === "string" || Buffer.isBuffer(options.record_delimiter)) {
    if (options.record_delimiter.length === 0) {
      throw new CsvError(
        "CSV_INVALID_OPTION_RECORD_DELIMITER",
        [
          "Invalid option `record_delimiter`:",
          "value must be a non empty string or buffer,",
          `got ${JSON.stringify(options.record_delimiter)}`
        ],
        options
      );
    }
    options.record_delimiter = [options.record_delimiter];
  } else if (!Array.isArray(options.record_delimiter)) {
    throw new CsvError(
      "CSV_INVALID_OPTION_RECORD_DELIMITER",
      [
        "Invalid option `record_delimiter`:",
        "value must be a string, a buffer or array of string|buffer,",
        `got ${JSON.stringify(options.record_delimiter)}`
      ],
      options
    );
  }
  options.record_delimiter = options.record_delimiter.map(function(rd, i) {
    if (typeof rd !== "string" && !Buffer.isBuffer(rd)) {
      throw new CsvError(
        "CSV_INVALID_OPTION_RECORD_DELIMITER",
        [
          "Invalid option `record_delimiter`:",
          "value must be a string, a buffer or array of string|buffer",
          `at index ${i},`,
          `got ${JSON.stringify(rd)}`
        ],
        options
      );
    } else if (rd.length === 0) {
      throw new CsvError(
        "CSV_INVALID_OPTION_RECORD_DELIMITER",
        [
          "Invalid option `record_delimiter`:",
          "value must be a non empty string or buffer",
          `at index ${i},`,
          `got ${JSON.stringify(rd)}`
        ],
        options
      );
    }
    if (typeof rd === "string") {
      rd = Buffer.from(rd, options.encoding);
    }
    return rd;
  });
  if (typeof options.relax_column_count === "boolean") ;
  else if (options.relax_column_count === void 0 || options.relax_column_count === null) {
    options.relax_column_count = false;
  } else {
    throw new Error(
      `Invalid Option: relax_column_count must be a boolean, got ${JSON.stringify(options.relax_column_count)}`
    );
  }
  if (typeof options.relax_column_count_less === "boolean") ;
  else if (options.relax_column_count_less === void 0 || options.relax_column_count_less === null) {
    options.relax_column_count_less = false;
  } else {
    throw new Error(
      `Invalid Option: relax_column_count_less must be a boolean, got ${JSON.stringify(options.relax_column_count_less)}`
    );
  }
  if (typeof options.relax_column_count_more === "boolean") ;
  else if (options.relax_column_count_more === void 0 || options.relax_column_count_more === null) {
    options.relax_column_count_more = false;
  } else {
    throw new Error(
      `Invalid Option: relax_column_count_more must be a boolean, got ${JSON.stringify(options.relax_column_count_more)}`
    );
  }
  if (typeof options.relax_quotes === "boolean") ;
  else if (options.relax_quotes === void 0 || options.relax_quotes === null) {
    options.relax_quotes = false;
  } else {
    throw new Error(
      `Invalid Option: relax_quotes must be a boolean, got ${JSON.stringify(options.relax_quotes)}`
    );
  }
  if (typeof options.skip_empty_lines === "boolean") ;
  else if (options.skip_empty_lines === void 0 || options.skip_empty_lines === null) {
    options.skip_empty_lines = false;
  } else {
    throw new Error(
      `Invalid Option: skip_empty_lines must be a boolean, got ${JSON.stringify(options.skip_empty_lines)}`
    );
  }
  if (typeof options.skip_records_with_empty_values === "boolean") ;
  else if (options.skip_records_with_empty_values === void 0 || options.skip_records_with_empty_values === null) {
    options.skip_records_with_empty_values = false;
  } else {
    throw new Error(
      `Invalid Option: skip_records_with_empty_values must be a boolean, got ${JSON.stringify(options.skip_records_with_empty_values)}`
    );
  }
  if (typeof options.skip_records_with_error === "boolean") ;
  else if (options.skip_records_with_error === void 0 || options.skip_records_with_error === null) {
    options.skip_records_with_error = false;
  } else {
    throw new Error(
      `Invalid Option: skip_records_with_error must be a boolean, got ${JSON.stringify(options.skip_records_with_error)}`
    );
  }
  if (options.rtrim === void 0 || options.rtrim === null || options.rtrim === false) {
    options.rtrim = false;
  } else if (options.rtrim !== true) {
    throw new Error(
      `Invalid Option: rtrim must be a boolean, got ${JSON.stringify(options.rtrim)}`
    );
  }
  if (options.ltrim === void 0 || options.ltrim === null || options.ltrim === false) {
    options.ltrim = false;
  } else if (options.ltrim !== true) {
    throw new Error(
      `Invalid Option: ltrim must be a boolean, got ${JSON.stringify(options.ltrim)}`
    );
  }
  if (options.trim === void 0 || options.trim === null || options.trim === false) {
    options.trim = false;
  } else if (options.trim !== true) {
    throw new Error(
      `Invalid Option: trim must be a boolean, got ${JSON.stringify(options.trim)}`
    );
  }
  if (options.trim === true && opts.ltrim !== false) {
    options.ltrim = true;
  } else if (options.ltrim !== true) {
    options.ltrim = false;
  }
  if (options.trim === true && opts.rtrim !== false) {
    options.rtrim = true;
  } else if (options.rtrim !== true) {
    options.rtrim = false;
  }
  if (options.to === void 0 || options.to === null) {
    options.to = -1;
  } else if (options.to !== -1) {
    if (typeof options.to === "string" && /\d+/.test(options.to)) {
      options.to = parseInt(options.to);
    }
    if (Number.isInteger(options.to)) {
      if (options.to <= 0) {
        throw new Error(
          `Invalid Option: to must be a positive integer greater than 0, got ${JSON.stringify(opts.to)}`
        );
      }
    } else {
      throw new Error(
        `Invalid Option: to must be an integer, got ${JSON.stringify(opts.to)}`
      );
    }
  }
  if (options.to_line === void 0 || options.to_line === null) {
    options.to_line = -1;
  } else if (options.to_line !== -1) {
    if (typeof options.to_line === "string" && /\d+/.test(options.to_line)) {
      options.to_line = parseInt(options.to_line);
    }
    if (Number.isInteger(options.to_line)) {
      if (options.to_line <= 0) {
        throw new Error(
          `Invalid Option: to_line must be a positive integer greater than 0, got ${JSON.stringify(opts.to_line)}`
        );
      }
    } else {
      throw new Error(
        `Invalid Option: to_line must be an integer, got ${JSON.stringify(opts.to_line)}`
      );
    }
  }
  return options;
};
const isRecordEmpty = function(record) {
  return record.every(
    (field) => field == null || field.toString && field.toString().trim() === ""
  );
};
const cr = 13;
const nl = 10;
const boms = {
  // Note, the following are equals:
  // Buffer.from("\ufeff")
  // Buffer.from([239, 187, 191])
  // Buffer.from('EFBBBF', 'hex')
  utf8: Buffer.from([239, 187, 191]),
  // Note, the following are equals:
  // Buffer.from "\ufeff", 'utf16le
  // Buffer.from([255, 254])
  utf16le: Buffer.from([255, 254])
};
const transform = function(original_options = {}) {
  const info = {
    bytes: 0,
    comment_lines: 0,
    empty_lines: 0,
    invalid_field_length: 0,
    lines: 1,
    records: 0
  };
  const options = normalize_options(original_options);
  return {
    info,
    original_options,
    options,
    state: init_state(options),
    __needMoreData: function(i, bufLen, end) {
      if (end) return false;
      const { encoding, escape, quote } = this.options;
      const { quoting, needMoreDataSize, recordDelimiterMaxLength } = this.state;
      const numOfCharLeft = bufLen - i - 1;
      const requiredLength = Math.max(
        needMoreDataSize,
        // Skip if the remaining buffer smaller than record delimiter
        // If "record_delimiter" is yet to be discovered:
        // 1. It is equals to `[]` and "recordDelimiterMaxLength" equals `0`
        // 2. We set the length to windows line ending in the current encoding
        // Note, that encoding is known from user or bom discovery at that point
        // recordDelimiterMaxLength,
        recordDelimiterMaxLength === 0 ? Buffer.from("\r\n", encoding).length : recordDelimiterMaxLength,
        // Skip if remaining buffer can be an escaped quote
        quoting ? (escape === null ? 0 : escape.length) + quote.length : 0,
        // Skip if remaining buffer can be record delimiter following the closing quote
        quoting ? quote.length + recordDelimiterMaxLength : 0
      );
      return numOfCharLeft < requiredLength;
    },
    // Central parser implementation
    parse: function(nextBuf, end, push, close) {
      const {
        bom,
        comment_no_infix,
        encoding,
        from_line,
        ltrim,
        max_record_size,
        raw,
        relax_quotes,
        rtrim,
        skip_empty_lines,
        to,
        to_line
      } = this.options;
      let { comment, escape, quote, record_delimiter } = this.options;
      const { bomSkipped, previousBuf, rawBuffer, escapeIsQuote } = this.state;
      let buf;
      if (previousBuf === void 0) {
        if (nextBuf === void 0) {
          close();
          return;
        } else {
          buf = nextBuf;
        }
      } else if (previousBuf !== void 0 && nextBuf === void 0) {
        buf = previousBuf;
      } else {
        buf = Buffer.concat([previousBuf, nextBuf]);
      }
      if (bomSkipped === false) {
        if (bom === false) {
          this.state.bomSkipped = true;
        } else if (buf.length < 3) {
          if (end === false) {
            this.state.previousBuf = buf;
            return;
          }
        } else {
          for (const encoding2 in boms) {
            if (boms[encoding2].compare(buf, 0, boms[encoding2].length) === 0) {
              const bomLength = boms[encoding2].length;
              this.state.bufBytesStart += bomLength;
              buf = buf.slice(bomLength);
              const options2 = normalize_options({
                ...this.original_options,
                encoding: encoding2
              });
              for (const key in options2) {
                this.options[key] = options2[key];
              }
              ({ comment, escape, quote } = this.options);
              break;
            }
          }
          this.state.bomSkipped = true;
        }
      }
      const bufLen = buf.length;
      let pos;
      for (pos = 0; pos < bufLen; pos++) {
        if (this.__needMoreData(pos, bufLen, end)) {
          break;
        }
        if (this.state.wasRowDelimiter === true) {
          this.info.lines++;
          this.state.wasRowDelimiter = false;
        }
        if (to_line !== -1 && this.info.lines > to_line) {
          this.state.stop = true;
          close();
          return;
        }
        if (this.state.quoting === false && record_delimiter.length === 0) {
          const record_delimiterCount = this.__autoDiscoverRecordDelimiter(
            buf,
            pos
          );
          if (record_delimiterCount) {
            record_delimiter = this.options.record_delimiter;
          }
        }
        const chr = buf[pos];
        if (raw === true) {
          rawBuffer.append(chr);
        }
        if ((chr === cr || chr === nl) && this.state.wasRowDelimiter === false) {
          this.state.wasRowDelimiter = true;
        }
        if (this.state.escaping === true) {
          this.state.escaping = false;
        } else {
          if (escape !== null && this.state.quoting === true && this.__isEscape(buf, pos, chr) && pos + escape.length < bufLen) {
            if (escapeIsQuote) {
              if (this.__isQuote(buf, pos + escape.length)) {
                this.state.escaping = true;
                pos += escape.length - 1;
                continue;
              }
            } else {
              this.state.escaping = true;
              pos += escape.length - 1;
              continue;
            }
          }
          if (this.state.commenting === false && this.__isQuote(buf, pos)) {
            if (this.state.quoting === true) {
              const nextChr = buf[pos + quote.length];
              const isNextChrTrimable = rtrim && this.__isCharTrimable(buf, pos + quote.length);
              const isNextChrComment = comment !== null && this.__compareBytes(comment, buf, pos + quote.length, nextChr);
              const isNextChrDelimiter = this.__isDelimiter(
                buf,
                pos + quote.length,
                nextChr
              );
              const isNextChrRecordDelimiter = record_delimiter.length === 0 ? this.__autoDiscoverRecordDelimiter(buf, pos + quote.length) : this.__isRecordDelimiter(nextChr, buf, pos + quote.length);
              if (escape !== null && this.__isEscape(buf, pos, chr) && this.__isQuote(buf, pos + escape.length)) {
                pos += escape.length - 1;
              } else if (!nextChr || isNextChrDelimiter || isNextChrRecordDelimiter || isNextChrComment || isNextChrTrimable) {
                this.state.quoting = false;
                this.state.wasQuoting = true;
                pos += quote.length - 1;
                continue;
              } else if (relax_quotes === false) {
                const err = this.__error(
                  new CsvError(
                    "CSV_INVALID_CLOSING_QUOTE",
                    [
                      "Invalid Closing Quote:",
                      `got "${String.fromCharCode(nextChr)}"`,
                      `at line ${this.info.lines}`,
                      "instead of delimiter, record delimiter, trimable character",
                      "(if activated) or comment"
                    ],
                    this.options,
                    this.__infoField()
                  )
                );
                if (err !== void 0) return err;
              } else {
                this.state.quoting = false;
                this.state.wasQuoting = true;
                this.state.field.prepend(quote);
                pos += quote.length - 1;
              }
            } else {
              if (this.state.field.length !== 0) {
                if (relax_quotes === false) {
                  const info2 = this.__infoField();
                  const bom2 = Object.keys(boms).map(
                    (b) => boms[b].equals(this.state.field.toString()) ? b : false
                  ).filter(Boolean)[0];
                  const err = this.__error(
                    new CsvError(
                      "INVALID_OPENING_QUOTE",
                      [
                        "Invalid Opening Quote:",
                        `a quote is found on field ${JSON.stringify(info2.column)} at line ${info2.lines}, value is ${JSON.stringify(this.state.field.toString(encoding))}`,
                        bom2 ? `(${bom2} bom)` : void 0
                      ],
                      this.options,
                      info2,
                      {
                        field: this.state.field
                      }
                    )
                  );
                  if (err !== void 0) return err;
                }
              } else {
                this.state.quoting = true;
                pos += quote.length - 1;
                continue;
              }
            }
          }
          if (this.state.quoting === false) {
            const recordDelimiterLength = this.__isRecordDelimiter(
              chr,
              buf,
              pos
            );
            if (recordDelimiterLength !== 0) {
              const skipCommentLine = this.state.commenting && this.state.wasQuoting === false && this.state.record.length === 0 && this.state.field.length === 0;
              if (skipCommentLine) {
                this.info.comment_lines++;
              } else {
                if (this.state.enabled === false && this.info.lines + (this.state.wasRowDelimiter === true ? 1 : 0) >= from_line) {
                  this.state.enabled = true;
                  this.__resetField();
                  this.__resetRecord();
                  pos += recordDelimiterLength - 1;
                  continue;
                }
                if (skip_empty_lines === true && this.state.wasQuoting === false && this.state.record.length === 0 && this.state.field.length === 0) {
                  this.info.empty_lines++;
                  pos += recordDelimiterLength - 1;
                  continue;
                }
                this.info.bytes = this.state.bufBytesStart + pos;
                const errField = this.__onField();
                if (errField !== void 0) return errField;
                this.info.bytes = this.state.bufBytesStart + pos + recordDelimiterLength;
                const errRecord = this.__onRecord(push);
                if (errRecord !== void 0) return errRecord;
                if (to !== -1 && this.info.records >= to) {
                  this.state.stop = true;
                  close();
                  return;
                }
              }
              this.state.commenting = false;
              pos += recordDelimiterLength - 1;
              continue;
            }
            if (this.state.commenting) {
              continue;
            }
            if (comment !== null && (comment_no_infix === false || this.state.record.length === 0 && this.state.field.length === 0)) {
              const commentCount = this.__compareBytes(comment, buf, pos, chr);
              if (commentCount !== 0) {
                this.state.commenting = true;
                continue;
              }
            }
            const delimiterLength = this.__isDelimiter(buf, pos, chr);
            if (delimiterLength !== 0) {
              this.info.bytes = this.state.bufBytesStart + pos;
              const errField = this.__onField();
              if (errField !== void 0) return errField;
              pos += delimiterLength - 1;
              continue;
            }
          }
        }
        if (this.state.commenting === false) {
          if (max_record_size !== 0 && this.state.record_length + this.state.field.length > max_record_size) {
            return this.__error(
              new CsvError(
                "CSV_MAX_RECORD_SIZE",
                [
                  "Max Record Size:",
                  "record exceed the maximum number of tolerated bytes",
                  `of ${max_record_size}`,
                  `at line ${this.info.lines}`
                ],
                this.options,
                this.__infoField()
              )
            );
          }
        }
        const lappend = ltrim === false || this.state.quoting === true || this.state.field.length !== 0 || !this.__isCharTrimable(buf, pos);
        const rappend = rtrim === false || this.state.wasQuoting === false;
        if (lappend === true && rappend === true) {
          this.state.field.append(chr);
        } else if (rtrim === true && !this.__isCharTrimable(buf, pos)) {
          return this.__error(
            new CsvError(
              "CSV_NON_TRIMABLE_CHAR_AFTER_CLOSING_QUOTE",
              [
                "Invalid Closing Quote:",
                "found non trimable byte after quote",
                `at line ${this.info.lines}`
              ],
              this.options,
              this.__infoField()
            )
          );
        } else {
          if (lappend === false) {
            pos += this.__isCharTrimable(buf, pos) - 1;
          }
          continue;
        }
      }
      if (end === true) {
        if (this.state.quoting === true) {
          const err = this.__error(
            new CsvError(
              "CSV_QUOTE_NOT_CLOSED",
              [
                "Quote Not Closed:",
                `the parsing is finished with an opening quote at line ${this.info.lines}`
              ],
              this.options,
              this.__infoField()
            )
          );
          if (err !== void 0) return err;
        } else {
          if (this.state.wasQuoting === true || this.state.record.length !== 0 || this.state.field.length !== 0) {
            this.info.bytes = this.state.bufBytesStart + pos;
            const errField = this.__onField();
            if (errField !== void 0) return errField;
            const errRecord = this.__onRecord(push);
            if (errRecord !== void 0) return errRecord;
          } else if (this.state.wasRowDelimiter === true) {
            this.info.empty_lines++;
          } else if (this.state.commenting === true) {
            this.info.comment_lines++;
          }
        }
      } else {
        this.state.bufBytesStart += pos;
        this.state.previousBuf = buf.slice(pos);
      }
      if (this.state.wasRowDelimiter === true) {
        this.info.lines++;
        this.state.wasRowDelimiter = false;
      }
    },
    __onRecord: function(push) {
      const {
        columns,
        group_columns_by_name,
        encoding,
        info: info2,
        from,
        relax_column_count,
        relax_column_count_less,
        relax_column_count_more,
        raw,
        skip_records_with_empty_values
      } = this.options;
      const { enabled, record } = this.state;
      if (enabled === false) {
        return this.__resetRecord();
      }
      const recordLength = record.length;
      if (columns === true) {
        if (skip_records_with_empty_values === true && isRecordEmpty(record)) {
          this.__resetRecord();
          return;
        }
        return this.__firstLineToColumns(record);
      }
      if (columns === false && this.info.records === 0) {
        this.state.expectedRecordLength = recordLength;
      }
      if (recordLength !== this.state.expectedRecordLength) {
        const err = columns === false ? new CsvError(
          "CSV_RECORD_INCONSISTENT_FIELDS_LENGTH",
          [
            "Invalid Record Length:",
            `expect ${this.state.expectedRecordLength},`,
            `got ${recordLength} on line ${this.info.lines}`
          ],
          this.options,
          this.__infoField(),
          {
            record
          }
        ) : new CsvError(
          "CSV_RECORD_INCONSISTENT_COLUMNS",
          [
            "Invalid Record Length:",
            `columns length is ${columns.length},`,
            // rename columns
            `got ${recordLength} on line ${this.info.lines}`
          ],
          this.options,
          this.__infoField(),
          {
            record
          }
        );
        if (relax_column_count === true || relax_column_count_less === true && recordLength < this.state.expectedRecordLength || relax_column_count_more === true && recordLength > this.state.expectedRecordLength) {
          this.info.invalid_field_length++;
          this.state.error = err;
        } else {
          const finalErr = this.__error(err);
          if (finalErr) return finalErr;
        }
      }
      if (skip_records_with_empty_values === true && isRecordEmpty(record)) {
        this.__resetRecord();
        return;
      }
      if (this.state.recordHasError === true) {
        this.__resetRecord();
        this.state.recordHasError = false;
        return;
      }
      this.info.records++;
      if (from === 1 || this.info.records >= from) {
        const { objname } = this.options;
        if (columns !== false) {
          const obj = {};
          for (let i = 0, l = record.length; i < l; i++) {
            if (columns[i] === void 0 || columns[i].disabled) continue;
            if (group_columns_by_name === true && obj[columns[i].name] !== void 0) {
              if (Array.isArray(obj[columns[i].name])) {
                obj[columns[i].name] = obj[columns[i].name].concat(record[i]);
              } else {
                obj[columns[i].name] = [obj[columns[i].name], record[i]];
              }
            } else {
              obj[columns[i].name] = record[i];
            }
          }
          if (raw === true || info2 === true) {
            const extRecord = Object.assign(
              { record: obj },
              raw === true ? { raw: this.state.rawBuffer.toString(encoding) } : {},
              info2 === true ? { info: this.__infoRecord() } : {}
            );
            const err = this.__push(
              objname === void 0 ? extRecord : [obj[objname], extRecord],
              push
            );
            if (err) {
              return err;
            }
          } else {
            const err = this.__push(
              objname === void 0 ? obj : [obj[objname], obj],
              push
            );
            if (err) {
              return err;
            }
          }
        } else {
          if (raw === true || info2 === true) {
            const extRecord = Object.assign(
              { record },
              raw === true ? { raw: this.state.rawBuffer.toString(encoding) } : {},
              info2 === true ? { info: this.__infoRecord() } : {}
            );
            const err = this.__push(
              objname === void 0 ? extRecord : [record[objname], extRecord],
              push
            );
            if (err) {
              return err;
            }
          } else {
            const err = this.__push(
              objname === void 0 ? record : [record[objname], record],
              push
            );
            if (err) {
              return err;
            }
          }
        }
      }
      this.__resetRecord();
    },
    __firstLineToColumns: function(record) {
      const { firstLineToHeaders } = this.state;
      try {
        const headers = firstLineToHeaders === void 0 ? record : firstLineToHeaders.call(null, record);
        if (!Array.isArray(headers)) {
          return this.__error(
            new CsvError(
              "CSV_INVALID_COLUMN_MAPPING",
              [
                "Invalid Column Mapping:",
                "expect an array from column function,",
                `got ${JSON.stringify(headers)}`
              ],
              this.options,
              this.__infoField(),
              {
                headers
              }
            )
          );
        }
        const normalizedHeaders = normalize_columns_array(headers);
        this.state.expectedRecordLength = normalizedHeaders.length;
        this.options.columns = normalizedHeaders;
        this.__resetRecord();
        return;
      } catch (err) {
        return err;
      }
    },
    __resetRecord: function() {
      if (this.options.raw === true) {
        this.state.rawBuffer.reset();
      }
      this.state.error = void 0;
      this.state.record = [];
      this.state.record_length = 0;
    },
    __onField: function() {
      const { cast, encoding, rtrim, max_record_size } = this.options;
      const { enabled, wasQuoting } = this.state;
      if (enabled === false) {
        return this.__resetField();
      }
      let field = this.state.field.toString(encoding);
      if (rtrim === true && wasQuoting === false) {
        field = field.trimRight();
      }
      if (cast === true) {
        const [err, f] = this.__cast(field);
        if (err !== void 0) return err;
        field = f;
      }
      this.state.record.push(field);
      if (max_record_size !== 0 && typeof field === "string") {
        this.state.record_length += field.length;
      }
      this.__resetField();
    },
    __resetField: function() {
      this.state.field.reset();
      this.state.wasQuoting = false;
    },
    __push: function(record, push) {
      const { on_record } = this.options;
      if (on_record !== void 0) {
        const info2 = this.__infoRecord();
        try {
          record = on_record.call(null, record, info2);
        } catch (err) {
          return err;
        }
        if (record === void 0 || record === null) {
          return;
        }
      }
      push(record);
    },
    // Return a tuple with the error and the casted value
    __cast: function(field) {
      const { columns, relax_column_count } = this.options;
      const isColumns = Array.isArray(columns);
      if (isColumns === true && relax_column_count && this.options.columns.length <= this.state.record.length) {
        return [void 0, void 0];
      }
      if (this.state.castField !== null) {
        try {
          const info2 = this.__infoField();
          return [void 0, this.state.castField.call(null, field, info2)];
        } catch (err) {
          return [err];
        }
      }
      if (this.__isFloat(field)) {
        return [void 0, parseFloat(field)];
      } else if (this.options.cast_date !== false) {
        const info2 = this.__infoField();
        return [void 0, this.options.cast_date.call(null, field, info2)];
      }
      return [void 0, field];
    },
    // Helper to test if a character is a space or a line delimiter
    __isCharTrimable: function(buf, pos) {
      const isTrim = (buf2, pos2) => {
        const { timchars } = this.state;
        loop1: for (let i = 0; i < timchars.length; i++) {
          const timchar = timchars[i];
          for (let j = 0; j < timchar.length; j++) {
            if (timchar[j] !== buf2[pos2 + j]) continue loop1;
          }
          return timchar.length;
        }
        return 0;
      };
      return isTrim(buf, pos);
    },
    // Keep it in case we implement the `cast_int` option
    // __isInt(value){
    //   // return Number.isInteger(parseInt(value))
    //   // return !isNaN( parseInt( obj ) );
    //   return /^(\-|\+)?[1-9][0-9]*$/.test(value)
    // }
    __isFloat: function(value) {
      return value - parseFloat(value) + 1 >= 0;
    },
    __compareBytes: function(sourceBuf, targetBuf, targetPos, firstByte) {
      if (sourceBuf[0] !== firstByte) return 0;
      const sourceLength = sourceBuf.length;
      for (let i = 1; i < sourceLength; i++) {
        if (sourceBuf[i] !== targetBuf[targetPos + i]) return 0;
      }
      return sourceLength;
    },
    __isDelimiter: function(buf, pos, chr) {
      const { delimiter, ignore_last_delimiters } = this.options;
      if (ignore_last_delimiters === true && this.state.record.length === this.options.columns.length - 1) {
        return 0;
      } else if (ignore_last_delimiters !== false && typeof ignore_last_delimiters === "number" && this.state.record.length === ignore_last_delimiters - 1) {
        return 0;
      }
      loop1: for (let i = 0; i < delimiter.length; i++) {
        const del = delimiter[i];
        if (del[0] === chr) {
          for (let j = 1; j < del.length; j++) {
            if (del[j] !== buf[pos + j]) continue loop1;
          }
          return del.length;
        }
      }
      return 0;
    },
    __isRecordDelimiter: function(chr, buf, pos) {
      const { record_delimiter } = this.options;
      const recordDelimiterLength = record_delimiter.length;
      loop1: for (let i = 0; i < recordDelimiterLength; i++) {
        const rd = record_delimiter[i];
        const rdLength = rd.length;
        if (rd[0] !== chr) {
          continue;
        }
        for (let j = 1; j < rdLength; j++) {
          if (rd[j] !== buf[pos + j]) {
            continue loop1;
          }
        }
        return rd.length;
      }
      return 0;
    },
    __isEscape: function(buf, pos, chr) {
      const { escape } = this.options;
      if (escape === null) return false;
      const l = escape.length;
      if (escape[0] === chr) {
        for (let i = 0; i < l; i++) {
          if (escape[i] !== buf[pos + i]) {
            return false;
          }
        }
        return true;
      }
      return false;
    },
    __isQuote: function(buf, pos) {
      const { quote } = this.options;
      if (quote === null) return false;
      const l = quote.length;
      for (let i = 0; i < l; i++) {
        if (quote[i] !== buf[pos + i]) {
          return false;
        }
      }
      return true;
    },
    __autoDiscoverRecordDelimiter: function(buf, pos) {
      const { encoding } = this.options;
      const rds = [
        // Important, the windows line ending must be before mac os 9
        Buffer.from("\r\n", encoding),
        Buffer.from("\n", encoding),
        Buffer.from("\r", encoding)
      ];
      loop: for (let i = 0; i < rds.length; i++) {
        const l = rds[i].length;
        for (let j = 0; j < l; j++) {
          if (rds[i][j] !== buf[pos + j]) {
            continue loop;
          }
        }
        this.options.record_delimiter.push(rds[i]);
        this.state.recordDelimiterMaxLength = rds[i].length;
        return rds[i].length;
      }
      return 0;
    },
    __error: function(msg) {
      const { encoding, raw, skip_records_with_error } = this.options;
      const err = typeof msg === "string" ? new Error(msg) : msg;
      if (skip_records_with_error) {
        this.state.recordHasError = true;
        if (this.options.on_skip !== void 0) {
          try {
            this.options.on_skip(
              err,
              raw ? this.state.rawBuffer.toString(encoding) : void 0
            );
          } catch (err2) {
            return err2;
          }
        }
        return void 0;
      } else {
        return err;
      }
    },
    __infoDataSet: function() {
      return {
        ...this.info,
        columns: this.options.columns
      };
    },
    __infoRecord: function() {
      const { columns, raw, encoding } = this.options;
      return {
        ...this.__infoDataSet(),
        error: this.state.error,
        header: columns === true,
        index: this.state.record.length,
        raw: raw ? this.state.rawBuffer.toString(encoding) : void 0
      };
    },
    __infoField: function() {
      const { columns } = this.options;
      const isColumns = Array.isArray(columns);
      return {
        ...this.__infoRecord(),
        column: isColumns === true ? columns.length > this.state.record.length ? columns[this.state.record.length].name : null : this.state.record.length,
        quoting: this.state.wasQuoting
      };
    }
  };
};
const parse = function(data, opts = {}) {
  if (typeof data === "string") {
    data = Buffer.from(data);
  }
  const records = opts && opts.objname ? {} : [];
  const parser = transform(opts);
  const push = (record) => {
    if (parser.options.objname === void 0) records.push(record);
    else {
      records[record[0]] = record[1];
    }
  };
  const close = () => {
  };
  const error = parser.parse(data, true, push, close);
  if (error !== void 0) throw error;
  return records;
};
function normalizeHeader(value) {
  return value.toLowerCase().replace(/\s+/g, " ").replace(/[.:]+/g, "").trim();
}
function buildHeaderMap(record) {
  const map = /* @__PURE__ */ new Map();
  for (const key of Object.keys(record)) {
    map.set(normalizeHeader(key), key);
  }
  return map;
}
function getHeaderValue(record, map, keys) {
  for (const key of keys) {
    const normalized = normalizeHeader(key);
    const rawKey = map.get(normalized);
    if (rawKey && record[rawKey] !== void 0) {
      return record[rawKey];
    }
  }
  return void 0;
}
function parseGermanDate(value) {
  if (!value) {
    return null;
  }
  const match = value.trim().match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/);
  if (!match) {
    return null;
  }
  const day = match[1].padStart(2, "0");
  const month = match[2].padStart(2, "0");
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${month}-${day}`;
}
function parseEuroAmount(value) {
  if (!value) {
    return null;
  }
  const cleaned = value.replace(/[^\d,.\-]/g, "").replace(/\./g, "").replace(/,/g, ".");
  const amount = Number.parseFloat(cleaned);
  if (Number.isNaN(amount)) {
    return null;
  }
  return amount;
}
function makeRawHash(parts) {
  const input = parts.filter(Boolean).join("|");
  return crypto.createHash("sha256").update(input).digest("hex");
}
function parseDkbRecords(records) {
  const warnings = [];
  const transactions = [];
  records.forEach((record, index) => {
    const map = buildHeaderMap(record);
    const bookingDate = parseGermanDate(
      getHeaderValue(record, map, ["Buchungsdatum", "Buchungstag", "Buchung"])
    );
    const valueDate = parseGermanDate(
      getHeaderValue(record, map, ["Wertstellung", "Valuta"])
    );
    const amount = parseEuroAmount(
      getHeaderValue(record, map, ["Betrag (€)", "Betrag (EUR)", "Betrag", "Umsatz in EUR"])
    );
    const currency = getHeaderValue(record, map, ["Währung", "Waehrung", "Currency"])?.trim() || "EUR";
    const payee = getHeaderValue(record, map, [
      "Zahlungsempfänger*in",
      "Zahlungsempfaenger*in",
      "Zahlungsempfänger",
      "Zahlungsempfaenger",
      "Auftraggeber / Begünstigter",
      "Auftraggeber/Empfänger",
      "Empfänger",
      "Begünstigter"
    ])?.trim() || null;
    const payer = getHeaderValue(record, map, [
      "Zahlungspflichtige*r",
      "Zahlungspflichtiger",
      "Zahlungspflichtige"
    ])?.trim() || null;
    const purpose = getHeaderValue(record, map, ["Verwendungszweck"])?.trim() || null;
    const iban = getHeaderValue(record, map, ["IBAN"])?.trim() || null;
    const bic = getHeaderValue(record, map, ["BIC"])?.trim() || null;
    const reference = getHeaderValue(record, map, [
      "Kundenreferenz",
      "Mandatsreferenz",
      "Gläubiger-ID",
      "Glaeubiger-ID"
    ])?.trim() || null;
    const account = getHeaderValue(record, map, ["Girokonto", "Kontonummer", "Account"])?.trim() || iban;
    if (!bookingDate || amount === null) {
      warnings.push(`DKB row ${index + 1}: missing booking date or amount`);
      return;
    }
    const rawHash = makeRawHash([
      bookingDate,
      valueDate,
      amount.toString(),
      currency,
      payee ?? payer,
      purpose,
      iban,
      reference
    ]);
    transactions.push({
      account,
      bookingDate,
      valueDate,
      amount,
      currency,
      payee: payee ?? payer,
      purpose,
      iban,
      bic,
      reference,
      rawHash
    });
  });
  return { transactions, warnings };
}
function parseDkbCsv(contents) {
  const rows = parse(contents, {
    delimiter: ";",
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true
  });
  const headerIndex = rows.findIndex(
    (row) => row.some((cell) => cell?.toLowerCase().includes("buchungsdatum"))
  );
  if (headerIndex === -1) {
    return {
      transactions: [],
      warnings: ["DKB: header row not found (missing Buchungsdatum)"]
    };
  }
  const headers = rows[headerIndex];
  const dataRows = rows.slice(headerIndex + 1);
  const records = dataRows.filter((row) => row.some((cell) => cell?.trim() !== "")).map((row) => {
    const record = {};
    headers.forEach((header, idx) => {
      record[header] = row[idx] ?? "";
    });
    return record;
  });
  return parseDkbRecords(records);
}
const RESPONSE_SCHEMA = {
  type: "json_schema",
  name: "categorization_suggestions",
  strict: true,
  schema: {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            transaction_id: { type: "integer" },
            category_id: { type: "integer" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" }
          },
          required: ["transaction_id", "category_id", "confidence", "reason"],
          additionalProperties: false
        }
      }
    },
    required: ["items"],
    additionalProperties: false
  }
};
function calculateCostUsd(inputCostPer1M, outputCostPer1M, inputTokens, outputTokens) {
  if (inputCostPer1M == null || outputCostPer1M == null || inputTokens == null || outputTokens == null) {
    return null;
  }
  const inputCost = inputTokens * inputCostPer1M / 1e6;
  const outputCost = outputTokens * outputCostPer1M / 1e6;
  return inputCost + outputCost;
}
function buildPrompt(transactions, categories) {
  return {
    system: "You are a precise categorization assistant for bank transactions. Choose the best category_id from the provided list. If unsure, still choose the closest category and set a low confidence.",
    user: JSON.stringify({ transactions, categories })
  };
}
function extractJsonText(response) {
  if (typeof response?.output_text === "string") {
    return response.output_text;
  }
  const output = response?.output;
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (part?.type === "output_text" && typeof part?.text === "string") {
          return part.text;
        }
      }
    }
  }
  return null;
}
async function suggestCategories(transactions, categories) {
  const settings = getAiSettings();
  if (!settings.enabled) {
    insertAiRequest({
      model: settings.model,
      status: "skipped",
      error: "AI is disabled in settings."
    });
    return { applied: 0, error: "AI is disabled in settings." };
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    insertAiRequest({
      model: settings.model,
      status: "error",
      error: "OPENAI_API_KEY is not set."
    });
    return { applied: 0, error: "OPENAI_API_KEY is not set." };
  }
  const { system, user } = buildPrompt(transactions, categories);
  const requestPayload = JSON.stringify({
    model: settings.model,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: user }]
      }
    ],
    text: {
      format: RESPONSE_SCHEMA
    }
  });
  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: requestPayload
  });
  if (!response.ok) {
    const errorText = await response.text();
    insertAiRequest({
      model: settings.model,
      requestPayload,
      responsePayload: errorText,
      status: "error",
      error: errorText || "OpenAI request failed."
    });
    return { applied: 0, error: errorText || "OpenAI request failed." };
  }
  const payload = await response.json();
  const inputTokens = typeof payload?.usage?.input_tokens === "number" ? payload.usage.input_tokens : null;
  const outputTokens = typeof payload?.usage?.output_tokens === "number" ? payload.usage.output_tokens : null;
  const totalTokens = typeof payload?.usage?.total_tokens === "number" ? payload.usage.total_tokens : inputTokens != null && outputTokens != null ? inputTokens + outputTokens : null;
  const costUsd = calculateCostUsd(
    settings.inputCostPer1M,
    settings.outputCostPer1M,
    inputTokens,
    outputTokens
  );
  insertAiRequest({
    model: settings.model,
    requestPayload,
    responsePayload: JSON.stringify(payload),
    status: "success",
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd
  });
  const jsonText = extractJsonText(payload);
  if (!jsonText) {
    return { applied: 0, error: "No JSON response from OpenAI." };
  }
  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return { applied: 0, error: "Failed to parse OpenAI response." };
  }
  if (!parsed.items || parsed.items.length === 0) {
    return { applied: 0, error: "OpenAI returned no suggestions." };
  }
  const mapped = parsed.items.map((item) => ({
    transactionId: item.transaction_id,
    categoryId: item.category_id,
    confidence: item.confidence,
    reason: item.reason,
    model: settings.model
  }));
  upsertAiSuggestions(mapped);
  return { applied: mapped.length };
}
createRequire(import.meta.url);
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    },
    show: false
  });
  win.maximize();
  win.show();
  win.webContents.on("did-finish-load", () => {
    win?.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("before-quit", () => {
  closeDatabase();
});
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.whenReady().then(() => {
  initializeDatabase();
  ipcMain.handle("db:get-info", () => getDatabaseInfo());
  ipcMain.handle("categories:list", () => listCategories());
  ipcMain.handle("categories:create", (_event, payload) => {
    const name = typeof payload?.name === "string" ? payload.name.trim() : "";
    if (!name) {
      return null;
    }
    return createCategory(name, payload?.color);
  });
  ipcMain.handle("categories:update", (_event, payload) => {
    if (!payload?.id) {
      return false;
    }
    return updateCategory(payload.id, {
      name: payload?.name,
      color: payload?.color,
      isActive: payload?.isActive
    });
  });
  ipcMain.handle("categories:delete", (_event, payload) => {
    if (!payload?.id) {
      return { deleted: false, archived: false };
    }
    return deleteCategory(payload.id);
  });
  ipcMain.handle("rules:list", () => listRules());
  ipcMain.handle("rules:create", (_event, payload) => {
    if (!payload?.matcherType || !payload?.matcherValue || !payload?.categoryId) {
      return null;
    }
    return createRule({
      matcherType: payload.matcherType,
      matcherValue: payload.matcherValue,
      categoryId: payload.categoryId,
      priority: payload?.priority,
      isActive: payload?.isActive
    });
  });
  ipcMain.handle("rules:update", (_event, payload) => {
    if (!payload?.id) {
      return false;
    }
    return updateRule(payload.id, {
      matcherType: payload?.matcherType,
      matcherValue: payload?.matcherValue,
      categoryId: payload?.categoryId,
      priority: payload?.priority,
      isActive: payload?.isActive
    });
  });
  ipcMain.handle("rules:delete", (_event, payload) => {
    if (!payload?.id) {
      return false;
    }
    return deleteRule(payload.id);
  });
  ipcMain.handle("rules:apply", () => applyRulesToUncategorized());
  ipcMain.handle("ai:settings:get", () => getAiSettings());
  ipcMain.handle(
    "ai:settings:update",
    (_event, payload) => updateAiSettings({
      model: payload?.model,
      enabled: payload?.enabled,
      confidenceThreshold: payload?.confidenceThreshold,
      inputCostPer1M: payload?.inputCostPer1M,
      outputCostPer1M: payload?.outputCostPer1M
    })
  );
  ipcMain.handle("ai:key:status", () => ({
    present: Boolean(process.env.OPENAI_API_KEY)
  }));
  ipcMain.handle(
    "ai:requests:list",
    (_event, payload) => listAiRequests(payload?.limit ?? 100)
  );
  ipcMain.handle("dashboard:months", () => listDashboardMonths());
  ipcMain.handle("dashboard:summary", (_event, payload) => {
    const month = typeof payload?.month === "string" ? payload.month : "";
    if (!month) {
      return null;
    }
    return getDashboardSummary(month);
  });
  ipcMain.handle("dashboard:categories", (_event, payload) => {
    const month = typeof payload?.month === "string" ? payload.month : "";
    if (!month) {
      return [];
    }
    return listDashboardCategorySpend(month);
  });
  ipcMain.handle("dashboard:summary:range", (_event, payload) => {
    const startMonth = typeof payload?.startMonth === "string" ? payload.startMonth : "";
    const endMonth = typeof payload?.endMonth === "string" ? payload.endMonth : "";
    if (!startMonth || !endMonth) {
      return null;
    }
    return getDashboardSummaryRange(startMonth, endMonth);
  });
  ipcMain.handle("dashboard:categories:range", (_event, payload) => {
    const startMonth = typeof payload?.startMonth === "string" ? payload.startMonth : "";
    const endMonth = typeof payload?.endMonth === "string" ? payload.endMonth : "";
    if (!startMonth || !endMonth) {
      return [];
    }
    return listDashboardCategorySpendRange(startMonth, endMonth);
  });
  ipcMain.handle("dashboard:trend", (_event, payload) => {
    const months = Number(payload?.months) || 6;
    return listDashboardTrend(months);
  });
  ipcMain.handle("ai:suggestions", (_event, payload) => {
    const ids = Array.isArray(payload?.transactionIds) ? payload.transactionIds : [];
    return getAiSuggestionsForTransactions(ids);
  });
  ipcMain.handle("ai:suggest", async (_event, payload) => {
    const transactions = Array.isArray(payload?.transactions) ? payload.transactions : [];
    const categories = Array.isArray(payload?.categories) ? payload.categories : [];
    if (transactions.length === 0 || categories.length === 0) {
      return { applied: 0, error: "No transactions or categories provided." };
    }
    return suggestCategories(transactions, categories);
  });
  ipcMain.handle(
    "transactions:list",
    (_event, filters) => listTransactions(filters)
  );
  ipcMain.handle(
    "transactions:uncategorized",
    (_event, filters) => listUncategorizedTransactions(filters)
  );
  ipcMain.handle(
    "transactions:categorized",
    (_event, filters) => listCategorizedTransactions(filters)
  );
  ipcMain.handle("transactions:add-category", (_event, payload) => {
    if (!payload?.transactionId || !payload?.categoryId) {
      return false;
    }
    return addTransactionCategory(payload.transactionId, payload.categoryId);
  });
  ipcMain.handle("transactions:remove-category", (_event, payload) => {
    if (!payload?.transactionId || !payload?.categoryId) {
      return false;
    }
    return removeTransactionCategory(payload.transactionId, payload.categoryId);
  });
  ipcMain.handle("import:pick-file", async () => {
    const result = await dialog.showOpenDialog({
      title: "Select DKB CSV file",
      properties: ["openFile"],
      filters: [{ name: "CSV", extensions: ["csv"] }]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });
  ipcMain.handle("import:dkb", async (_event, filePath) => {
    if (!filePath) {
      return { success: false, error: "No file path provided." };
    }
    const contents = await readFile(filePath, "utf-8");
    const { transactions, warnings } = parseDkbCsv(contents);
    if (transactions.length === 0) {
      return { success: false, error: "No transactions found.", warnings };
    }
    insertImport("dkb", path.basename(filePath));
    const { inserted, skipped } = insertTransactions(transactions);
    return {
      success: true,
      inserted,
      skipped,
      warnings
    };
  });
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
