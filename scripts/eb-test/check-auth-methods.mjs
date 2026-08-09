// One-off diagnostic: confirm JWT auth works, then print DKB's auth_methods
// (name + approach: REDIRECT/EMBEDDED/DECOUPLED) from GET /aspsps.
import { readFileSync } from 'node:fs';
import { createSign, randomUUID } from 'node:crypto';

const config = JSON.parse(readFileSync('scripts/eb-test/config.json', 'utf8'));
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
  const sigb64 = signature.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${signingInput}.${sigb64}`;
}

async function call(path) {
  const res = await fetch(`https://api.enablebanking.com${path}`, {
    headers: { Authorization: `Bearer ${signJwt()}` },
  });
  const text = await res.text();
  if (!res.ok) {
    console.error(`FAILED ${path}: ${res.status}\n${text}`);
    process.exit(1);
  }
  return JSON.parse(text);
}

const app = await call('/application');
console.log(`Checkpoint 1 OK — application: ${app.name} (${app.environment}, active=${app.active})`);

const aspsps = await call('/aspsps?country=DE');
const dkb = aspsps.aspsps.filter((a) => a.name.toUpperCase().includes('DKB'));

if (dkb.length === 0) {
  console.log('No ASPSP with "DKB" in the name found. Near matches:');
  for (const a of aspsps.aspsps.slice(0, 20)) console.log(` - ${a.name}`);
  process.exit(1);
}

for (const bank of dkb) {
  console.log(`\n${bank.name} (${bank.country}) — maximum_consent_validity: ${bank.maximum_consent_validity}`);
  for (const m of bank.auth_methods ?? []) {
    console.log(`  - name=${m.name} title=${m.title ?? ''} approach=${m.approach} psu_type=${m.psu_type} hidden=${m.hidden_method ?? false}`);
  }
}
