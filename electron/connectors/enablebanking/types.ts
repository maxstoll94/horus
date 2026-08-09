export type Application = {
  name: string
  environment: string
  active: boolean
  countries?: string[]
}

export type AuthMethod = {
  name: string
  title?: string
  approach: 'REDIRECT' | 'EMBEDDED' | 'DECOUPLED'
  psu_type: 'personal' | 'business'
  hidden_method?: boolean
}

export type Aspsp = {
  name: string
  country: string
  maximum_consent_validity: number
  auth_methods?: AuthMethod[]
}

export type StartAuthorizationResponse = {
  url: string
}

export type AccountIdentification = {
  iban?: string | null
  other?: { identification: string; scheme_name: string; issuer?: string | null } | null
}

export type SessionAccount = {
  uid: string
  name?: string | null
  currency?: string | null
  account_id?: AccountIdentification | null
}

export type CreateSessionResponse = {
  session_id: string
  accounts: SessionAccount[]
  access: { valid_until: string }
}

export type Balance = {
  name?: string | null
  balance_amount: { currency: string; amount: string }
  balance_type: string
  reference_date?: string | null
}

export type BalancesResponse = {
  balances: Balance[]
}

export type CreditDebitIndicator = 'CRDT' | 'DBIT'

export type Transaction = {
  entry_reference?: string | null
  transaction_id?: string | null
  transaction_amount: { currency: string; amount: string }
  creditor?: { name?: string | null } | null
  creditor_account?: AccountIdentification | null
  debtor?: { name?: string | null } | null
  debtor_account?: AccountIdentification | null
  credit_debit_indicator: CreditDebitIndicator
  status: 'BOOK' | 'PDNG' | string
  booking_date?: string | null
  value_date?: string | null
  remittance_information?: string[] | null
}

export type TransactionsResponse = {
  transactions: Transaction[]
  continuation_key?: string
}

export type EnableBankingCredentials = {
  appId: string
  privateKeyPem: string
}
