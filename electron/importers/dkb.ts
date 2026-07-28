import { parse } from 'csv-parse/sync'
import type { ImportResult, OwnAccount, ParsedTransaction, RawRecord } from './types'
import {
  buildHeaderMap,
  getHeaderValue,
  makeRawHash,
  parseEuroAmount,
  parseGermanDate,
} from './utils'

// DKB exports carry metadata rows before the column header:
//   "Girokonto";"DE28..."            (checking / savings)
//   "Karte";"Visa Kreditkarte 4998…" (credit card)
//   "Kontostand vom 01.02.2026:";"750,00 €"  or  "Saldo vom 26.06.2026:";"-1.000,00 EUR"
function extractDkbOwnAccount(metaRows: string[][]): OwnAccount | null {
  let identifier: string | null = null
  let kind: OwnAccount['kind'] = 'checking'
  let balance: number | null = null
  let balanceDate: string | null = null

  for (const row of metaRows) {
    const label = (row[0] ?? '').trim()
    const value = (row[1] ?? '').trim()
    if (!label) continue

    if (/^girokonto$/i.test(label) && value) {
      identifier = value
      kind = 'checking'
    } else if (/tagesgeld|sparkonto/i.test(label) && value) {
      identifier = value
      kind = 'savings'
    } else if (/^karte$/i.test(label) && value) {
      identifier = value
      kind = 'credit'
    }

    const balanceMatch = label.match(/^(?:kontostand|saldo)\s+vom\s+(\d{1,2}\.\d{1,2}\.\d{2,4})/i)
    if (balanceMatch) {
      balance = parseEuroAmount(value)
      balanceDate = parseGermanDate(balanceMatch[1])
    }
  }

  if (!identifier) return null
  return { identifier, kind, balance, balanceDate }
}

function parseDkbRecords(records: RawRecord[], ownAccount: OwnAccount | null): ImportResult {
  const warnings: string[] = []
  const transactions: ParsedTransaction[] = []

  records.forEach((record, index) => {
    const map = buildHeaderMap(record)
    const bookingDate = parseGermanDate(
      getHeaderValue(record, map, ['Buchungsdatum', 'Buchungstag', 'Buchung', 'Belegdatum'])
    )
    const valueDate = parseGermanDate(
      getHeaderValue(record, map, ['Wertstellung', 'Valuta'])
    )
    const amount = parseEuroAmount(
      getHeaderValue(record, map, [
        'Betrag (â‚¬)',
        'Betrag (€)',
        'Betrag (EUR)',
        'Betrag',
        'Umsatz in EUR',
      ])
    )
    const currency =
      getHeaderValue(record, map, ['WÃ¤hrung', 'Waehrung', 'Currency'])?.trim() ||
      'EUR'
    const recipient =
      getHeaderValue(record, map, [
        'Zahlungsempfänger*in',
        'ZahlungsempfÃ¤nger*in',
        'Zahlungsempfaenger*in',
        'Zahlungsempfänger',
        'ZahlungsempfÃ¤nger',
        'Zahlungsempfaenger',
        'Auftraggeber / BegÃ¼nstigter',
        'Auftraggeber/EmpfÃ¤nger',
        'EmpfÃ¤nger',
        'BegÃ¼nstigter',
        'Beschreibung',
      ])?.trim() || null
    const payer =
      getHeaderValue(record, map, [
        'Zahlungspflichtige*r',
        'Zahlungspflichtiger',
        'Zahlungspflichtige',
      ])?.trim() || null
    const direction =
      getHeaderValue(record, map, ['Umsatztyp'])?.trim() || null
    const purpose =
      getHeaderValue(record, map, ['Verwendungszweck'])?.trim() || null

    // For outgoing: recipient is the merchant/counterparty we care about
    // For incoming: payer is the counterparty (e.g. employer)
    const payee = direction === 'Eingang' ? (payer || recipient) : (recipient || payer)
    const iban = getHeaderValue(record, map, ['IBAN'])?.trim() || null
    const bic = getHeaderValue(record, map, ['BIC'])?.trim() || null
    const reference =
      getHeaderValue(record, map, [
        'Kundenreferenz',
        'Mandatsreferenz',
        'GlÃ¤ubiger-ID',
        'Glaeubiger-ID',
      ])?.trim() || null

    // Payment method: DKB has no dedicated column, so derive it — SEPA mandate
    // fields mean direct debit; BCK./CCV. payee prefixes and Girokartenumsatz
    // mean a physical card terminal; credit-card statements are all card.
    const mandate = getHeaderValue(record, map, ['Mandatsreferenz'])?.trim() || null
    const creditorId =
      getHeaderValue(record, map, ['Gläubiger-ID', 'GlÃ¤ubiger-ID', 'Glaeubiger-ID'])?.trim() || null
    const method =
      ownAccount?.kind === 'credit'
        ? 'credit card'
        : mandate || creditorId
        ? 'direct debit'
        : /girokartenumsatz/i.test(purpose ?? '') || /^(BCK\.|CCV\.)/i.test(recipient ?? '')
        ? 'card terminal'
        : null
    const account =
      ownAccount?.identifier ||
      getHeaderValue(record, map, ['Girokonto', 'Kontonummer', 'Account'])?.trim() ||
      null

    if (!bookingDate || amount === null) {
      warnings.push(`DKB row ${index + 1}: missing booking date or amount`)
      return
    }

    const cleanPurpose = (!purpose || purpose === '-' || purpose === '.') ? null : purpose

    const rawHash = makeRawHash([
      bookingDate,
      valueDate,
      amount.toString(),
      currency,
      payee,
      cleanPurpose,
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
      purpose: cleanPurpose,
      iban,
      bic,
      reference,
      method,
      rawHash,
    })
  })

  return { transactions, warnings, ownAccount }
}

export function parseDkbCsv(contents: string): ImportResult {
  const rows = parse(contents, {
    delimiter: ';',
    relax_quotes: true,
    relax_column_count: true,
    skip_empty_lines: true,
    bom: true,
  }) as string[][]

  const headerIndex = rows.findIndex((row) =>
    row.some((cell) => cell?.toLowerCase().includes('buchungsdatum') || cell?.toLowerCase().includes('belegdatum'))
  )

  if (headerIndex === -1) {
    return {
      transactions: [],
      warnings: ['DKB: header row not found (missing Buchungsdatum/Belegdatum)'],
    }
  }

  const ownAccount = extractDkbOwnAccount(rows.slice(0, headerIndex))
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

  return parseDkbRecords(records, ownAccount)
}




