---
name: run-desktop
description: Build, run, and drive the Horus Electron desktop app. Use when asked to start the desktop app, take a screenshot of it, click through its UI, or verify a change works end-to-end (not just typecheck/build).
---

Horus is an Electron desktop app (React renderer + better-sqlite3 main
process). For agent/automated use, drive it via the Playwright REPL at
`.claude/skills/run-desktop/driver.mjs`. On macOS there's a real display,
so no xvfb is needed — this launches the actual app window.

All paths are relative to the repo root.

## Build

```bash
npx tsc && npx vite build
```

This produces `dist/` (renderer) and `dist-electron/` (main + preload) —
the same production bundle a packaged install runs, loaded via
`win.loadFile()` rather than a dev server. This is deliberate: testing the
production bundle catches real bugs a `vite dev` session might not (dev
mode doesn't exercise the same file:// loading path).

## Run (agent path)

```bash
node .claude/skills/run-desktop/driver.mjs
```

Wrap in tmux for interactive use — send-keys, then poll capture-pane for
the *last line only* (`tail -1`), not a `grep` over the whole pane; old
prompts linger in scrollback and will make a wait-loop return early:

```bash
tmux new-session -d -s horus -x 220 -y 50
tmux send-keys -t horus 'node .claude/skills/run-desktop/driver.mjs' Enter
sleep 3   # simple sleeps are more reliable here than polling loops — see Gotchas
tmux send-keys -t horus 'launch' Enter
sleep 6
tmux capture-pane -t horus -p | tail -5
tmux send-keys -t horus 'ss landing' Enter
sleep 1
```

Then actually open the screenshot from `/tmp/shots/<name>.png` (override
dir: `SCREENSHOT_DIR`) with your image-reading tool. Don't assume success
from the command echo alone.

### Commands

| command | what it does |
|---|---|
| `launch` | build must already be done; launches the app, waits for windows |
| `ss [name]` | screenshot → `/tmp/shots/<name>.png` |
| `click <css-sel>` | synthetic `el.click()` — fine for plain buttons/links |
| `rclick <css-sel> [nth]` | **real** mousedown+mouseup+click via Playwright locator — required for react-select controls (see Gotchas) |
| `click-text <text>` | click the first interactive element (button/a/[role=button]) whose text matches; falls back to leaf containers |
| `type <text>` / `press <key>` | keyboard input into whatever's focused |
| `wait <css-sel>` | wait for element, 10s timeout |
| `eval <js>` | evaluate an expression in the renderer, print JSON. Use single-quoted JS strings inside — backslash-escaped quotes get mangled by tmux send-keys |
| `text [css-sel]` | print innerText |
| `html [css-sel]` | print outerHTML (first 3000 chars) |
| `windows` | list Electron windows (only ever one here — no BrowserView) |
| `patch-dialog <path>` | monkeypatch `dialog.showOpenDialog` in the main process to return `<path>` — the only way to drive the native CSV file picker |
| `accept-next-dialog` / `dismiss-next-dialog` | arm a one-shot handler for the next `window.confirm()` (Danger Zone actions use these) — otherwise Playwright silently auto-dismisses them |
| `quit` | close the app, exit the driver |

## Run (human path)

```bash
npm run dev   # vite dev server + auto-launched Electron window
```

## Gotchas

- **react-select controls need `rclick`, not `click`/`click-text`.**
  react-select opens its menu on `mousedown`, but the DOM `.click()` method
  only synthesizes a bare `click` event (no preceding mousedown/mouseup).
  Category/tag pickers throughout the app are react-select — always use
  `rclick [class*=rs__control] <nth>` for them. Find the right `nth` by
  counting controls in DOM order (the sidebar account filter is usually
  index 0).

- **The native CSV file picker can't be automated directly.** Use
  `patch-dialog <path>` right after `launch`, before clicking "Pick CSV" —
  it swaps `dialog.showOpenDialog` in the main process for one that returns
  your path immediately.

- **`window.confirm()` dialogs (Danger Zone) are auto-dismissed by
  Playwright unless armed first.** Call `accept-next-dialog` immediately
  before the click that triggers the confirm, not after.

- **tmux wait-loops that `grep` the whole pane for a prompt string are
  unreliable** — old output in scrollback matches too. Either check only
  the last line (`tail -1`/`tail -3`) or just use a fixed `sleep` (2-6s
  depending on the step); this proved more reliable in practice than
  clever polling.

- **Amount edits, tag/rule mutations, and manual-transaction adds each
  refresh a specific slice of React state** — several past bugs were a
  mutation succeeding in the DB but a *different* view's cached list not
  refreshing (Rules page, Tags page, Dashboard tag chart, Transactions
  list after adding via Budget). If a change doesn't show up somewhere
  after an action that should affect it, don't assume it's your driver
  script's fault — click `Refresh` on that view to check whether it's a
  real staleness bug before concluding the driver missed a click.

- **Unpackaged runs (this driver AND `npm run dev`) are isolated from the
  real installed app — but this required an explicit fix, so don't assume
  it elsewhere.** Electron's default userData path is derived from the app
  name alone (`package.json` `name`, "horus"), and by default nothing
  separates a packaged install from a local unpackaged run using the same
  name — this was verified directly (a real bank connection made through
  this driver showed up in the actual installed app's database, and vice
  versa). `electron/main.ts` now explicitly redirects userData for any
  unpackaged run (`!app.isPackaged`) to a sibling `horus-dev` directory
  before `app` is ready, so packaged installs keep using `horus/horus.db`
  and everything else (dev server, this driver, any future test harness)
  uses `horus-dev/horus.db` instead. Danger Zone actions through this driver
  are safe again as a result. **This driver and `npm run dev` still share
  `horus-dev` with each other** (same isolation mechanism, same non-packaged
  condition) — that's expected and fine, since both are test/dev contexts;
  only the packaged/installed app is meant to be off-limits.

## Troubleshooting

- **Launch timeout / blank window:** `dist/` or `dist-electron/` missing
  or stale — rerun the build step.
- **`click-text` reports `OK` but nothing visibly happened:** it may have
  matched a wrapping `<div>`/`<span>` whose collapsed textContent happens
  to equal the target, instead of the real button inside it (the fallback
  container search is a last resort, not a precise match). Prefer `rclick`
  with a specific selector when `click-text` misbehaves.
- **Electron already running / stale lock:** `pkill -f "Electron.app/Contents/MacOS/Electron.*winnipeg"`
