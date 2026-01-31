export type RawRecord = Record<string, string>

export type ImportProvider = 'dkb' | 'ing'

export type ParsedTransaction = {
  account?: string | null
  bookingDate: string
  valueDate?: string | null
  amount: number
  currency: string
  payee?: string | null
  purpose?: string | null
  iban?: string | null
  bic?: string | null
  reference?: string | null
  rawHash: string
}

export type ImportResult = {
  transactions: ParsedTransaction[]
  warnings: string[]
}
