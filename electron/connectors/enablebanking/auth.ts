import { shell, app } from 'electron'
import { createServer as createHttpsServer, type Server } from 'node:https'
import { execSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import {
  createBankConnection,
  updateBankConnection,
  getBankConnection,
  upsertBankAccountsByIban,
  type BankAccountRow,
} from '../../db'
import { createSession, deleteSession, startAuthorization } from './client'
import type { EnableBankingCredentials } from './types'

// Fixed by convention: this is what users register as the redirect URL in
// the Enable Banking Control Panel when setting up their application.
// Must be https — a plain http localhost URL is rejected by their API.
const REDIRECT_URL = 'https://localhost:53289/eb-callback'
const REDIRECT_PORT = 53289
const AUTH_TIMEOUT_MS = 5 * 60 * 1000

function certPaths() {
  const dir = app.getPath('userData')
  return { cert: path.join(dir, 'eb-localhost-cert.pem'), key: path.join(dir, 'eb-localhost-key.pem') }
}

function ensureLocalhostCert() {
  const { cert, key } = certPaths()
  if (existsSync(cert) && existsSync(key)) return { cert, key }
  execSync(
    `openssl req -x509 -newkey rsa:2048 -keyout "${key}" -out "${cert}" -days 825 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1"`,
    { stdio: 'ignore' }
  )
  return { cert, key }
}

type PendingAuth = {
  state: string
  resolve: (code: string) => void
  reject: (error: Error) => void
  server: Server | null
}

let pendingAuth: PendingAuth | null = null

// Races the loopback HTTPS server actually receiving the redirect against
// completeAuthManually() being called from the renderer (the user pasted the
// URL by hand — browsers may refuse the self-signed cert before the request
// ever reaches us), plus an overall timeout.
async function waitForRedirectCode(state: string): Promise<string> {
  let server: Server | null = null
  let resolveCode!: (code: string) => void
  let rejectCode!: (error: Error) => void
  const codePromise = new Promise<string>((resolve, reject) => {
    resolveCode = resolve
    rejectCode = reject
  })

  try {
    const { cert, key } = ensureLocalhostCert()
    server = createHttpsServer({ key: readFileSync(key), cert: readFileSync(cert) }, (req, res) => {
      const reqUrl = new URL(req.url ?? '/', REDIRECT_URL)
      const code = reqUrl.searchParams.get('code')
      const returnedState = reqUrl.searchParams.get('state')
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end('<html><body><h1>Horus</h1><p>Done — you can close this tab and return to Horus.</p></body></html>')
      if (!code) return
      if (returnedState !== state) {
        rejectCode(new Error('State mismatch on bank redirect.'))
        return
      }
      resolveCode(code)
    })
    await new Promise<void>((resolve) => server!.listen(REDIRECT_PORT, '127.0.0.1', resolve))
  } catch {
    server = null // local listener unavailable — manual paste is still possible
  }

  pendingAuth = { state, resolve: resolveCode, reject: rejectCode, server }

  const timeoutPromise = new Promise<string>((_, reject) =>
    setTimeout(() => reject(new Error('Timed out waiting for the bank redirect (5 minutes).')), AUTH_TIMEOUT_MS)
  )

  try {
    return await Promise.race([codePromise, timeoutPromise])
  } finally {
    server?.close()
    pendingAuth = null
  }
}

export type ConnectStatus = { type: 'waiting-for-redirect'; url: string } | { type: 'connected' }

export async function connectBank(
  params: {
    aspspName: string
    aspspCountry: string
    maximumConsentValidity: number
    connectionId?: number
  },
  credentials: EnableBankingCredentials,
  onStatus?: (status: ConnectStatus) => void
): Promise<{ connectionId: number; accounts: BankAccountRow[] }> {
  const connectionId =
    params.connectionId ??
    createBankConnection({
      provider: 'enablebanking',
      aspspName: params.aspspName,
      aspspCountry: params.aspspCountry,
    })
  updateBankConnection(connectionId, { status: 'pending' })

  const state = randomUUID()
  const ninetyDaysMs = 90 * 24 * 60 * 60 * 1000
  const maxMs = params.maximumConsentValidity * 1000
  const validUntil = new Date(Date.now() + Math.min(ninetyDaysMs, maxMs)).toISOString()

  const auth = await startAuthorization(credentials, {
    aspspName: params.aspspName,
    aspspCountry: params.aspspCountry,
    state,
    redirectUrl: REDIRECT_URL,
    validUntil,
    psuType: 'personal',
  })

  onStatus?.({ type: 'waiting-for-redirect', url: auth.url })
  shell.openExternal(auth.url)

  let code: string
  try {
    code = await waitForRedirectCode(state)
  } catch (error) {
    updateBankConnection(connectionId, { status: 'pending' })
    throw error
  }

  const session = await createSession(credentials, code)
  updateBankConnection(connectionId, {
    sessionId: session.session_id,
    status: 'active',
    validUntil: session.access.valid_until,
  })

  const accounts = upsertBankAccountsByIban(
    connectionId,
    'enablebanking',
    session.accounts.map((a) => ({
      iban: a.account_id?.iban ?? a.uid,
      uid: a.uid,
      name: a.name ?? a.account_id?.iban ?? a.uid,
    }))
  )

  onStatus?.({ type: 'connected' })
  return { connectionId, accounts }
}

// Renderer-driven fallback: the user pasted the final redirect URL by hand
// because the local HTTPS listener's self-signed cert was refused.
export function completeAuthManually(redirectUrl: string): void {
  if (!pendingAuth) {
    throw new Error('No authorization is currently in progress.')
  }
  let parsed: URL
  try {
    parsed = new URL(redirectUrl)
  } catch {
    throw new Error('Not a valid URL.')
  }
  const code = parsed.searchParams.get('code')
  const returnedState = parsed.searchParams.get('state')
  if (!code || returnedState !== pendingAuth.state) {
    throw new Error('That URL does not match the current authorization request.')
  }
  pendingAuth.resolve(code)
}

export function cancelConnect(): void {
  pendingAuth?.reject(new Error('Cancelled.'))
  pendingAuth?.server?.close()
  pendingAuth = null
}

// Best-effort: revoke the session with Enable Banking, but always mark the
// connection revoked locally even if the API call fails (e.g. already
// expired) — the user's intent to disconnect should never get stuck.
export async function disconnect(connectionId: number, credentials: EnableBankingCredentials): Promise<void> {
  const connection = getBankConnection(connectionId)
  if (connection?.sessionId) {
    try {
      await deleteSession(credentials, connection.sessionId)
    } catch {
      // ignore — proceed to mark revoked locally regardless
    }
  }
  updateBankConnection(connectionId, { status: 'revoked' })
}
