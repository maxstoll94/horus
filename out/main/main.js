import { app, BrowserWindow, ipcMain } from "electron";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";
import __cjs_mod__ from "node:module";
const __filename = import.meta.filename;
const __dirname = import.meta.dirname;
const require2 = __cjs_mod__.createRequire(import.meta.url);
const require$1 = createRequire(import.meta.url);
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const Database = require$1("better-sqlite3");
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const MAIN_DIST = path.join(process.env.APP_ROOT, "dist-electron");
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
let db = null;
let dbPath = null;
const SCHEMA_VERSION = 2;
function initDatabase() {
  dbPath = path.join(app.getPath("userData"), "horus.sqlite3");
  db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      color TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      bank TEXT NOT NULL,
      booked_on TEXT NOT NULL,
      amount REAL NOT NULL,
      currency TEXT NOT NULL,
      description TEXT NOT NULL,
      counterparty TEXT,
      iban TEXT,
      reference TEXT,
      import_id INTEGER,
      raw_line TEXT NOT NULL,
      hash TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (import_id) REFERENCES imports(id)
    );

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      transaction_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      source TEXT NOT NULL,
      confidence REAL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS imports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_name TEXT NOT NULL,
      bank TEXT NOT NULL,
      imported_at TEXT NOT NULL DEFAULT (datetime('now')),
      checksum TEXT NOT NULL UNIQUE
    );

    CREATE TABLE IF NOT EXISTS vendor_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      match_text TEXT,
      iban TEXT,
      category_id INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_transactions_hash ON transactions(hash);
    CREATE INDEX IF NOT EXISTS idx_assignments_transaction ON assignments(transaction_id);
  `);
  const existing = db.prepare("SELECT version FROM schema_migrations WHERE version = ?").get(SCHEMA_VERSION);
  if (!existing) {
    const previous = db.prepare("SELECT MAX(version) AS version FROM schema_migrations").get();
    const previousVersion = previous?.version ?? 0;
    if (previousVersion < 2) {
      db.exec(`
        ALTER TABLE transactions ADD COLUMN import_id INTEGER;
        CREATE TABLE IF NOT EXISTS vendor_rules (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          match_text TEXT,
          iban TEXT,
          category_id INTEGER NOT NULL,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
        );
      `);
    }
    db.prepare("INSERT INTO schema_migrations (version, applied_at) VALUES (?, datetime('now'))").run(SCHEMA_VERSION);
  }
}
function getDbStatus() {
  if (!db || !dbPath) {
    return { ready: false };
  }
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map((row) => row.name);
  return {
    ready: true,
    path: dbPath,
    schemaVersion: SCHEMA_VERSION,
    tables
  };
}
function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, "electron-vite.svg"),
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs")
    }
  });
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
app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.on("before-quit", () => {
  db?.close();
  db = null;
});
ipcMain.handle("db:status", async () => getDbStatus());
app.whenReady().then(() => {
  initDatabase();
  createWindow();
});
export {
  MAIN_DIST,
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};
