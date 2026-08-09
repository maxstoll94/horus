import { listBankConnectionsWithAccounts, insertSyncedTransactions, updateBankConnection, maybeUpdateAccountAnchor, applyRulesToUncategorized } from '../../db'
import { getAccountTransactions, getAccountBalances, SessionExpiredError } from './client'
import { mapTransaction } from './mapper'
import type { EnableBankingCredentials, Transaction } from './types'

export type AccountSyncResult = {
  bankAccountId: number
  inserted: number
  skipped: number
  error?: string
}

export type SyncResult = {
  connectionId: number
  perAccount: AccountSyncResult[]
  needsReauth: boolean
}

function overlapDateFrom(syncFromDate: string | null, lastBookedDate: string | null): string | null {
  if (!lastBookedDate) return syncFromDate
  const overlap = new Date(new Date(lastBookedDate).getTime() - 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10)
  if (!syncFromDate) return overlap
  return overlap > syncFromDate ? overlap : syncFromDate
}

// Keeps the account's anchor balance fresh from the bank's own ledger on
// every sync — same maybeUpdateAccountAnchor() the CSV importers use, so it
// only ever moves forward and stays consistent with currentBalance's
// anchor-plus-booked-transactions-since model. CLBD ("Accounting balance")
// is the settled/closing figure, matching what CSV balance lines represent —
// not ITAV ("Interim available", includes pending holds) or XPCD ("Expected").
// Best-effort: a balance-fetch hiccup shouldn't fail a sync that otherwise
// succeeded, but a SessionExpiredError still needs to propagate for reauth.
async function syncAccountAnchor(
  credentials: EnableBankingCredentials,
  uid: string,
  accountId: number
): Promise<void> {
  try {
    const { balances } = await getAccountBalances(credentials, uid)
    const accounting = balances.find((b) => b.balance_type === 'CLBD')
    if (accounting?.reference_date) {
      maybeUpdateAccountAnchor(accountId, Number.parseFloat(accounting.balance_amount.amount), accounting.reference_date)
    }
  } catch (error) {
    if (error instanceof SessionExpiredError) throw error
  }
}

// Fetches are all held in memory and committed in one transaction per
// account (inside insertSyncedTransactions) — a crash mid-fetch writes
// nothing, so retrying a sync is always safe.
export async function syncConnection(
  connectionId: number,
  credentials: EnableBankingCredentials
): Promise<SyncResult> {
  const connection = listBankConnectionsWithAccounts().find((c) => c.id === connectionId)
  if (!connection) {
    throw new Error(`Bank connection ${connectionId} not found.`)
  }

  const perAccount: AccountSyncResult[] = []
  let needsReauth = false
  const dateTo = new Date().toISOString().slice(0, 10)

  for (const account of connection.accounts) {
    if (!account.isEnabled || needsReauth) continue

    // No cutoff configured yet and never synced before — there's no sane
    // date range to fetch. Fail loudly instead of silently defaulting to
    // "today only", which would report a false "0 inserted" success.
    if (!account.syncFromDate && !account.lastBookedDate) {
      perAccount.push({ bankAccountId: account.id, inserted: 0, skipped: 0, error: 'No sync-from date set' })
      continue
    }

    const dateFrom = overlapDateFrom(account.syncFromDate, account.lastBookedDate) ?? dateTo

    try {
      let transactions: Transaction[] = []
      let continuationKey: string | undefined
      do {
        const page = await getAccountTransactions(credentials, account.uid, { dateFrom, dateTo, continuationKey })
        transactions = transactions.concat(page.transactions ?? [])
        continuationKey = page.continuation_key
      } while (continuationKey)

      const rows = transactions.filter((t) => t.status === 'BOOK').map((t) => mapTransaction(t, account.accountName))
      const { inserted, skipped } = insertSyncedTransactions(account.id, account.accountId, rows)
      perAccount.push({ bankAccountId: account.id, inserted, skipped })

      await syncAccountAnchor(credentials, account.uid, account.accountId)
    } catch (error) {
      if (error instanceof SessionExpiredError) {
        needsReauth = true
        updateBankConnection(connectionId, { status: 'expired' })
        perAccount.push({ bankAccountId: account.id, inserted: 0, skipped: 0, error: 'Session expired' })
      } else {
        throw error
      }
    }
  }

  applyRulesToUncategorized()

  return { connectionId, perAccount, needsReauth }
}
