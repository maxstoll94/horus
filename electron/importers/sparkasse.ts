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

// Sparkasse's Buchungstext is a fixed vocabulary of transaction types — a
// reliable categorization signal, same role as DKB/ING's derived method.
function deriveMethod(buchungstext: string | null): string | null {
  if (!buchungstext) return null
  const text = buchungstext.toLowerCase()
  if (/lastschrift/.test(text)) return 'direct debit'
  if (/kartenzahlung/.test(text)) return 'card terminal'
  if (/bargeldauszahlung/.test(text)) return 'ATM'
  if (/dauerauftr/.test(text)) return 'standing order'
  if (/lohn|gehalt/.test(text)) return 'salary'
  if (/ueberweisung|überweisung|gutschrift/.test(text)) return 'transfer'
  if (/entgeltabschluss/.test(text)) return 'fee'
  return buchungstext
}

function parseSparkasseRecords(records: RawRecord[]): ImportResult {
  const warnings: string[] = []
  const transactions: ParsedTransaction[] = []
  const accountCounts = new Map<string, number>()

  records.forEach((record, index) => {
    const map = buildHeaderMap(record)
    const bookingDate = parseGermanDate(getHeaderValue(record, map, ['Buchungstag']))
    const valueDate = parseGermanDate(getHeaderValue(record, map, ['Valutadatum']))
    const amount = parseEuroAmount(getHeaderValue(record, map, ['Betrag']))
    const currency = getHeaderValue(record, map, ['Waehrung', 'Währung'])?.trim() || 'EUR'
    const account = getHeaderValue(record, map, ['Auftragskonto'])?.trim() || null
    const buchungstext = getHeaderValue(record, map, ['Buchungstext'])?.trim() || null
    const purpose = getHeaderValue(record, map, ['Verwendungszweck'])?.trim() || null
    const payee =
      getHeaderValue(record, map, ['Beguenstigter/Zahlungspflichtiger', 'Begünstigter/Zahlungspflichtiger'])?.trim() ||
      null
    const iban = getHeaderValue(record, map, ['Kontonummer/IBAN'])?.trim() || null
    const bic = getHeaderValue(record, map, ['BIC (SWIFT-Code)', 'BIC'])?.trim() || null
    const mandateRef = getHeaderValue(record, map, ['Mandatsreferenz'])?.trim() || null
    const creditorId =
      getHeaderValue(record, map, ['Glaeubiger ID', 'Gläubiger ID'])?.trim() || null
    const reference = mandateRef || creditorId || null
    const method = deriveMethod(buchungstext)

    if (!bookingDate || amount === null) {
      warnings.push(`Sparkasse row ${index + 1}: missing booking date or amount`)
      return
    }

    if (account) {
      accountCounts.set(account, (accountCounts.get(account) ?? 0) + 1)
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

  return { transactions, warnings, ownAccount }
}

export function parseSparkasseCsv(contents: string): ImportResult {
  const rows = parse(contents, {
    delimiter: ';',
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  }) as string[][]

  const headerIndex = rows.findIndex((row) => {
    const normalized = row.map((cell) => normalizeHeader(cell || ''))
    return normalized.includes('auftragskonto') && normalized.includes('buchungstag')
  })

  if (headerIndex === -1) {
    return {
      transactions: [],
      warnings: ['Sparkasse: header row not found (missing Auftragskonto/Buchungstag)'],
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

  return parseSparkasseRecords(records)
}
