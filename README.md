# Horus

An offline-first personal finance app. Import bank CSVs (DKB, ING,
Sparkasse, Volksbank), categorize transactions, set budgets, and track
spending — all data stays local in a SQLite database on your machine.

## Install

Download the latest release for your platform from the
[Releases page](https://github.com/maxstoll94/horus/releases/latest).

Horus builds are currently **unsigned**, so both operating systems will
warn you before the first launch:

- **macOS:** opening the DMG and dragging Horus to Applications, the first
  launch will be blocked ("Apple could not verify..."). Go to
  **System Settings → Privacy & Security**, scroll down, and click
  **"Open Anyway"** next to the Horus warning, then confirm in the dialog
  that appears.
- **Windows:** running the installer will show a SmartScreen warning.
  Click **"More info"**, then **"Run anyway"**.

After the first launch, Horus checks for updates automatically:

- **Windows** updates download and install automatically — you'll get a
  prompt to restart when one is ready.
- **macOS** shows a dialog linking to the latest release when a new version
  is available; download and reinstall it manually (full auto-update
  requires a signed build, see `AGENTS.md`).

Your data (transactions, categories, budgets) lives in a local SQLite
database and survives updates and reinstalls.

## Development

```sh
npm install
npm run dev     # start the app in dev mode
npm run build   # produce a packaged build for your current platform
npm run lint
```

See `AGENTS.md` for architecture, data model, and the release process.
