import { createJwt } from './jwt'
import type {
  Application,
  Aspsp,
  BalancesResponse,
  CreateSessionResponse,
  EnableBankingCredentials,
  StartAuthorizationResponse,
  TransactionsResponse,
} from './types'

const API_BASE = 'https://api.enablebanking.com'
const RETRY_BACKOFFS_MS = [2000, 8000, 30000]

export class EnableBankingError extends Error {
  readonly status: number
  readonly body: string

  constructor(message: string, status: number, body: string) {
    super(`${message}: ${status}${body ? `\n${body}` : ''}`)
    this.status = status
    this.body = body
  }
}

// Thrown specifically for session-scoped calls (accounts/*, session deletion)
// on a 401 — distinguishes "reconnect this bank" from a JWT/config problem,
// which sync.ts uses to mark the connection expired without failing loudly.
export class SessionExpiredError extends Error {}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function request<T>(
  credentials: EnableBankingCredentials,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const body = init.body !== undefined ? JSON.stringify(init.body) : undefined

  for (let attempt = 0; ; attempt++) {
    const jwt = createJwt(credentials.appId, credentials.privateKeyPem)
    const res = await fetch(`${API_BASE}${path}`, {
      method: init.method ?? 'GET',
      headers: {
        Authorization: `Bearer ${jwt}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body,
    })

    if (res.status === 429 && attempt < RETRY_BACKOFFS_MS.length) {
      const retryAfter = res.headers.get('retry-after')
      await sleep(retryAfter ? Number(retryAfter) * 1000 : RETRY_BACKOFFS_MS[attempt])
      continue
    }

    if (!res.ok) {
      const responseBody = await res.text()
      throw new EnableBankingError(`${init.method ?? 'GET'} ${path} failed`, res.status, responseBody)
    }

    const text = await res.text()
    return (text ? JSON.parse(text) : undefined) as T
  }
}

async function sessionRequest<T>(
  credentials: EnableBankingCredentials,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  try {
    return await request<T>(credentials, path, init)
  } catch (error) {
    if (error instanceof EnableBankingError && error.status === 401) {
      throw new SessionExpiredError(error.message)
    }
    throw error
  }
}

export function getApplication(credentials: EnableBankingCredentials): Promise<Application> {
  return request(credentials, '/application')
}

export function listAspsps(credentials: EnableBankingCredentials, country?: string): Promise<Aspsp[]> {
  const search = new URLSearchParams()
  if (country) search.set('country', country)
  return request<{ aspsps: Aspsp[] }>(credentials, `/aspsps?${search}`).then((res) => res.aspsps)
}

export function startAuthorization(
  credentials: EnableBankingCredentials,
  params: {
    aspspName: string
    aspspCountry: string
    state: string
    redirectUrl: string
    validUntil: string
    psuType: 'personal' | 'business'
  }
): Promise<StartAuthorizationResponse> {
  return request(credentials, '/auth', {
    method: 'POST',
    body: {
      access: { valid_until: params.validUntil },
      aspsp: { name: params.aspspName, country: params.aspspCountry },
      state: params.state,
      redirect_url: params.redirectUrl,
      psu_type: params.psuType,
    },
  })
}

export function createSession(
  credentials: EnableBankingCredentials,
  code: string
): Promise<CreateSessionResponse> {
  return request(credentials, '/sessions', { method: 'POST', body: { code } })
}

export function getAccountBalances(
  credentials: EnableBankingCredentials,
  uid: string
): Promise<BalancesResponse> {
  return sessionRequest(credentials, `/accounts/${encodeURIComponent(uid)}/balances`)
}

export function getAccountTransactions(
  credentials: EnableBankingCredentials,
  uid: string,
  params: { dateFrom?: string; dateTo?: string; continuationKey?: string }
): Promise<TransactionsResponse> {
  const search = new URLSearchParams()
  if (params.dateFrom) search.set('date_from', params.dateFrom)
  if (params.dateTo) search.set('date_to', params.dateTo)
  if (params.continuationKey) search.set('continuation_key', params.continuationKey)
  return sessionRequest(credentials, `/accounts/${encodeURIComponent(uid)}/transactions?${search}`)
}

export function deleteSession(credentials: EnableBankingCredentials, sessionId: string): Promise<void> {
  return sessionRequest(credentials, `/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' })
}
