export type RawRecord = Record<string, string>

export type ImportProvider = 'dkb' | 'ing' | 'sparkasse' | 'volksbank'

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
  method?: string | null
  rawHash: string
}

export type OwnAccount = {
  identifier: string
  kind: 'checking' | 'savings' | 'credit'
  balance?: number | null
  balanceDate?: string | null
}

export type ImportResult = {
  transactions: ParsedTransaction[]
  warnings: string[]
  ownAccount?: OwnAccount | null
  bankName?: string
}
