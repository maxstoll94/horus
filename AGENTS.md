# AGENTS.md

Project knowledge base for AI assistants (Codex/ChatGPT). Keep this concise and
update when behavior, commands, or architecture changes.

## Start here (quick orientation)
- Purpose: offline Windows app to import bank CSVs, categorize transactions, and
  review dashboard insights.
- Primary flow: Import CSV (DKB/ING) → categorize → apply rules → review charts.
- Key files: `electron/db.ts` (schema/queries), `electron/importers/*` (parsers),
  `src/App.tsx` (UI), `electron/main.ts` (IPC).
- Gotchas: packaged app uses `file://` so bundle assets via import; better-sqlite3
  can require rebuild; Windows builds may need Developer Mode for symlinks.
- Run/build: `npm run dev` / `npm run build`.

## Project summary
- Horus is a Windows-first Electron desktop app for importing bank CSVs (DKB + ING),
  categorizing transactions, and showing dashboard insights.
- Frontend: React + TypeScript + Vite.
- Backend: Electron main process with SQLite (better-sqlite3).

## Key commands
- Dev: `npm run dev`
- Build/release: `npm run build` (tsc + vite build + electron-builder)
- Lint: `npm run lint`
- Native module rebuild (if better-sqlite3 ABI mismatch):
  - `npm rebuild better-sqlite3`
  - `npx electron-rebuild -f -w better-sqlite3`

## Repo layout
- `electron/main.ts`: IPC handlers, import flow, window setup.
- `electron/db.ts`: SQLite schema + migrations + queries.
- `electron/importers/*`: CSV parsers (DKB, ING).
- `src/App.tsx`: main UI + state.
- `src/components/DataTable.tsx`: table rendering.
- `public/` + `src/assets/`: icons and logos.

## Data + behavior notes
- DB path: `app.getPath('userData')/horus.db`.
- Duplicate import protection uses `imports.file_hash` (SHA-256 of file contents).
- Categorization actions live in one Actions column: Add, Delete, Quick rule,
  Custom rule with separators.

## UX conventions
- Light theme only.
- Action buttons use `.rule-action` styling with letter icons:
  - Add = A, Save = S, Delete = D, Quick = Q, Custom = C.
- Toasts for most create/update/delete actions.

## Build/release gotchas
- Windows packaging may fail if symlink privileges are missing; enable Developer
  Mode or run build from an elevated shell.
- Packaged app runs under `file://`, so use bundled assets via import
  (e.g., `import logo from './assets/...';`).

## AI settings
- `OPENAI_API_KEY` is read in the main process.
- Packaged builds do not load `.env` automatically; set a system/user env var
  for the installed app.

## Git hygiene
- Keep build outputs out of git (`dist/`, `dist-electron/`, `release/`).
- Example CSVs are ignored (`examples/*.csv`).
