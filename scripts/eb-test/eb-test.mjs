// Standalone, dependency-free Enable Banking test script (see plan Step 1).
// Proves the full chain end-to-end: JWT auth -> ASPSP lookup -> consent ->
// session -> balances/transactions, against a real DKB account.
//
// Usage: node scripts/eb-test/eb-test.mjs
// Config: scripts/eb-test/config.json (copy from config.example.json)

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createSign, randomUUID } from 'node:crypto';
import { createServer as createHttpsServer } from 'node:https';
import { execSync, spawn } from 'node:child_process';
import readline from 'node:readline';

const ROOT = 'scripts/eb-test';
const CONFIG_PATH = `${ROOT}/config.json`;
const SESSION_PATH = `${ROOT}/session.json`;
const OUTPUT_DIR = `${ROOT}/output`;
const LOCALHOST_CERT = `${ROOT}/localhost-cert.pem`;
const LOCALHOST_KEY = `${ROOT}/localhost-key.pem`;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

if (!existsSync(CONFIG_PATH)) {
  die(`Missing ${CONFIG_PATH}. Copy config.example.json to config.json and fill in app_id/key_path.`);
}
const config = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'));
const REDIRECT_URL = config.redirect_url || 'https://localhost:53289/eb-callback';
const privateKey = readFileSync(config.key_path, 'utf8');

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function signJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT', kid: config.app_id };
  const payload = {
    iss: 'enablebanking.com',
    aud: 'api.enablebanking.com',
    iat: now - 60,
    exp: now + 3600,
  };
  const signingInput = `${base64url(JSON.stringify(header))}.${base64url(JSON.stringify(payload))}`;
  const signature = createSign('RSA-SHA256').update(signingInput).sign(privateKey);
  return `${signingInput}.${base64url(signature)}`;
}

async function api(method, path, body) {
  const res = await fetch(`https://api.enablebanking.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${signJwt()}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    die(`${method} ${path} failed: ${res.status}\n${text}`);
  }
  return text ? JSON.parse(text) : undefined;
}

function openInBrowser(url) {
  const cmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  try {
    spawn(cmd, [url], { detached: true, stdio: 'ignore' }).unref();
  } catch {
    // URL is printed regardless, so this is a pure convenience.
  }
}

function ensureLocalhostCert() {
  if (existsSync(LOCALHOST_CERT) && existsSync(LOCALHOST_KEY)) return;
  console.log('Generating a self-signed TLS certificate for the local redirect listener...');
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout ${LOCALHOST_KEY} -out ${LOCALHOST_CERT} -days 825 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
    { stdio: 'inherit' },
  );
}

// Races: (a) the loopback HTTPS server actually receiving the redirect,
// (b) the user pasting the final URL by hand (browsers may reject the
// self-signed cert before the request ever reaches us), (c) a 5 min timeout.
async function waitForRedirect(redirectUrl, state) {
  const url = new URL(redirectUrl);
  const port = Number(url.port || 443);

  let resolveCode;
  let rejectCode;
  const codePromise = new Promise((res, rej) => {
    resolveCode = res;
    rejectCode = rej;
  });

  let server;
  try {
    ensureLocalhostCert();
    server = createHttpsServer(
      { key: readFileSync(LOCALHOST_KEY), cert: readFileSync(LOCALHOST_CERT) },
      (req, res) => {
        const reqUrl = new URL(req.url, redirectUrl);
        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Horus / Enable Banking</h1><p>Done — you can close this tab and return to the terminal.</p></body></html>');
        if (!code) return;
        if (returnedState !== state) {
          rejectCode(new Error(`State mismatch: expected ${state}, got ${returnedState}`));
          return;
        }
        resolveCode(code);
      },
    );
    server.on('error', (err) => {
      console.log(`(local HTTPS listener unavailable: ${err.message} — use manual paste below)`);
    });
    await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));
    console.log(`Listening on ${redirectUrl} for the bank redirect...`);
  } catch (err) {
    console.log(`(could not start local HTTPS listener: ${err.message} — use manual paste below)`);
  }

  console.log('\nYour browser may show an "unsafe certificate" warning for the localhost redirect —');
  console.log('that\'s expected (self-signed, local-only cert). Click through it and automatic capture');
  console.log('will proceed. If it still does not work, paste the full final URL from the address bar below.\n');

  let activeRl = null;
  async function pasteLoop() {
    for (;;) {
      const answer = await new Promise((resolve) => {
        activeRl = readline.createInterface({ input: process.stdin, output: process.stdout });
        activeRl.question('Paste redirect URL (or press Enter to keep waiting): ', (ans) => {
          activeRl.close();
          activeRl = null;
          resolve(ans);
        });
      });
      if (!answer.trim()) continue;
      try {
        const parsed = new URL(answer.trim());
        const code = parsed.searchParams.get('code');
        const returnedState = parsed.searchParams.get('state');
        if (code && returnedState === state) return code;
        console.log('No matching code/state found in that URL — try again.');
      } catch {
        console.log('Not a valid URL — try again.');
      }
    }
  }

  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timed out waiting for the bank redirect (5 minutes).')), 5 * 60 * 1000),
  );

  try {
    return await Promise.race([codePromise, pasteLoop(), timeoutPromise]);
  } finally {
    server?.close();
    activeRl?.close();
  }
}

function prompt(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

function formatTransaction(tx) {
  const sign = tx.credit_debit_indicator === 'CRDT' ? '+' : '-';
  const payee = tx.credit_debit_indicator === 'CRDT' ? tx.debtor?.name : tx.creditor?.name;
  const purpose = (tx.remittance_information ?? []).join(' ');
  const date = tx.booking_date ?? tx.value_date ?? tx.transaction_date ?? '';
  return `  ${date}  ${sign}${tx.transaction_amount.amount} ${tx.transaction_amount.currency}  ${payee ?? '(unknown)'}  ${purpose}`;
}

async function main() {
  mkdirSync(OUTPUT_DIR, { recursive: true });

  const app = await api('GET', '/application');
  console.log(`Checkpoint 1 OK — application "${app.name}" (${app.environment}), active=${app.active}`);
  if (!app.active) {
    die('Application is not active. Link an account via the Enable Banking Control Panel first, then re-run.');
  }

  const { aspsps } = await api('GET', '/aspsps?country=DE');
  const matches = aspsps.filter((a) => a.name.toUpperCase().includes('DKB'));

  let bank;
  if (matches.length === 1) {
    bank = matches[0];
  } else if (matches.length > 1) {
    console.log('Multiple ASPSPs match "DKB":');
    matches.forEach((a, i) => console.log(`  [${i}] ${a.name}`));
    const idx = Number(await prompt('Pick a number: '));
    bank = matches[idx];
    if (!bank) die('Invalid selection.');
  } else {
    console.log('No ASPSP matching "DKB" found. Available banks:');
    aspsps.slice(0, 30).forEach((a) => console.log(`  - ${a.name}`));
    die('Adjust the match filter in this script and re-run.');
  }
  console.log(`Target: ${bank.name} (${bank.country}) — maximum_consent_validity=${bank.maximum_consent_validity}s`);

  let session;
  if (existsSync(SESSION_PATH)) {
    const saved = JSON.parse(readFileSync(SESSION_PATH, 'utf8'));
    if (new Date(saved.valid_until) > new Date()) {
      console.log(`Reusing saved session (valid until ${saved.valid_until}).`);
      session = saved;
    }
  }

  if (!session) {
    const state = randomUUID();
    const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000;
    const maxMs = bank.maximum_consent_validity * 1000;
    const validUntil = new Date(Date.now() + Math.min(ninetyDaysMs, maxMs)).toISOString();

    const auth = await api('POST', '/auth', {
      access: { valid_until: validUntil },
      aspsp: { name: bank.name, country: bank.country },
      state,
      redirect_url: REDIRECT_URL,
      psu_type: 'personal',
    });

    console.log(`\nOpen this URL to authenticate with ${bank.name} (opening your browser now):\n${auth.url}\n`);
    openInBrowser(auth.url);

    const code = await waitForRedirect(REDIRECT_URL, state);
    console.log('Checkpoint 2 OK — got an authorization code.');

    const sessionRes = await api('POST', '/sessions', { code });
    session = {
      session_id: sessionRes.session_id,
      valid_until: sessionRes.access.valid_until,
      accounts: sessionRes.accounts,
    };
    writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
    console.log(`Session saved to ${SESSION_PATH} (valid until ${session.valid_until}).`);
  }

  console.log(`\nAccounts (${session.accounts.length}):`);
  for (const acc of session.accounts) {
    const iban = acc.account_id?.iban ?? acc.uid;
    console.log(`  - ${iban}  ${acc.name ?? ''}  ${acc.currency ?? ''}  (uid=${acc.uid})`);
  }

  const dateTo = new Date().toISOString().slice(0, 10);
  const dateFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  for (const acc of session.accounts) {
    const iban = acc.account_id?.iban ?? acc.uid;
    console.log(`\n=== ${iban} ===`);

    const balances = await api('GET', `/accounts/${acc.uid}/balances`);
    console.log('Balances:', JSON.stringify(balances.balances ?? balances, null, 2));

    let allTransactions = [];
    let continuationKey;
    do {
      const qs = new URLSearchParams({ date_from: dateFrom, date_to: dateTo });
      if (continuationKey) qs.set('continuation_key', continuationKey);
      const page = await api('GET', `/accounts/${acc.uid}/transactions?${qs}`);
      allTransactions = allTransactions.concat(page.transactions ?? []);
      continuationKey = page.continuation_key;
    } while (continuationKey);

    console.log(`Checkpoint 3 OK — ${allTransactions.length} transactions in the last 30 days.`);
    allTransactions.slice(0, 5).forEach((tx) => console.log(formatTransaction(tx)));

    const safeName = String(iban).replace(/[^A-Za-z0-9]/g, '_');
    const outPath = `${OUTPUT_DIR}/${safeName}.json`;
    writeFileSync(outPath, JSON.stringify({ balances, transactions: allTransactions }, null, 2));
    console.log(`Raw data written to ${outPath}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
