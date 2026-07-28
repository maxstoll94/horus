import { parse } from 'csv-parse/sync'
import type { ImportResult, OwnAccount, ParsedTransaction, RawRecord } from './types'
import {
  buildHeaderMap,
  getHeaderValue,
  makeRawHash,
  normalizeHeader,
  parseEuroAmount,
  parseGermanDate,
} from './utils'

function parseIngDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const trimmed = value.trim()
  if (/^\d{8}$/.test(trimmed)) {
    return `${trimmed.slice(0, 4)}-${trimmed.slice(4, 6)}-${trimmed.slice(6, 8)}`
  }

  return parseGermanDate(trimmed)
}

function extractField(
  source: string | undefined,
  label: string,
  endLabels: string[]
) {
  if (!source) {
    return null
  }

  const lower = source.toLowerCase()
  const labelLower = label.toLowerCase()
  const start = lower.indexOf(labelLower)
  if (start === -1) {
    return null
  }

  const startValue = start + labelLower.length
  let end = source.length
  for (const endLabel of endLabels) {
    const idx = lower.indexOf(endLabel.toLowerCase(), startValue)
    if (idx !== -1 && idx < end) {
      end = idx
    }
  }

  const value = source.slice(startValue, end).trim()
  return value ? value : null
}

// ING mutation codes → readable payment method (strong categorization signal:
// direct debits are recurring bills, card terminals are in-person purchases).
const ING_CODE_METHODS: Record<string, string> = {
  IC: 'direct debit',
  BA: 'card terminal',
  GT: 'online banking',
  OV: 'transfer',
  PO: 'standing order',
  GM: 'ATM',
  ST: 'deposit',
  VZ: 'batch payment',
  FL: 'branch booking',
  DV: 'miscellaneous',
}

function parseIngRecords(records: RawRecord[]): ImportResult {
  const warnings: string[] = []
  const transactions: ParsedTransaction[] = []
  const accountCounts = new Map<string, number>()
  const balancesByDate = new Map<string, number[]>()

  records.forEach((record, index) => {
    const map = buildHeaderMap(record)
    const bookingDate = parseIngDate(
      getHeaderValue(record, map, ['Date', 'Booking date', 'Book date'])
    )
    const amountValue = parseEuroAmount(
      getHeaderValue(record, map, ['Amount (EUR)', 'Amount', 'Amount (Euro)'])
    )
    const direction =
      getHeaderValue(record, map, [
        'Debit/credit',
        'Debit credit',
        'Debit/Credit',
      ])?.trim() ?? ''
    const currency =
      getHeaderValue(record, map, ['Currency'])?.trim() || 'EUR'
    const account =
      getHeaderValue(record, map, ['Account', 'Account number'])?.trim() || null
    const code = getHeaderValue(record, map, ['Code'])?.trim().toUpperCase() || null
    const transactionType =
      getHeaderValue(record, map, ['Transaction type', 'Mutatiesoort'])?.trim() || null
    const method = (code && ING_CODE_METHODS[code]) || transactionType || code
    const payee =
      getHeaderValue(record, map, ['Name / Description', 'Name/Description'])?.trim() ||
      null
    const counterparty =
      getHeaderValue(record, map, ['Counterparty', 'Counter party'])?.trim() || null
    const notifications = getHeaderValue(record, map, ['Notifications'])?.trim()
    const purpose =
      extractField(notifications, 'Description:', [
        ' IBAN:',
        ' Reference:',
        ' Mandate ID:',
        ' Creditor ID:',
        ' Value date:',
        ' Date/time:',
        ' Other party:',
        ' Name:',
      ]) ||
      getHeaderValue(record, map, ['Transaction type'])?.trim() ||
      null
    const iban =
      counterparty ||
      (notifications?.match(/IBAN:\s*([A-Z]{2}[0-9A-Z]+)/)?.[1] ?? null)
    const reference =
      extractField(notifications, 'Reference:', [
        ' Mandate ID:',
        ' Creditor ID:',
        ' Value date:',
        ' Date/time:',
        ' Other party:',
      ]) ||
      extractField(notifications, 'Mandate ID:', [
        ' Creditor ID:',
        ' Value date:',
        ' Date/time:',
      ]) ||
      null
    const valueDate = parseGermanDate(
      notifications?.match(/Value date:\s*([0-9]{2}[\/\-.][0-9]{2}[\/\-.][0-9]{4})/i)?.[1]
    )

    if (!bookingDate || amountValue === null) {
      warnings.push(`ING row ${index + 1}: missing booking date or amount`)
      return
    }

    let amount = amountValue
    if (/debit/i.test(direction)) {
      amount = -Math.abs(amountValue)
    } else if (/credit/i.test(direction)) {
      amount = Math.abs(amountValue)
    }

    if (account) {
      accountCounts.set(account, (accountCounts.get(account) ?? 0) + 1)
    }
    const resultingBalance = parseEuroAmount(
      getHeaderValue(record, map, ['Resulting balance', 'Saldo na mutatie', 'Balance'])
    )
    if (resultingBalance !== null) {
      const list = balancesByDate.get(bookingDate) ?? []
      list.push(resultingBalance)
      balancesByDate.set(bookingDate, list)
    }

    const rawHash = makeRawHash([
      bookingDate,
      valueDate,
      amount.toString(),
      currency,
      payee,
      purpose,
      iban,
      reference,
    ])

    transactions.push({
      account,
      bookingDate,
      valueDate,
      amount,
      currency,
      payee,
      purpose,
      iban,
      bic: null,
      reference,
      method,
      rawHash,
    })
  })

  // The ING export lists the owner's IBAN per row; the dominant value is the
  // statement's own account (counterparties live in a separate column).
  let ownAccount: OwnAccount | null = null
  let bestCount = 0
  for (const [identifier, count] of accountCounts) {
    if (count > bestCount) {
      bestCount = count
      ownAccount = { identifier, kind: 'checking' }
    }
  }
  // Balance-after-transaction is only a safe anchor when the newest booking
  // date has a single row — with several same-day rows we can't tell which
  // balance is end-of-day.
  if (ownAccount && balancesByDate.size > 0) {
    const maxDate = [...balancesByDate.keys()].sort().pop() as string
    const balances = balancesByDate.get(maxDate) ?? []
    if (balances.length === 1) {
      ownAccount.balance = balances[0]
      ownAccount.balanceDate = maxDate
    }
  }

  return { transactions, warnings, ownAccount }
}

export function parseIngCsv(contents: string): ImportResult {
  const rows = parse(contents, {
    delimiter: ';',
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  }) as string[][]

  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell || ''))
    return normalized.includes('date') && normalized.includes('amount (eur)')
  })

  if (headerIndex === -1) {
    return {
      transactions: [],
      warnings: ['ING: header row not found (missing Date/Amount (EUR))'],
    }
  }

  const headers = rows[headerIndex]
  const dataRows = rows.slice(headerIndex + 1)

  const records: RawRecord[] = dataRows
    .filter((row) => row.some((cell) => cell?.trim() !== ''))
    .map((row) => {
      const record: RawRecord = {}
      headers.forEach((header, idx) => {
        record[header] = row[idx] ?? ''
      })
      return record
    })

  return parseIngRecords(records)
}
