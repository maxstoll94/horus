# Enable Banking test script

Standalone, dependency-free Node script that proves the full Enable Banking
chain end-to-end against a real account: JWT auth -> ASPSP lookup -> consent
-> session -> balances/transactions. See `.context/attachments/.../plan.md`
("Step 1") for the full design.

## One-time setup

1. Generate an RSA key pair + self-signed certificate for your Enable
   Banking application:

   ```
   openssl genrsa -out scripts/eb-test/private-key.pem 2048
   openssl req -new -x509 -key scripts/eb-test/private-key.pem \
     -out scripts/eb-test/certificate.pem -days 730 -subj "/CN=horus-eb-test"
   ```

2. In the [Enable Banking Control Panel](https://enablebanking.com/sign-in/),
   register a new **Production** application:
   - Certificate: "Generate outside the browser and import public
     certificate" -> upload `scripts/eb-test/certificate.pem`.
   - Allowed redirect URLs: `https://localhost:53289/eb-callback` (must be
     `https`, even for localhost — plain `http` is rejected).
   - Note the `app_id` shown after registration.

3. Activate the application in restricted-production mode by linking one
   account via the Control Panel's "Activate by linking accounts" button
   (this alone does not create a session your own app can query — you still
   need to run this script to get real access).

4. Copy `config.example.json` to `config.json` and fill in `app_id` (the
   `key_path` default already points at `private-key.pem`).

## Running

```
node scripts/eb-test/eb-test.mjs
```

First run: prints application status, finds DKB, opens your browser for
consent + bank login, and waits for the redirect. The local redirect
listener is HTTPS with a self-signed cert (auto-generated on first run) —
your browser will likely show an "unsafe certificate" warning for it, which
is expected; click through, or paste the final URL from the address bar
into the terminal prompt if automatic capture doesn't work.

Subsequent runs reuse the saved session (`session.json`) until it expires.

Output: balances + transactions printed to the terminal, full raw JSON per
account written to `output/<iban>.json`.

## Files never committed

`*.pem`, `config.json`, `session.json`, and `output/` all contain real
credentials or real transaction data and are gitignored — do not remove
those entries from `.gitignore`.
