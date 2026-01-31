import crypto from 'node:crypto'
import type { RawRecord } from './types'

export function normalizeHeader(value: string) {
  return value
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[.:]+/g, '')
    .trim()
}

export function buildHeaderMap(record: RawRecord) {
  const map = new Map<string, string>()
  for (const key of Object.keys(record)) {
    map.set(normalizeHeader(key), key)
  }
  return map
}

export function getHeaderValue(
  record: RawRecord,
  map: Map<string, string>,
  keys: string[]
) {
  for (const key of keys) {
    const normalized = normalizeHeader(key)
    const rawKey = map.get(normalized)
    if (rawKey && record[rawKey] !== undefined) {
      return record[rawKey]
    }
  }

  return undefined
}

export function parseGermanDate(value: string | undefined) {
  if (!value) {
    return null
  }

  const match = value.trim().match(/^(\d{1,2})[.\-\/](\d{1,2})[.\-\/](\d{2,4})$/)
  if (!match) {
    return null
  }

  const day = match[1].padStart(2, '0')
  const month = match[2].padStart(2, '0')
  const year = match[3].length === 2 ? `20${match[3]}` : match[3]

  return `${year}-${month}-${day}`
}

export function parseEuroAmount(value: string | undefined) {
  if (!value) {
    return null
  }

  const cleaned = value
    .replace(/[^\d,.\-]/g, '')
    .replace(/\./g, '')
    .replace(/,/g, '.')

  const amount = Number.parseFloat(cleaned)
  if (Number.isNaN(amount)) {
    return null
  }

  return amount
}

export function makeRawHash(parts: Array<string | null | undefined>) {
  const input = parts.filter(Boolean).join('|')
  return crypto.createHash('sha256').update(input).digest('hex')
}
