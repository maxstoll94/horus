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

// Volksbank/VR-Bank's Buchungstext is a fixed vocabulary of transaction types —
// a reliable categorization signal, same role as DKB/ING's derived method.
function deriveMethod(buchungstext: string | null): string | null {
  if (!buchungstext) return null
  const text = buchungstext.toLowerCase()
  if (/lastsch/.test(text)) return 'direct debit'
  if (/kartenzahlung/.test(text)) return 'card terminal'
  if (/bargeldauszahlung|geldautomat|auszahlung/.test(text)) return 'ATM'
  if (/dauerauftr/.test(text)) return 'standing order'
  if (/bezuege|bezüge|lohn|gehalt/.test(text)) return 'salary'
  if (/abschluss/.test(text)) return 'fee'
  if (/dividende/.test(text)) return 'dividend'
  if (/ueberweisung|überweisung|gutschrift/.test(text)) return 'transfer'
  return buchungstext
}

function parseVolksbankRecords(records: RawRecord[]): ImportResult {
  const warnings: string[] = []
  const transactions: ParsedTransaction[] = []
  const accountCounts = new Map<string, number>()
  const bankNames = new Map<string, number>()
  const balancesByDate = new Map<string, number[]>()

  records.forEach((record, index) => {
    const map = buildHeaderMap(record)
    const bookingDate = parseGermanDate(getHeaderValue(record, map, ['Buchungstag']))
    const valueDate = parseGermanDate(getHeaderValue(record, map, ['Valutadatum']))
    const amount = parseEuroAmount(getHeaderValue(record, map, ['Betrag']))
    const currency = getHeaderValue(record, map, ['Waehrung', 'Währung'])?.trim() || 'EUR'
    const account = getHeaderValue(record, map, ['IBAN Auftragskonto'])?.trim() || null
    const bankName = getHeaderValue(record, map, ['Bankname Auftragskonto'])?.trim() || null
    const buchungstext = getHeaderValue(record, map, ['Buchungstext'])?.trim() || null
    const purpose = getHeaderValue(record, map, ['Verwendungszweck'])?.trim() || null
    const payee = getHeaderValue(record, map, ['Name Zahlungsbeteiligter'])?.trim() || null
    const iban = getHeaderValue(record, map, ['IBAN Zahlungsbeteiligter'])?.trim() || null
    const bic =
      getHeaderValue(record, map, ['BIC (SWIFT-Code) Zahlungsbeteiligter'])?.trim() || null
    const mandateRef = getHeaderValue(record, map, ['Mandatsreferenz'])?.trim() || null
    const creditorId = getHeaderValue(record, map, ['Glaeubiger ID', 'Gläubiger ID'])?.trim() || null
    const reference = mandateRef || creditorId || null
    const method = deriveMethod(buchungstext)

    if (!bookingDate || amount === null) {
      warnings.push(`Volksbank row ${index + 1}: missing booking date or amount`)
      return
    }

    if (account) {
      accountCounts.set(account, (accountCounts.get(account) ?? 0) + 1)
    }
    if (bankName) {
      bankNames.set(bankName, (bankNames.get(bankName) ?? 0) + 1)
    }

    const balance = parseEuroAmount(getHeaderValue(record, map, ['Saldo nach Buchung']))
    if (balance !== null) {
      const list = balancesByDate.get(bookingDate) ?? []
      list.push(balance)
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
      bic,
      reference,
      method,
      rawHash,
    })
  })

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

  let bankName: string | null = null
  let bestBankCount = 0
  for (const [name, count] of bankNames) {
    if (count > bestBankCount) {
      bestBankCount = count
      bankName = name
    }
  }

  return { transactions, warnings, ownAccount, bankName: bankName ?? undefined }
}

export function parseVolksbankCsv(contents: string): ImportResult {
  const rows = parse(contents, {
    delimiter: ';',
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  }) as string[][]

  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell || ''))
    return normalized.includes('iban auftragskonto') && normalized.includes('buchungstag')
  })

  if (headerIndex === -1) {
    return {
      transactions: [],
      warnings: ['Volksbank: header row not found (missing IBAN Auftragskonto/Buchungstag)'],
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

  return parseVolksbankRecords(records)
}
