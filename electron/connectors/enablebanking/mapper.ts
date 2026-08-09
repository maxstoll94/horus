import { makeRawHash } from '../../importers/utils'
import type { SyncedTransactionInsert } from '../../db'
import type { Transaction } from './types'

// Field shapes validated against real DKB data (scripts/eb-test/output/*.json):
// amount is an unsigned decimal string, sign carried separately via
// credit_debit_indicator; for outgoing (DBIT) the real counterparty is
// creditor.name (debtor.name is just the generic card-issuer placeholder),
// and vice versa for incoming (CRDT).
export function mapTransaction(tx: Transaction, accountLabel: string): SyncedTransactionInsert {
  const isCredit = tx.credit_debit_indicator === 'CRDT'
  const amount = Number.parseFloat(tx.transaction_amount.amount) * (isCredit ? 1 : -1)
  const payee = (isCredit ? tx.debtor?.name : tx.creditor?.name) ?? null
  const counterpartyIban = (isCredit ? tx.debtor_account?.iban : tx.creditor_account?.iban) ?? null
  const purpose = tx.remittance_information?.length ? tx.remittance_information.join(' ') : null
  const bookingDate = tx.booking_date ?? tx.value_date
  if (!bookingDate) {
    throw new Error(`Transaction ${tx.entry_reference ?? '(no entry_reference)'} has no booking_date or value_date.`)
  }

  const rawHash = makeRawHash([
    bookingDate,
    tx.value_date,
    amount.toString(),
    tx.transaction_amount.currency,
    payee,
    purpose,
    counterpartyIban,
  ])

  return {
    account: accountLabel,
    bookingDate,
    valueDate: tx.value_date ?? null,
    amount,
    currency: tx.transaction_amount.currency,
    payee,
    purpose,
    iban: counterpartyIban,
    bic: null,
    reference: null,
    method: null,
    rawHash,
    bankTransactionId: tx.entry_reference || rawHash,
  }
}
