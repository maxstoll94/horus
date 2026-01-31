import { parse } from 'csv-parse/sync'
import type { ImportResult, ParsedTransaction, RawRecord } from './types'
import {
  buildHeaderMap,
  getHeaderValue,
  makeRawHash,
  parseEuroAmount,
  parseGermanDate,
} from './utils'

function parseDkbRecords(records: RawRecord[]): ImportResult {
  const warnings: string[] = []
  const transactions: ParsedTransaction[] = []

  records.forEach((record, index) => {
    const map = buildHeaderMap(record)
    const bookingDate = parseGermanDate(
      getHeaderValue(record, map, ['Buchungsdatum', 'Buchungstag', 'Buchung'])
    )
    const valueDate = parseGermanDate(
      getHeaderValue(record, map, ['Wertstellung', 'Valuta'])
    )
    const amount = parseEuroAmount(
      getHeaderValue(record, map, ['Betrag (€)', 'Betrag (EUR)', 'Betrag', 'Umsatz in EUR'])
    )
    const currency =
      getHeaderValue(record, map, ['Währung', 'Waehrung', 'Currency'])?.trim() ||
      'EUR'
    const payee =
      getHeaderValue(record, map, [
        'Zahlungsempfänger*in',
        'Zahlungsempfaenger*in',
        'Zahlungsempfänger',
        'Zahlungsempfaenger',
        'Auftraggeber / Begünstigter',
        'Auftraggeber/Empfänger',
        'Empfänger',
        'Begünstigter',
      ])?.trim() || null
    const payer =
      getHeaderValue(record, map, [
        'Zahlungspflichtige*r',
        'Zahlungspflichtiger',
        'Zahlungspflichtige',
      ])?.trim() || null
    const purpose =
      getHeaderValue(record, map, ['Verwendungszweck'])?.trim() || null
    const iban = getHeaderValue(record, map, ['IBAN'])?.trim() || null
    const bic = getHeaderValue(record, map, ['BIC'])?.trim() || null
    const reference =
      getHeaderValue(record, map, [
        'Kundenreferenz',
        'Mandatsreferenz',
        'Gläubiger-ID',
        'Glaeubiger-ID',
      ])?.trim() || null
    const account =
      getHeaderValue(record, map, ['Girokonto', 'Kontonummer', 'Account'])?.trim() ||
      iban

    if (!bookingDate || amount === null) {
      warnings.push(`DKB row ${index + 1}: missing booking date or amount`)
      return
    }

    const rawHash = makeRawHash([
      bookingDate,
      valueDate,
      amount.toString(),
      currency,
      payee ?? payer,
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
      payee: payee ?? payer,
      purpose,
      iban,
      bic,
      reference,
      rawHash,
    })
  })

  return { transactions, warnings }
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
    row.some((cell) => cell?.toLowerCase().includes('buchungsdatum'))
  )

  if (headerIndex === -1) {
    return {
      transactions: [],
      warnings: ['DKB: header row not found (missing Buchungsdatum)'],
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

  return parseDkbRecords(records)
}
