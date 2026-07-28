export type TransactionRow = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
  categoryCount: number
  source: string
}

export type RuleRow = {
  id: number
  matcherType: string
  matcherOperator: string
  matcherValue: string
  categoryId: number
  priority: number
  isActive: number
  tagIds: number[]
}

export type CategoryRow = {
  id: number
  name: string
  color: string | null
  isActive: number
  groupType: string
  displayOrder: number
}

export type CategorizedViewRow = TransactionRow & {
  categories: { id: number; name: string }[]
}

export type RuleDraft = {
  txId: number
  matcherType: 'payee' | 'purpose' | 'iban' | 'bic' | 'amount' | 'direction'
  matcherOperator: 'contains' | 'equals'
  matcherValue: string
  categoryId: number
  priority: number
  isActive: number
}

export type CategoryOption = {
  value: number
  label: string
}

export type TagOption = {
  value: number
  label: string
}

export type AccountOption = {
  value: number
  label: string
}

export type AccountRow = {
  id: number
  name: string
  bank: string | null
  type: string
  identifier: string | null
  anchorBalance: number | null
  anchorDate: string | null
  currentBalance: number | null
  transactionCount: number
  lastBookingDate: string | null
}

export type TagRow = {
  id: number
  name: string
  usageCount: number
}

export type Toast = {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
}

export type GroupType = 'income' | 'fixed_expense' | 'variable_expense' | 'savings' | 'transfer'

export type BudgetRow = {
  id: number
  categoryId: number
  categoryName: string
  categoryColor: string | null
  groupType: string
  period: string
  cadence: string
  amount: number
  notes: string | null
}

export type BudgetActualRow = {
  categoryId: number
  categoryName: string
  groupType: string
  actual: number
}
