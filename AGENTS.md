# AGENTS.md

Project knowledge base for AI assistants. Keep this concise and update when
behavior, commands, or architecture changes.

## Start here (quick orientation)
- Purpose: offline-first personal finance desktop app. Import bank CSVs
  (DKB/ING), categorize transactions (manual + rules + AI), set budgets per
  category, and track actual vs plan. An AI chat assistant with DB access is
  available on every page.
- Primary flow: Import CSV → categorize (rules / AI suggest / manual) →
  set budgets → review Dashboard + Budget views → ask the AI chat.
- Key files: `electron/db.ts` (schema/migrations/queries), `electron/main.ts`
  (IPC handlers), `electron/preload.ts` (window.api bridge), `src/App.tsx`
  (state + nav shell), `src/views/*` (per-view UI), `electron/ai-chat.ts`
  (chat assistant + tools), `electron/ai.ts` (categorization suggestions).
- Gotchas: packaged app uses `file://` so bundle assets via import;
  better-sqlite3 can require rebuild; Windows builds may need Developer Mode.
- Run/build: `npm run dev` / `npm run build`. Lint: `npm run lint`.

## Architecture
- Frontend: React 18 + TypeScript + Vite. Recharts for charts,
  @tanstack/react-table for tables, react-select for pickers.
- Backend: Electron main process with SQLite (better-sqlite3, synchronous).
- IPC: `ipcMain.handle` in `electron/main.ts` → exposed via `contextBridge`
  in `electron/preload.ts` as `window.api.*` → typed in `src/vite-env.d.ts`
  (types must be updated in BOTH preload and vite-env.d.ts when adding IPC).
- `src/App.tsx` (~2,400 lines) still owns most state (40+ useState hooks) and
  passes props down to `src/views/*`. A fuller split (custom hooks / IPC
  layer) is a known pending refactor — see `.context/plans/`.

## Views (sidebar nav in App.tsx)
- Dashboard: monthly/range summary, net-spending bar chart with a "Group by"
  toggle (Category / Tag) — same chart/drilldown UI either way, just the
  grouping dimension and color source change; tag mode only includes tagged
  transactions (untagged ones are silently excluded, not zeroed). Click a bar
  to drill into that category's/tag's transactions.
- Budget: Excel-style groups (Income, Fixed, Variable, Savings, Transfers)
  with budget vs actual vs variance, % budget, % income per row; summary bar
  with Income / Expenses / Savings / Net / Savings Rate (actual + budgeted).
- Categorization: uncategorized/categorized tabs, bulk category assign,
  "Save as Rules" / "Apply Rules" / "Suggest with AI" actions.
- Categories: CRUD + group type + color.
- Rules: CRUD for matcher rules (payee/purpose/iban, contains matching); a
  rule can also carry tags, applied atomically with its category when the
  rule wins (first-match-wins semantics unchanged — just widens what the
  winning rule applies).
- Tags (`TagsView`): standalone tag manager — search, click-to-rename (renaming
  to an existing name merges), delete. Same `tags:list`/`rename`/`delete`
  endpoints the inline transaction tag editor and rule tag picker use.
- Transactions: full list, search, inline amount editing, delete.
- Settings (`AiSettingsView`): AI model config, request log with costs,
  Danger Zone (delete transactions / full reset).
- AI Chat: floating panel (bottom-right ✦ button) over every view, not a nav
  page. View-scoped system prompt + suggestions.

## Data model (SQLite, `app.getPath('userData')/horus.db`)
- Migrations: idempotent blocks in `initializeSchema`, `SCHEMA_VERSION` = 21.
- Tables: transactions, transaction_categories (M:N), categories, rules,
  rule_tags (M:N), tags, transaction_tags (M:N), imports, budgets, accounts,
  ai_settings, ai_requests, ai_suggestions, ai_tag_suggestions, chat_sessions,
  schema_migrations.
- Tags: free-form cross-cutting labels (a trip, a person, "reimbursable"),
  never a category duplicate. Normalized to lowercase-kebab at write time
  (`normalizeTagName`) so "Italy 2026" and "italy-2026" collapse to one tag;
  no financial semantics, so applying/removing them never affects totals.
  CRUD in `electron/db.ts` (`getOrCreateTag`, `addTransactionTag`/
  `addTransactionTagById`, `removeTransactionTag`, `renameTag` (merges on
  collision), `deleteTag`, `listTags`, `listTagsForTransactions`); inline
  chip editor + Tags manager in the UI; a `tag_transaction` tool (max 2 tags)
  in the interactive AI chat.
- rule_tags: tags a rule applies. Stores real `tag_id`s directly (chosen
  deliberately when building the rule, via `getOrCreateTag`) — unlike
  ai_tag_suggestions below, there's no "unapplied suggestion" state to avoid
  littering the Tags manager with unused rows.
- ai_tag_suggestions: the bulk AI suggester's per-transaction tag
  suggestions (up to 2, `UNIQUE(transaction_id, tag_name)` — a transaction
  can hold 2 rows, unlike ai_suggestions' one-row-per-transaction category).
  Stores the tag **name**, not a `tag_id`, so a rejected/unapplied suggestion
  never force-creates a real `tags` row; only on apply (auto or manual) does
  it resolve through `getOrCreateTag`/`addTransactionTag`.
- accounts: auto-created on import from statement metadata (DKB: "Girokonto"/
  "Karte" header lines; ING: per-row Account column). type = checking |
  savings | credit. Balance = anchor_balance + SUM(amounts with booking_date
  > anchor_date); anchors auto-set from "Kontostand vom …"/"Saldo vom …"
  (DKB) or Resulting balance (ING, only when the newest date has one row) and
  only ever move forward (maybeUpdateAccountAnchor). Editable in Settings.
- Credit card model: card purchases are the expenses (import the credit CSV);
  the monthly settlement from Giro is a Transfer on both sides (seed rules
  'DKB' equals + 'Ausgleich Kreditkarte' contains).
- categories.group_type: income | fixed_expense | variable_expense | savings
  | transfer.
- budgets: keyed UNIQUE(category_id, period) where period is 'YYYY'
  (year-level default) or 'YYYY-MM' (month override, wins in monthly view).
  cadence monthly/annual pro-rates (×12 / ÷12) between views.
- Duplicate import protection: imports.file_hash (SHA-256) + per-row
  transactions.raw_hash UNIQUE.
- Manual transactions: source='manual', raw_hash='manual:<random>'.

## Category taxonomy (by design — resist sprawl)
- Categories answer "what KIND of spending" only; 14 seeded on reset
  (SEED_CATEGORIES in db.ts), kept deliberately lean so the Budget view
  stays scannable at a glance. Utilities/Internet/Phone are merged into
  "Utilities & Internet"; Fees & Taxes, Personal Care, and catch-all "Other"
  fold into "Shopping"; Leisure & Hobbies + Travel & Holidays merge into
  "Leisure & Travel"; Pension merges into "Investments" (Emergency Fund
  became the standalone "Savings" bucket). Rent and Savings/Investments stay
  split out on purpose — those are the lines worth tracking individually.
  Merchant detail (Netflix, Degiro) lives in rules / future recurring
  detection; account/direction detail in future accounts layer. Never add
  merchant- or person-named categories.
- Reset (Danger Zone) only reseeds SEED_CATEGORIES — no starter payee rules
  ship with the app (that would mean baking one person's specific merchants
  into every install); users build their own rules via "Save as Rules".
- Rules apply first-match-wins ordered by priority DESC (overlapping
  matchers like 'DKB' ⊂ 'DKB AG' resolve via priority 200 > 100).
- AI chat is instructed to prefer existing categories and never create
  merchant-named ones.

## Domain rules (business logic to preserve)
- Transfer-tagged transactions are EXCLUDED from dashboard income/spend/net
  (getDashboardSummary/Range/Trend use NOT EXISTS on group_type='transfer').
  Transfers between own accounts otherwise double-count both sides.
- Budget actuals split multi-category transactions evenly (amount / n).
- Savings rate = savings-group actuals / income (not income − expenses).
  Net = income − expenses − savings.
- Currency EUR, German locale formatting. Months 'YYYY-MM'.

## AI integration (both read OPENAI_API_KEY from main-process env)
- `electron/ai.ts`: batch categorization suggestions, OpenAI Responses API
  with strict JSON schema, writes ai_suggestions + auto-applies above
  confidence threshold from ai_settings. Also suggests up to 2 tags per
  transaction (writes ai_tag_suggestions) with their own independent
  confidence — auto-applied against the same threshold as categories, but
  with no interaction with the stricter 0.95 transfer-category floor (that
  check is category/transfer-specific). A transaction can end up with a
  confident category but a held-back tag, or vice versa.
- `electron/ai-chat.ts`: chat assistant. 12 tools (read: months, summary,
  category spend, trend, transactions, categories, budgets, actuals; write:
  set_budget, create_category, add_transaction, create_rule). Tool loop max
  10 iterations. Tool results are period-labelled (single_month vs
  full_year_cumulative) so the model doesn't misread annual sums as monthly.
  System prompt gets view context injected (VIEW_CONTEXT map).
- Every OpenAI call is logged to ai_requests with tokens + computed cost
  (rates from ai_settings.input/output_cost_per_1m); visible in Settings.
- Chat conversations persist to chat_sessions (auto-saved after each reply,
  title = first user message); history panel in the chat UI.
- Writes from chat trigger a full renderer data refresh via onDataChanged.
- Raw `fetch` is used everywhere — the `openai` npm SDK is NOT installed.
- `.env` loads in dev (dotenv); packaged builds need a real env var.

## UX conventions
- Light theme only. Toasts for create/update/delete feedback.
- Action buttons use `.rule-action` letter icons: Add=A, Save=S, Delete=D,
  Quick=Q, Custom=C.
- Cross-view refresh after categorization changes uses the
  `categorizationVersion` counter in App.tsx.

## Build/release gotchas
- Windows packaging may need Developer Mode (symlinks) or elevated shell.
- Packaged app runs under `file://` — import assets, no absolute paths.
- Keep build outputs out of git (`dist/`, `dist-electron/`, `release/`);
  example CSVs ignored (`examples/*.csv`).
- DKB CSV quirk: headers are `Zahlungsempfänger*in` / `Zahlungspflichtige*r`
  (importer also matches mojibake variants); `Umsatztyp` (Eingang/Ausgang)
  picks which side is the payee.

## Release process
- Ship a release: `npm version patch && git push --follow-tags`. This bumps
  `package.json` (source of truth for the version) and pushes a matching
  `vX.Y.Z` tag, which triggers `.github/workflows/release.yml` on GitHub
  Actions (matrix: `macos-latest` + `windows-latest`, runs `npm run release`
  → `electron-builder --publish always`).
- CI publishes a **draft** GitHub Release (electron-builder's default) with
  mac DMG + ZIP (arm64 + x64), `latest-mac.yml`, the Windows NSIS installer,
  and `latest.yml`. Sanity-check the artifacts, then publish the draft
  manually on GitHub.
- Auto-update (`electron-updater`, wired in `electron/main.ts`, packaged-only
  via `app.isPackaged`):
  - **Windows:** fully automatic — downloads in the background, prompts to
    restart via a native dialog, `quitAndInstall()` on confirm.
  - **macOS:** the app is unsigned, and `electron-updater` refuses to install
    unsigned updates, so macOS only gets a native "update available" dialog
    linking to the GitHub releases page — no auto-download/install there.
- **Apple signing/notarization (not implemented, later add-on):** requires
  an Apple Developer account ($99/yr) — a Developer ID cert (`CSC_LINK` /
  `CSC_KEY_PASSWORD` CI secrets), `mac.notarize: true` plus Apple ID API-key
  secrets, and hardened runtime entitlements. Once signed, remove the macOS
  dialog fallback in `setupAutoUpdater` (`electron/main.ts`) and let it use
  the same full auto-update path as Windows.
