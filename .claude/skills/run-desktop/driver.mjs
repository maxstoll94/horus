// REPL driver for Horus (Electron app). Runs on macOS with a real display
// (no xvfb needed there). Designed for agents: wrap in tmux, send-keys
// commands, capture-pane output.
import { _electron as electron } from 'playwright-core';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

const APP_DIR = path.resolve(import.meta.dirname, '../../..');
const SHOT_DIR = process.env.SCREENSHOT_DIR || '/tmp/shots';
fs.mkdirSync(SHOT_DIR, { recursive: true });

let app = null;
let page = null;

const electronBin = process.platform === 'darwin'
  ? path.join(APP_DIR, 'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron')
  : path.join(APP_DIR, 'node_modules/electron/dist/electron');

const COMMANDS = {
  async launch() {
    if (app) return console.log('already launched');
    app = await electron.launch({
      executablePath: electronBin,
      args: ['--no-sandbox', APP_DIR],
      timeout: 30_000,
    });
    await new Promise(r => setTimeout(r, 3_000));
    page = app.windows().find(w => !w.url().startsWith('devtools://'))
        ?? await app.firstWindow();
    console.log('launched.', app.windows().length, 'windows:');
    for (const w of app.windows()) console.log(' ', w.url());
  },

  async ss(name) {
    if (!page) return console.log('ERROR: launch first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  async click(sel) {
    if (!page) return console.log('ERROR: launch first');
    const r = await page.evaluate(s => {
      const el = document.querySelector(s);
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK';
    }, sel);
    console.log('click', sel, '→', r);
  },

  // Real mouse click (mousedown+mouseup+click) via Playwright locator —
  // required for react-select controls, which open on mousedown, not on a
  // synthetic el.click() (which only fires a bare "click" event).
  async 'rclick'(sel, nth) {
    if (!page) return console.log('ERROR: launch first');
    try {
      const loc = nth !== undefined ? page.locator(sel).nth(Number(nth)) : page.locator(sel).first();
      await loc.click({ timeout: 5000 });
      console.log('rclick', sel, nth ?? '', '→ OK');
    } catch (e) { console.log('ERROR:', e.message); }
  },

  async 'click-text'(...args) {
    if (!page) return console.log('ERROR: launch first');
    const text = args.join(' ');
    const r = await page.evaluate(t => {
      // Prefer real interactive elements; only fall back to generic
      // containers (li/td/div) if nothing interactive matches, and even
      // then prefer leaf nodes (no element children) to avoid grabbing a
      // wrapper whose collapsed textContent happens to equal the target.
      const interactive = [...document.querySelectorAll('button, a, [role="button"], input[type="submit"]')];
      let el = interactive.find(e => e.textContent?.trim() === t)
            ?? interactive.find(e => e.textContent?.includes(t));
      if (!el) {
        const containers = [...document.querySelectorAll('li, td, div, span')]
          .filter(e => e.children.length === 0);
        el = containers.find(e => e.textContent?.trim() === t)
          ?? containers.find(e => e.textContent?.includes(t));
      }
      if (!el) return 'NOT_FOUND';
      el.click(); return 'OK: ' + el.tagName + ' "' + el.textContent?.trim().slice(0,40) + '"';
    }, text);
    console.log('click-text', JSON.stringify(text), '→', r);
  },

  async type(...args)  { if (page) await page.keyboard.type(args.join(' '), { delay: 20 }); },
  async press(key)  { if (page) await page.keyboard.press(key); },

  async wait(sel) {
    if (!page) return console.log('ERROR: launch first');
    try { await page.waitForSelector(sel, { timeout: 10_000 }); console.log('found:', sel); }
    catch { console.log('TIMEOUT:', sel); }
  },

  async sleep(ms) { await new Promise(r => setTimeout(r, Number(ms) || 1000)); },

  async 'accept-next-dialog'() {
    if (!page) return console.log('ERROR: launch first');
    page.once('dialog', d => { console.log('dialog:', d.message()); d.accept(); });
    console.log('armed: next dialog will be accepted');
  },

  async 'dismiss-next-dialog'() {
    if (!page) return console.log('ERROR: launch first');
    page.once('dialog', d => { console.log('dialog:', d.message()); d.dismiss(); });
    console.log('armed: next dialog will be dismissed');
  },

  async eval(...args) {
    if (!page) return console.log('ERROR: launch first');
    const expr = args.join(' ');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  async text(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)',
      sel || null));
  },

  // Bypass the native OS file picker (Playwright can't drive it): monkeypatch
  // dialog.showOpenDialog in the main process to return a fixed path.
  async 'patch-dialog'(filePath) {
    if (!app) return console.log('ERROR: launch first');
    await app.evaluate(async ({ dialog }, fp) => {
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fp] });
    }, filePath);
    console.log('patched dialog.showOpenDialog →', filePath);
  },

  async html(sel) {
    if (!page) return console.log('ERROR: launch first');
    console.log(await page.evaluate(
      s => (s ? document.querySelector(s) : document.body)?.outerHTML?.slice(0, 3000) ?? '(null)',
      sel || null));
  },

  async windows() {
    if (!app) return console.log('ERROR: launch first');
    for (const w of app.windows()) console.log(' ', w.url());
  },

  async quit() { if (app) await app.close().catch(()=>{}); app = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const stdin = fs.createReadStream(null, { fd: fs.openSync('/dev/stdin', 'r') });
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

rl.on('line', async line => {
  const [cmd, ...rest] = line.trim().split(/\s+/);
  if (!cmd) return rl.prompt();
  const fn = COMMANDS[cmd];
  if (!fn) { console.log('unknown:', cmd, '— try: help'); return rl.prompt(); }
  try { await fn(...rest); } catch (e) { console.log('ERROR:', e.message); }
  if (cmd === 'quit') { rl.close(); process.exit(0); }
  rl.prompt();
});
rl.on('close', async () => { await COMMANDS.quit(); process.exit(0); });

console.log('Horus driver — "help" for commands, "launch" to start');
rl.prompt();
