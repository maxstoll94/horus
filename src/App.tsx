import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Select from 'react-select'
import CreatableSelect from 'react-select/creatable'
import './App.css'
import horusLogo from './assets/horus-logo-v2.svg'
import { DashboardView } from './views/DashboardView'
import { TransactionsView } from './views/TransactionsView'
import { CategorizationView } from './views/CategorizationView'
import { CategoriesView } from './views/CategoriesView'
import { RulesView } from './views/RulesView'
import { TagsView } from './views/TagsView'
import { AccountsView } from './views/AccountsView'
import { AiSettingsView } from './views/AiSettingsView'
import { DocsView } from './views/DocsView'
import { BudgetView } from './views/BudgetView'
import { ChatView } from './views/ChatView'
import type { AccountOption, AccountRow, TagRow } from './types'
import { multiSelectStyles } from './lib/reactSelectStyles'

type TransactionRow = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
  categoryCount: number
  source: string
  accountName?: string | null
  iban?: string | null
  method?: string | null
}

type RuleRow = {
  id: number
  matcherType: string
  matcherOperator: string
  matcherValue: string
  categoryId: number
  priority: number
  isActive: number
  tagIds: number[]
}

type CategoryRow = {
  id: number
  name: string
  color: string | null
  isActive: number
  groupType: string
  displayOrder: number
}

type CategorizedViewRow = TransactionRow & {
  categories: { id: number; name: string }[]
}

type RuleDraft = {
  txId: number
  matcherType: 'payee' | 'purpose' | 'iban' | 'bic' | 'amount' | 'direction'
  matcherOperator: 'contains' | 'equals'
  matcherValue: string
  categoryId: number
  priority: number
  isActive: number
  tagIds: number[]
}

type CategoryOption = {
  value: number
  label: string
}

type TagOption = {
  value: number
  label: string
}

type Toast = {
  id: number
  message: string
  tone: 'success' | 'error' | 'info'
}

type CategoryTableMeta = {
  categoryEdits: Record<
    number,
    {
      name: string
      color: string | null
      isActive: number
    }
  >
  setCategoryEdits: React.Dispatch<
    React.SetStateAction<
      Record<
        number,
        {
          name: string
          color: string | null
          isActive: number
        }
      >
    >
  >
  saveCategory: (id: number) => void
  deleteCategoryRow: (id: number) => void
}

type TagTableMeta = {
  tagEdits: Record<number, { name: string }>
  setTagEdits: React.Dispatch<React.SetStateAction<Record<number, { name: string }>>>
  saveTagRow: (id: number) => void
  deleteTagRow: (id: number) => void
}

type RuleEditDraft = {
  matcherType: string
  matcherOperator: string
  matcherValue: string
  categoryId: number
  priority: number
  isActive: number
  tagIds: number[]
}

type RuleTableMeta = {
  ruleEdits: Record<number, RuleEditDraft>
  setRuleEdits: React.Dispatch<React.SetStateAction<Record<number, RuleEditDraft>>>
  activeCategories: CategoryRow[]
  tagOptions: TagOption[]
  saveRule: (id: number) => void
  deleteRule: (id: number) => void
}

type AccountEditDraft = {
  name: string
  type: string
  anchorBalance: string
  anchorDate: string
}

type AccountTableMeta = {
  accountEdits: Record<number, AccountEditDraft>
  setAccountEdits: React.Dispatch<React.SetStateAction<Record<number, AccountEditDraft>>>
  saveAccount: (id: number) => void
  deleteAccountRow: (id: number) => void
}

const draftFromAccount = (account: AccountRow): AccountEditDraft => ({
  name: account.name,
  type: account.type,
  anchorBalance: account.anchorBalance != null ? String(account.anchorBalance) : '',
  anchorDate: account.anchorDate ?? '',
})

const formatEur = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)

function sameTagIds(a: number[], b: number[]) {
  if (a.length !== b.length) return false
  const setB = new Set(b)
  return a.every((id) => setB.has(id))
}

// Tags have no stored color (unlike categories), so bars are colored from a
// validated categorical palette, picked deterministically by tag id so a
// given tag's color stays stable across reloads regardless of sort order.
const TAG_COLOR_PALETTE = [
  '#2a78d6',
  '#1baf7a',
  '#eda100',
  '#008300',
  '#4a3aa7',
  '#e34948',
  '#e87ba4',
  '#eb6834',
]
const tagColor = (tagId: number) => TAG_COLOR_PALETTE[tagId % TAG_COLOR_PALETTE.length]

type DashboardBreakdownRow = {
  id: number
  name: string
  color: string | null
  totalSpend: number
  totalIncome: number
  transactionCount: number
}

function App() {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [importProvider, setImportProvider] = useState<
    'dkb' | 'ing' | 'sparkasse' | 'volksbank'
  >('dkb')
  const [status, setStatus] = useState<string>('Idle')
  const [warnings, setWarnings] = useState<string[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [transactionsTotal, setTransactionsTotal] = useState(0)
  const [transactionSearch, setTransactionSearch] = useState('')
  const [uncategorized, setUncategorized] = useState<TransactionRow[]>([])
  const [uncategorizedTotal, setUncategorizedTotal] = useState(0)
  const [categorized, setCategorized] = useState<CategorizedViewRow[]>([])
  const [categorizedTotal, setCategorizedTotal] = useState(0)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [categoriesTotal, setCategoriesTotal] = useState(0)
  const [categorySearch, setCategorySearch] = useState('')
  const [categoriesAll, setCategoriesAll] = useState<CategoryRow[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#4c7cff')
  const [categoryStatus, setCategoryStatus] = useState<string>('')
  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false)
  const [importModalOpen, setImportModalOpen] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    message: string
    onConfirm: () => void
  } | null>(null)
  const [categoryEdits, setCategoryEdits] = useState<
    Record<
      number,
      {
        name: string
        color: string | null
        isActive: number
      }
    >
  >({})
  const [categorizationVersion, setCategorizationVersion] = useState(0)
  const [activeView, setActiveView] = useState<
    | 'dashboard'
    | 'budget'
    | 'transactions'
    | 'categories'
    | 'categorization'
    | 'rules'
    | 'tags'
    | 'accounts'
    | 'ai'
    | 'docs'
  >('dashboard')
  const [categorizationTab, setCategorizationTab] = useState<
    'uncategorized' | 'categorized'
  >('uncategorized')
  const [page, setPage] = useState(0)
  const [chatOpen, setChatOpen] = useState(false)
  const [editingAmountId, setEditingAmountId] = useState<number | null>(null)
  const [editingAmountValue, setEditingAmountValue] = useState('')
  const [txTags, setTxTags] = useState<Record<number, Array<{ tagId: number; name: string }>>>({})
  const [allTags, setAllTags] = useState<TagRow[]>([])
  const [editingTagsId, setEditingTagsId] = useState<number | null>(null)
  const [tagInput, setTagInput] = useState('')
  const [tags, setTags] = useState<TagRow[]>([])
  const [tagsTotal, setTagsTotal] = useState(0)
  const [tagSearch, setTagSearch] = useState('')
  const [tagsPage, setTagsPage] = useState(0)
  const [pageSizeTags] = useState(16)
  const [tagStatus, setTagStatus] = useState<string>('')
  const [tagEdits, setTagEdits] = useState<Record<number, { name: string }>>({})
  const [newTagModalOpen, setNewTagModalOpen] = useState(false)
  const [newTagName, setNewTagName] = useState('')
  const [uncategorizedPage, setUncategorizedPage] = useState(0)
  const [categorizedPage, setCategorizedPage] = useState(0)
  const [pageSizeTransactions, setPageSizeTransactions] = useState(20)
  const [pageSizeUncategorized, setPageSizeUncategorized] = useState(16)
  const [pageSizeCategorized, setPageSizeCategorized] = useState(16)
  const [categoriesPage, setCategoriesPage] = useState(0)
  const [rulesPage, setRulesPage] = useState(0)
  const [dashboardCategoryPage, setDashboardCategoryPage] = useState(0)
  const [pageSizeCategories] = useState(16)
  const [pageSizeRules] = useState(16)
  const [pageSizeDashboardTransactions] = useState(7)
  const [selection, setSelection] = useState<Record<number, number[]>>({})
  const [tagSelection, setTagSelection] = useState<Record<number, number[]>>({})
  const [categorizedFilter, setCategorizedFilter] = useState<number[]>([])
  const [accounts, setAccounts] = useState<AccountRow[]>([])
  const [accountEdits, setAccountEdits] = useState<Record<number, AccountEditDraft>>({})
  const [selectedAccountIds, setSelectedAccountIds] = useState<number[]>([])
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null)
  const [rulesStatus, setRulesStatus] = useState<string>('')
  const [rulesStatusModal, setRulesStatusModal] = useState<string | null>(null)
  const [newRuleModalOpen, setNewRuleModalOpen] = useState(false)
  const [aiSuggestions, setAiSuggestions] = useState<
    Record<
      number,
      { categoryId: number; confidence: number; reason: string | null }
    >
  >({})
  const [aiTagSuggestions, setAiTagSuggestions] = useState<
    Record<number, Array<{ tagName: string; confidence: number }>>
  >({})
  const [aiStatus, setAiStatus] = useState<string>('')
  const [aiSuggestLoading, setAiSuggestLoading] = useState(false)
  const [aiSettings, setAiSettings] = useState<{
    model: string
    enabled: number
    confidenceThreshold: number
    inputCostPer1M: number | null
    outputCostPer1M: number | null
    webSearch: number
    apiKey: string | null
  } | null>(null)
  const [aiKeyStatus, setAiKeyStatus] = useState<{
    present: boolean
    source: 'settings' | 'env' | null
  } | null>(null)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [aiRequests, setAiRequests] = useState<
    Array<{
      id: number
      model: string | null
      requestPayload: string | null
      responsePayload: string | null
      status: string
      error: string | null
      inputTokens: number | null
      outputTokens: number | null
      totalTokens: number | null
      costUsd: number | null
      createdAt: string
    }>
  >([])
  const [aiRequestsTotal, setAiRequestsTotal] = useState(0)
  const [aiRequestsPage, setAiRequestsPage] = useState(0)
  const [pageSizeAiRequests] = useState(16)
  const [rules, setRules] = useState<RuleRow[]>([])
  const [rulesTotal, setRulesTotal] = useState(0)
  const [ruleSearch, setRuleSearch] = useState('')
  const [ruleEdits, setRuleEdits] = useState<Record<number, RuleEditDraft>>({})
  const [newRule, setNewRule] = useState({
    matcherType: 'payee' as RuleDraft['matcherType'],
    matcherOperator: 'contains' as RuleDraft['matcherOperator'],
    matcherValue: '',
    categoryId: 0,
    tagIds: [] as number[],
    priority: 100,
    isActive: 1,
  })
  const [dashboardMonths, setDashboardMonths] = useState<string[]>([])
  const [dashboardMonth, setDashboardMonth] = useState<string>('')
  const [dashboardRange, setDashboardRange] = useState<
    'month' | 'last1' | 'last3' | 'last6'
  >('month')
  const [dashboardGroupBy, setDashboardGroupBy] = useState<'category' | 'tag'>('category')
  const [dashboardSummary, setDashboardSummary] = useState<{
    month: string
    totalIncome: number
    totalSpend: number
    net: number
    transactionCount: number
    categorizedCount: number
    uncategorizedCount: number
  } | null>(null)
  const [dashboardCategories, setDashboardCategories] = useState<
    Array<{
      categoryId: number
      categoryName: string
      totalSpend: number
      totalIncome: number
      transactionCount: number
      categoryColor: string | null
    }>
  >([])
  const [dashboardTagSpend, setDashboardTagSpend] = useState<
    Array<{
      tagId: number
      tagName: string
      totalSpend: number
      totalIncome: number
      transactionCount: number
    }>
  >([])
  const [dashboardCategorySelectionId, setDashboardCategorySelectionId] =
    useState<number | null>(null)
  const [dashboardCategoryTransactions, setDashboardCategoryTransactions] =
    useState<
      Array<{
        id: number
        bookingDate: string
        amount: number
        currency: string
        payee: string | null
        purpose: string | null
      }>
    >([])
  const [dashboardCategoryTransactionsTotal, setDashboardCategoryTransactionsTotal] =
    useState(0)
  const dashboardBreakdownSource = useMemo<DashboardBreakdownRow[]>(
    () =>
      dashboardGroupBy === 'category'
        ? dashboardCategories.map((row) => ({
            id: row.categoryId,
            name: row.categoryName,
            color: row.categoryColor,
            totalSpend: row.totalSpend,
            totalIncome: row.totalIncome,
            transactionCount: row.transactionCount,
          }))
        : dashboardTagSpend.map((row) => ({
            id: row.tagId,
            name: row.tagName,
            color: tagColor(row.tagId),
            totalSpend: row.totalSpend,
            totalIncome: row.totalIncome,
            transactionCount: row.transactionCount,
          })),
    [dashboardGroupBy, dashboardCategories, dashboardTagSpend]
  )

  const dashboardNetBreakdown = useMemo(() => {
    const mapped = dashboardBreakdownSource
      .map((row) => ({
        ...row,
        net: row.totalIncome - row.totalSpend,
      }))
      .filter((row) => row.net < 0)
    const withAbs = mapped.map((row) => ({
      ...row,
      netAbs: Math.abs(row.net),
    }))
    withAbs.sort((a, b) => b.netAbs - a.netAbs)
    return withAbs
  }, [dashboardBreakdownSource])

  const selectedDashboardBreakdown = useMemo(
    () =>
      dashboardNetBreakdown.find(
        (row) => row.id === dashboardCategorySelectionId
      ),
    [dashboardNetBreakdown, dashboardCategorySelectionId]
  )

  const activeCategories = useMemo(
    () => categoriesAll.filter((cat) => cat.isActive === 1),
    [categoriesAll]
  )

  const categoryOptions = useMemo<CategoryOption[]>(
    () =>
      activeCategories.map((cat) => ({
        value: cat.id,
        label: cat.name,
      })),
    [activeCategories]
  )

  const categoryFilterOptions = useMemo<CategoryOption[]>(
    () =>
      categoriesAll.map((cat) => ({
        value: cat.id,
        label: cat.name,
      })),
    [categoriesAll]
  )

  const accountFilterOptions = useMemo<AccountOption[]>(
    () =>
      accounts.map((acct) => ({
        value: acct.id,
        label: acct.bank ? `${acct.name} (${acct.bank})` : acct.name,
      })),
    [accounts]
  )

  const tagOptions = useMemo<TagOption[]>(
    () =>
      allTags.map((tag) => ({
        value: tag.id,
        label: tag.name,
      })),
    [allTags]
  )

  const saveEditingAmount = async (row: TransactionRow) => {
    const parsed = parseFloat(editingAmountValue.replace(',', '.'))
    if (!isNaN(parsed)) {
      await window.api.transactions.update({ id: row.id, amount: parsed })
      loadTransactions()
      loadUncategorized()
      loadCategorized()
      loadDashboardData()
    }
    setEditingAmountId(null)
  }

  const loadTxTags = async (ids: number[]) => {
    if (ids.length === 0) {
      setTxTags({})
      return
    }
    const rows = await window.api.tags.forTransactions({ transactionIds: ids })
    const map: Record<number, Array<{ tagId: number; name: string }>> = {}
    for (const row of rows) {
      if (!map[row.transactionId]) map[row.transactionId] = []
      map[row.transactionId].push({ tagId: row.tagId, name: row.name })
    }
    setTxTags(map)
  }

  const loadAllTags = async () => {
    const result = await window.api.tags.list({ limit: 10000 })
    setAllTags(result.rows)
    loadTags()
    loadDashboardData()
  }

  const addTagToTransaction = async (transactionId: number) => {
    const name = tagInput.trim()
    if (!name) {
      setEditingTagsId(null)
      return
    }
    await window.api.tags.addToTransaction({ transactionId, name })
    setTagInput('')
    setEditingTagsId(null)
    loadTxTags(transactions.map((tx) => tx.id))
    loadAllTags()
  }

  const removeTagFromTransaction = async (transactionId: number, tagId: number) => {
    await window.api.tags.removeFromTransaction({ transactionId, tagId })
    loadTxTags(transactions.map((tx) => tx.id))
    loadAllTags()
  }

  const transactionColumns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      { header: 'Date', accessorKey: 'bookingDate' },
      {
        header: 'Account',
        accessorKey: 'accountName',
        cell: ({ row }) => (
          <span className="account-tag">{row.original.accountName ?? '—'}</span>
        ),
      },
      {
        header: 'Payee',
        accessorKey: 'payee',
        cell: ({ row }) => row.original.payee ?? '-',
      },
      {
        header: 'Purpose',
        accessorKey: 'purpose',
        cell: ({ row }) => (
          <span className="purpose">{truncatePurpose(row.original.purpose, 100)}</span>
        ),
      },
      {
        id: 'tags',
        header: 'Tags',
        cell: ({ row }) => {
          const tags = txTags[row.original.id] ?? []
          return (
            <span className="tags-cell">
              {tags.map((tag) => (
                <span key={tag.tagId} className="tag-chip">
                  {tag.name}
                  <button
                    className="tag-chip-remove"
                    onClick={() => removeTagFromTransaction(row.original.id, tag.tagId)}
                    title="Remove tag"
                  >×</button>
                </span>
              ))}
              {editingTagsId === row.original.id ? (
                <input
                  className="tag-input"
                  autoFocus
                  list="tag-suggestions"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') addTagToTransaction(row.original.id)
                    if (e.key === 'Escape') { setEditingTagsId(null); setTagInput('') }
                  }}
                  onBlur={() => addTagToTransaction(row.original.id)}
                  placeholder="tag…"
                />
              ) : (
                <button
                  className="tag-add-btn"
                  onClick={() => { setEditingTagsId(row.original.id); setTagInput('') }}
                  title="Add tag"
                >+</button>
              )}
            </span>
          )
        },
      },
      {
        header: 'Amount',
        accessorKey: 'amount',
        cell: ({ row }) =>
          editingAmountId === row.original.id ? (
            <input
              className="amount-edit-input"
              autoFocus
              value={editingAmountValue}
              onChange={(e) => setEditingAmountValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') saveEditingAmount(row.original)
                if (e.key === 'Escape') setEditingAmountId(null)
              }}
              onBlur={() => saveEditingAmount(row.original)}
            />
          ) : (
            <span
              className="amount editable-amount"
              onClick={() => {
                setEditingAmountId(row.original.id)
                setEditingAmountValue(String(row.original.amount))
              }}
              title="Click to edit"
            >
              {row.original.amount.toFixed(2)} {row.original.currency}
            </span>
          ),
      },
    ],
    [editingAmountId, editingAmountValue, txTags, editingTagsId, tagInput]
  )

  const uncategorizedColumns = useMemo<ColumnDef<TransactionRow>[]>(
    () => [
      { header: 'Date', accessorKey: 'bookingDate' },
      {
        header: 'Payee',
        accessorKey: 'payee',
        cell: ({ row }) => row.original.payee ?? '-',
      },
      {
        header: 'Purpose',
        accessorKey: 'purpose',
        cell: ({ row }) => (
          <span className="purpose">{truncatePurpose(row.original.purpose, 100)}</span>
        ),
      },
      {
        header: 'Amount',
        accessorKey: 'amount',
        cell: ({ row }) => (
          <span className="amount">
            {row.original.amount.toFixed(2)} {row.original.currency}
          </span>
        ),
      },
      {
        id: 'category',
        header: 'Category',
        cell: ({ row }) => (
          <div className="multi-select-cell">
          <Select
            className="multi-select"
            classNamePrefix="rs"
            isMulti
            isSearchable
            options={categoryOptions}
            value={categoryOptions.filter((option) =>
              (selection[row.original.id] ?? []).includes(option.value)
            )}
            onChange={(values) =>
              setSelection((current) => ({
                ...current,
                [row.original.id]: values.map((option) => option.value),
              }))
            }
            placeholder="Select categories..."
            menuPortalTarget={document.body}
            menuPosition="fixed"
            styles={{
              control: (base, state) => ({
                ...base,
                backgroundColor: '#ffffff',
                borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
                boxShadow: state.isFocused ? '0 0 0 1px #2563eb' : 'none',
                minHeight: 34,
              }),
              menu: (base) => ({
                ...base,
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                color: '#1f2937',
              }),
              menuPortal: (base) => ({
                ...base,
                zIndex: 9999,
              }),
              option: (base, state) => ({
                ...base,
                backgroundColor: state.isSelected
                  ? '#2563eb'
                  : state.isFocused
                  ? '#eef2ff'
                  : '#ffffff',
                color: state.isSelected ? '#ffffff' : '#1f2937',
              }),
              singleValue: (base) => ({ ...base, color: '#1f2937' }),
              placeholder: (base) => ({ ...base, color: '#6b7280' }),
              input: (base) => ({ ...base, color: '#1f2937' }),
              multiValue: (base) => ({
                ...base,
                backgroundColor: '#eef2ff',
                border: '1px solid #2563eb',
              }),
              multiValueLabel: (base) => ({ ...base, color: '#1f2937' }),
              multiValueRemove: (base) => ({ ...base, color: '#2563eb' }),
            }}
          />
            {(selection[row.original.id] ?? []).length > 0 && (
              <div className="chips compact">
                {categoryOptions
                  .filter((option) =>
                    (selection[row.original.id] ?? []).includes(option.value)
                  )
                  .map((option) => (
                    <span key={option.value} className="chip">
                      {option.label}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'tags',
        header: 'Tags',
        cell: ({ row }) => (
          <div className="multi-select-cell">
          <CreatableSelect
            className="multi-select"
            classNamePrefix="rs"
            isMulti
            isSearchable
            options={tagOptions}
            value={tagOptions.filter((option) =>
              (tagSelection[row.original.id] ?? []).includes(option.value)
            )}
            onChange={(values) =>
              setTagSelection((current) => ({
                ...current,
                [row.original.id]: values.map((option) => option.value),
              }))
            }
            onCreateOption={(inputValue) => createTagForRow(row.original.id, inputValue)}
            placeholder="Select or create tags..."
            menuPortalTarget={document.body}
            menuPosition="fixed"
            styles={{
              control: (base, state) => ({
                ...base,
                backgroundColor: '#ffffff',
                borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
                boxShadow: state.isFocused ? '0 0 0 1px #2563eb' : 'none',
                minHeight: 34,
              }),
              menu: (base) => ({
                ...base,
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                color: '#1f2937',
              }),
              menuPortal: (base) => ({
                ...base,
                zIndex: 9999,
              }),
              option: (base, state) => ({
                ...base,
                backgroundColor: state.isSelected
                  ? '#2563eb'
                  : state.isFocused
                  ? '#eef2ff'
                  : '#ffffff',
                color: state.isSelected ? '#ffffff' : '#1f2937',
              }),
              singleValue: (base) => ({ ...base, color: '#1f2937' }),
              placeholder: (base) => ({ ...base, color: '#6b7280' }),
              input: (base) => ({ ...base, color: '#1f2937' }),
              multiValue: (base) => ({
                ...base,
                backgroundColor: '#eef2ff',
                border: '1px solid #2563eb',
              }),
              multiValueLabel: (base) => ({ ...base, color: '#1f2937' }),
              multiValueRemove: (base) => ({ ...base, color: '#2563eb' }),
            }}
          />
            {(tagSelection[row.original.id] ?? []).length > 0 && (
              <div className="chips compact">
                {tagOptions
                  .filter((option) =>
                    (tagSelection[row.original.id] ?? []).includes(option.value)
                  )
                  .map((option) => (
                    <span key={option.value} className="chip">
                      {option.label}
                    </span>
                  ))}
              </div>
            )}
          </div>
        ),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => {
          const suggestion = aiSuggestions[row.original.id]
          const tagSuggestions = aiTagSuggestions[row.original.id] ?? []
          const hasSuggestion = Boolean(suggestion) || tagSuggestions.length > 0
          const aiTooltip = (() => {
            const parts: string[] = []
            if (suggestion) {
              const category = activeCategories.find((cat) => cat.id === suggestion.categoryId)
              parts.push(`Category: ${category?.name ?? 'Unknown'} (${suggestion.confidence.toFixed(2)})`)
              if (suggestion.reason) {
                parts.push(suggestion.reason)
              }
            }
            if (tagSuggestions.length > 0) {
              parts.push(
                `Tags: ${tagSuggestions
                  .map((tag) => `${tag.tagName} (${tag.confidence.toFixed(2)})`)
                  .join(', ')}`
              )
            }
            return parts.join('\n')
          })()
          return (
            <div className="rule-actions">
              <button
                className="rule-action"
                onClick={() => assignCategory(row.original.id)}
                disabled={
                  (selection[row.original.id] ?? []).length === 0 &&
                  (tagSelection[row.original.id] ?? []).length === 0
                }
                title="Assign selected category and tags to this transaction"
              >
                <span className="rule-icon rule-icon-add" aria-hidden="true" />
              </button>
              <button
                className="rule-action rule-action-custom"
                onClick={() => openRuleDraft(row.original)}
                disabled={categoryOptions.length === 0}
                title="Create a custom rule"
              >
                <span className="rule-icon rule-icon-custom" aria-hidden="true" />
              </button>
              <button
                className="rule-action rule-action-remove"
                onClick={() => deleteTransactionRow(row.original.id)}
                title="Delete this transaction"
              >
                <span className="rule-icon rule-icon-remove" aria-hidden="true" />
              </button>
              {hasSuggestion && (
                <button
                  type="button"
                  className="rule-action"
                  title={aiTooltip}
                  onClick={() => pushToast(aiTooltip, 'info', 8000)}
                >
                  <span className="rule-icon rule-icon-info" aria-hidden="true" />
                </button>
              )}
            </div>
          )
        },
      },
    ],
    [
      categoryOptions,
      tagOptions,
      selection,
      tagSelection,
      aiSuggestions,
      aiTagSuggestions,
      activeCategories,
    ]
  )

  const categoryColumns = useMemo<ColumnDef<CategoryRow>[]>(
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        cell: ({ row, table }) => {
          const meta = table.options.meta as CategoryTableMeta
          const draft = meta.categoryEdits[row.original.id] ?? row.original
          return (
            <input
              type="text"
              value={draft.name}
              onChange={(event) =>
                meta.setCategoryEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...(current[row.original.id] ?? row.original),
                    name: event.target.value,
                  },
                }))
              }
            />
          )
        },
      },
      {
        header: 'Color',
        accessorKey: 'color',
        cell: ({ row, table }) => {
          const meta = table.options.meta as CategoryTableMeta
          const draft = meta.categoryEdits[row.original.id] ?? row.original
          return (
            <input
              type="color"
              value={draft.color ?? '#4c7cff'}
              onChange={(event) =>
                meta.setCategoryEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...(current[row.original.id] ?? row.original),
                    color: event.target.value,
                  },
                }))
              }
            />
          )
        },
      },
      {
        header: 'Group',
        id: 'groupType',
        cell: ({ row }) => (
          <select
            value={row.original.groupType}
            onChange={async (e) => {
              await window.api.categories.updateGroup({ id: row.original.id, groupType: e.target.value })
              loadCategories()
              loadCategoriesAll()
            }}
          >
            <option value="income">Income</option>
            <option value="fixed_expense">Fixed Expenses</option>
            <option value="variable_expense">Variable Expenses</option>
            <option value="savings">Savings & Investments</option>
            <option value="transfer">Internal Transfers</option>
          </select>
        ),
      },
      {
        header: 'Status',
        id: 'status',
        cell: ({ row, table }) => {
          const meta = table.options.meta as CategoryTableMeta
          const draft = meta.categoryEdits[row.original.id] ?? row.original
          return (
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.isActive === 1}
                onChange={(event) =>
                  meta.setCategoryEdits((current) => ({
                    ...current,
                    [row.original.id]: {
                      ...(current[row.original.id] ?? row.original),
                      isActive: event.target.checked ? 1 : 0,
                    },
                  }))
                }
              />
              <span>{draft.isActive === 1 ? 'Active' : 'Inactive'}</span>
            </label>
          )
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row, table }) => {
          const meta = table.options.meta as CategoryTableMeta
          const draft = meta.categoryEdits[row.original.id]
          const hasChanges =
            draft &&
            (draft.name !== row.original.name ||
              draft.color !== row.original.color ||
              draft.isActive !== row.original.isActive)
          return (
            <div className="rule-actions">
              <button
                className="rule-action"
                onClick={() => meta.saveCategory(row.original.id)}
                disabled={!hasChanges}
                title="Save"
              >
                <span className="rule-icon rule-icon-save" aria-hidden="true" />
              </button>
              <button
                className="rule-action rule-action-remove"
                onClick={() => meta.deleteCategoryRow(row.original.id)}
                title="Delete"
              >
                <span className="rule-icon rule-icon-remove" aria-hidden="true" />
              </button>
            </div>
          )
        },
      },
    ],
    []
  )

  const accountColumns = useMemo<ColumnDef<AccountRow>[]>(
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        cell: ({ row, table }) => {
          const meta = table.options.meta as AccountTableMeta
          const draft = meta.accountEdits[row.original.id] ?? draftFromAccount(row.original)
          return (
            <input
              type="text"
              value={draft.name}
              onChange={(event) =>
                meta.setAccountEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...(current[row.original.id] ?? draftFromAccount(row.original)),
                    name: event.target.value,
                  },
                }))
              }
            />
          )
        },
      },
      {
        header: 'Type',
        id: 'type',
        cell: ({ row, table }) => {
          const meta = table.options.meta as AccountTableMeta
          const draft = meta.accountEdits[row.original.id] ?? draftFromAccount(row.original)
          return (
            <select
              value={draft.type}
              onChange={(event) =>
                meta.setAccountEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...(current[row.original.id] ?? draftFromAccount(row.original)),
                    type: event.target.value,
                  },
                }))
              }
            >
              <option value="checking">Checking</option>
              <option value="savings">Savings</option>
              <option value="credit">Credit Card</option>
            </select>
          )
        },
      },
      {
        header: 'IBAN / Card',
        id: 'identifier',
        cell: ({ row }) => <span className="muted">{row.original.identifier ?? '—'}</span>,
      },
      {
        header: 'Balance',
        id: 'balance',
        cell: ({ row }) =>
          row.original.currentBalance != null ? (
            <strong className={row.original.currentBalance < 0 ? 'negative' : ''}>
              {formatEur(row.original.currentBalance)}
            </strong>
          ) : (
            <span className="muted">set anchor</span>
          ),
      },
      {
        header: 'Anchor',
        id: 'anchor',
        cell: ({ row, table }) => {
          const meta = table.options.meta as AccountTableMeta
          const draft = meta.accountEdits[row.original.id] ?? draftFromAccount(row.original)
          const setField = (field: 'anchorBalance' | 'anchorDate', value: string) =>
            meta.setAccountEdits((current) => ({
              ...current,
              [row.original.id]: {
                ...(current[row.original.id] ?? draftFromAccount(row.original)),
                [field]: value,
              },
            }))
          return (
            <span className="account-anchor-edit">
              <input
                type="text"
                placeholder="0,00"
                style={{ width: 90 }}
                value={draft.anchorBalance}
                onChange={(event) => setField('anchorBalance', event.target.value)}
              />
              <input
                type="date"
                value={draft.anchorDate}
                onChange={(event) => setField('anchorDate', event.target.value)}
              />
            </span>
          )
        },
      },
      {
        header: 'Data through',
        id: 'dataThrough',
        cell: ({ row }) => (
          <span className="muted">
            {row.original.lastBookingDate ?? '—'}
            {row.original.transactionCount > 0 ? ` (${row.original.transactionCount} tx)` : ''}
          </span>
        ),
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row, table }) => {
          const meta = table.options.meta as AccountTableMeta
          const draft = meta.accountEdits[row.original.id]
          const baseline = draftFromAccount(row.original)
          const hasChanges =
            draft &&
            (draft.name !== baseline.name ||
              draft.type !== baseline.type ||
              draft.anchorBalance !== baseline.anchorBalance ||
              draft.anchorDate !== baseline.anchorDate)
          return (
            <div className="rule-actions">
              <button
                className="rule-action"
                onClick={() => meta.saveAccount(row.original.id)}
                disabled={!hasChanges}
                title="Save"
              >
                <span className="rule-icon rule-icon-save" aria-hidden="true" />
              </button>
              <button
                className="rule-action rule-action-remove"
                onClick={() => meta.deleteAccountRow(row.original.id)}
                title="Delete"
              >
                <span className="rule-icon rule-icon-remove" aria-hidden="true" />
              </button>
            </div>
          )
        },
      },
    ],
    []
  )

  const tagColumns = useMemo<ColumnDef<TagRow>[]>(
    () => [
      {
        header: 'Name',
        accessorKey: 'name',
        cell: ({ row, table }) => {
          const meta = table.options.meta as TagTableMeta
          const draft = meta.tagEdits[row.original.id] ?? row.original
          return (
            <input
              type="text"
              value={draft.name}
              onChange={(event) =>
                meta.setTagEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...(current[row.original.id] ?? row.original),
                    name: event.target.value,
                  },
                }))
              }
            />
          )
        },
      },
      {
        header: 'Usage',
        id: 'usageCount',
        cell: ({ row }) => (
          <span className="muted">
            {row.original.usageCount} transaction{row.original.usageCount === 1 ? '' : 's'}
          </span>
        ),
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row, table }) => {
          const meta = table.options.meta as TagTableMeta
          const draft = meta.tagEdits[row.original.id]
          const hasChanges = draft && draft.name.trim() !== '' && draft.name !== row.original.name
          return (
            <div className="rule-actions">
              <button
                className="rule-action"
                onClick={() => meta.saveTagRow(row.original.id)}
                disabled={!hasChanges}
                title="Save"
              >
                <span className="rule-icon rule-icon-save" aria-hidden="true" />
              </button>
              <button
                className="rule-action rule-action-remove"
                onClick={() => meta.deleteTagRow(row.original.id)}
                title="Delete"
              >
                <span className="rule-icon rule-icon-remove" aria-hidden="true" />
              </button>
            </div>
          )
        },
      },
    ],
    []
  )

  const rulesColumns = useMemo<ColumnDef<RuleRow>[]>(
    () => [
      {
        header: 'Field',
        accessorKey: 'matcherType',
        cell: ({ row, table }) => {
          const meta = table.options.meta as RuleTableMeta
          if (!meta) {
            return null
          }
          const draft = meta.ruleEdits[row.original.id] ?? row.original
          return (
            <select
              value={draft.matcherType}
              onChange={(event) =>
                meta.setRuleEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...draft,
                    matcherType: event.target.value,
                  },
                }))
              }
            >
              <option value="payee">Payee</option>
              <option value="purpose">Purpose</option>
              <option value="iban">IBAN</option>
              <option value="method">Method</option>
              <option value="bic">BIC</option>
              <option value="amount">Amount</option>
              <option value="direction">Direction</option>
            </select>
          )
        },
      },
      {
        header: 'Match',
        accessorKey: 'matcherOperator',
        cell: ({ row, table }) => {
          const meta = table.options.meta as RuleTableMeta
          if (!meta) {
            return null
          }
          const draft = meta.ruleEdits[row.original.id] ?? row.original
          return (
            <select
              value={draft.matcherOperator ?? 'contains'}
              onChange={(event) =>
                meta.setRuleEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...draft,
                    matcherOperator: event.target.value,
                  },
                }))
              }
            >
              <option value="contains">Contains</option>
              <option value="equals">Equals</option>
            </select>
          )
        },
      },
      {
        header: 'Value',
        accessorKey: 'matcherValue',
        cell: ({ row, table }) => {
          const meta = table.options.meta as RuleTableMeta
          if (!meta) {
            return null
          }
          const draft = meta.ruleEdits[row.original.id] ?? row.original
          return (
            <input
              type="text"
              value={draft.matcherValue}
              onChange={(event) =>
                meta.setRuleEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...draft,
                    matcherValue: event.target.value,
                  },
                }))
              }
            />
          )
        },
      },
      {
        header: 'Category',
        accessorKey: 'categoryId',
        cell: ({ row, table }) => {
          const meta = table.options.meta as RuleTableMeta
          if (!meta) {
            return null
          }
          const draft = meta.ruleEdits[row.original.id] ?? row.original
          return (
            <select
              value={draft.categoryId}
              onChange={(event) =>
                meta.setRuleEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...draft,
                    categoryId: Number(event.target.value),
                  },
                }))
              }
            >
              {meta.activeCategories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.name}
                </option>
              ))}
            </select>
          )
        },
      },
      {
        header: 'Tags',
        id: 'tags',
        cell: ({ row, table }) => {
          const meta = table.options.meta as RuleTableMeta
          if (!meta) {
            return null
          }
          const draft = meta.ruleEdits[row.original.id] ?? row.original
          return (
            <Select
              className="multi-select"
              classNamePrefix="rs"
              isMulti
              isSearchable
              options={meta.tagOptions}
              value={meta.tagOptions.filter((option) => draft.tagIds.includes(option.value))}
              onChange={(values) =>
                meta.setRuleEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...draft,
                    tagIds: values.map((option) => option.value),
                  },
                }))
              }
              placeholder="Select tags..."
              menuPortalTarget={document.body}
              menuPosition="fixed"
              styles={{
                control: (base, state) => ({
                  ...base,
                  backgroundColor: '#ffffff',
                  borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
                  boxShadow: state.isFocused ? '0 0 0 1px #2563eb' : 'none',
                  minHeight: 34,
                }),
                menu: (base) => ({
                  ...base,
                  backgroundColor: '#ffffff',
                  border: '1px solid #e5e7eb',
                  color: '#1f2937',
                }),
                menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                option: (base, state) => ({
                  ...base,
                  backgroundColor: state.isSelected
                    ? '#2563eb'
                    : state.isFocused
                    ? '#eef2ff'
                    : '#ffffff',
                  color: state.isSelected ? '#ffffff' : '#1f2937',
                }),
                singleValue: (base) => ({ ...base, color: '#1f2937' }),
                placeholder: (base) => ({ ...base, color: '#6b7280' }),
                input: (base) => ({ ...base, color: '#1f2937' }),
                multiValue: (base) => ({
                  ...base,
                  backgroundColor: '#eef2ff',
                  border: '1px solid #2563eb',
                }),
                multiValueLabel: (base) => ({ ...base, color: '#1f2937' }),
                multiValueRemove: (base) => ({ ...base, color: '#2563eb' }),
              }}
            />
          )
        },
      },
      {
        header: 'Priority',
        accessorKey: 'priority',
        cell: ({ row, table }) => {
          const meta = table.options.meta as RuleTableMeta
          if (!meta) {
            return null
          }
          const draft = meta.ruleEdits[row.original.id] ?? row.original
          return (
            <input
              type="number"
              value={draft.priority}
              min={0}
              onChange={(event) =>
                meta.setRuleEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...draft,
                    priority: Number(event.target.value),
                  },
                }))
              }
            />
          )
        },
      },
      {
        header: 'Status',
        id: 'status',
        cell: ({ row, table }) => {
          const meta = table.options.meta as RuleTableMeta
          if (!meta) {
            return null
          }
          const draft = meta.ruleEdits[row.original.id] ?? row.original
          return (
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.isActive === 1}
                onChange={(event) =>
                  meta.setRuleEdits((current) => ({
                    ...current,
                    [row.original.id]: {
                      ...draft,
                      isActive: event.target.checked ? 1 : 0,
                    },
                  }))
                }
              />
              <span>{draft.isActive === 1 ? 'Active' : 'Inactive'}</span>
            </label>
          )
        },
      },
      {
        header: '',
        id: 'actions',
        cell: ({ row, table }) => {
          const meta = table.options.meta as RuleTableMeta
          if (!meta) {
            return null
          }
          const draft = meta.ruleEdits[row.original.id]
          const hasChanges =
            draft &&
            (draft.matcherType !== row.original.matcherType ||
              draft.matcherOperator !== row.original.matcherOperator ||
              draft.matcherValue !== row.original.matcherValue ||
              draft.categoryId !== row.original.categoryId ||
              draft.priority !== row.original.priority ||
              draft.isActive !== row.original.isActive ||
              !sameTagIds(draft.tagIds, row.original.tagIds))
          return (
            <div className="rule-actions">
              <button
                className="rule-action"
                onClick={() => meta.saveRule(row.original.id)}
                disabled={!hasChanges}
                title="Save"
              >
                <span className="rule-icon rule-icon-save" aria-hidden="true" />
              </button>
              <button
                className="rule-action rule-action-remove"
                onClick={() => meta.deleteRule(row.original.id)}
                title="Delete"
              >
                <span className="rule-icon rule-icon-remove" aria-hidden="true" />
              </button>
            </div>
          )
        },
      },
    ],
    []
  )

  const loadTransactions = async () => {
    setLoadingTransactions(true)
    const result = await window.api.transactions.list({
      limit: pageSizeTransactions,
      offset: page * pageSizeTransactions,
      search: transactionSearch || undefined,
      accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
    })
    setTransactions(result.rows)
    setTransactionsTotal(result.total)
    setLoadingTransactions(false)
  }

  const loadUncategorized = async () => {
    const result = await window.api.transactions.listUncategorized({
      limit: pageSizeUncategorized,
      offset: uncategorizedPage * pageSizeUncategorized,
      accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
    })
    setUncategorized(result.rows)
    setUncategorizedTotal(result.total)
    return result.rows
  }

  const loadCategorized = async () => {
    const result = await window.api.transactions.listCategorized({
      limit: pageSizeCategorized,
      offset: categorizedPage * pageSizeCategorized,
      categoryIds: categorizedFilter.length > 0 ? categorizedFilter : undefined,
      accountIds: selectedAccountIds.length > 0 ? selectedAccountIds : undefined,
    })
    setCategorizedTotal(result.total)
    const rows = result.rows
    const grouped = new Map<number, CategorizedViewRow>()
    rows.forEach((row) => {
      const existing = grouped.get(row.id)
      if (!existing) {
        grouped.set(row.id, {
          id: row.id,
          bookingDate: row.bookingDate,
          amount: row.amount,
          currency: row.currency,
          payee: row.payee,
          purpose: row.purpose,
          categoryCount: row.categoryCount,
          source: row.source,
          categories: [{ id: row.categoryId, name: row.categoryName }],
        })
      } else {
        existing.categories.push({ id: row.categoryId, name: row.categoryName })
      }
    })
    setCategorized(Array.from(grouped.values()))
  }

  const loadCategories = async () => {
    const result = await window.api.categories.list({
      limit: pageSizeCategories,
      offset: categoriesPage * pageSizeCategories,
      search: categorySearch || undefined,
    })
    setCategories(result.rows)
    setCategoriesTotal(result.total)
    setCategoryEdits({})
  }

  const loadCategoriesAll = async () => {
    const result = await window.api.categories.list({
      limit: 10000,
      offset: 0,
    })
    setCategoriesAll(result.rows)
  }

  const loadAccounts = async () => {
    const rows = await window.api.accounts.list()
    setAccounts(rows)
    setAccountEdits({})
  }

  const loadTags = async () => {
    const result = await window.api.tags.list({
      limit: pageSizeTags,
      offset: tagsPage * pageSizeTags,
      search: tagSearch || undefined,
    })
    setTags(result.rows)
    setTagsTotal(result.total)
    setTagEdits({})
  }

  const loadRules = async () => {
    const result = await window.api.rules.list({
      limit: pageSizeRules,
      offset: rulesPage * pageSizeRules,
      search: ruleSearch || undefined,
    })
    setRules(result.rows)
    setRulesTotal(result.total)
    setRuleEdits({})
  }

  const loadAiSuggestions = async (ids: number[]) => {
    if (ids.length === 0) {
      setAiSuggestions({})
      setAiTagSuggestions({})
      return
    }

    const [suggestions, tagSuggestions] = await Promise.all([
      window.api.ai.suggestions({ transactionIds: ids }),
      window.api.ai.tagSuggestions({ transactionIds: ids }),
    ])
    const map: Record<
      number,
      { categoryId: number; confidence: number; reason: string | null }
    > = {}
    for (const item of suggestions) {
      map[item.transactionId] = {
        categoryId: item.categoryId,
        confidence: item.confidence,
        reason: item.reason ?? null,
      }
    }
    setAiSuggestions(map)

    const tagMap: Record<number, Array<{ tagName: string; confidence: number }>> = {}
    for (const item of tagSuggestions) {
      if (!tagMap[item.transactionId]) tagMap[item.transactionId] = []
      tagMap[item.transactionId].push({ tagName: item.tagName, confidence: item.confidence })
    }
    setAiTagSuggestions(tagMap)

    setSelection((current) => {
      const next = { ...current }
      for (const item of suggestions) {
        const existing = next[item.transactionId] ?? []
        if (existing.length === 0) {
          next[item.transactionId] = [item.categoryId]
        }
      }
      return next
    })

    // Suggested tags are named, not id-based (the AI can propose brand-new
    // tag names) — only prefill the dropdown when the name already matches
    // an existing tag, since we can't select an option that doesn't exist.
    const matchedTagIdsByTx = new Map<number, number[]>()
    for (const item of tagSuggestions) {
      const match = allTags.find((tag) => tag.name.toLowerCase() === item.tagName.toLowerCase())
      if (!match) continue
      const ids = matchedTagIdsByTx.get(item.transactionId) ?? []
      if (!ids.includes(match.id)) ids.push(match.id)
      matchedTagIdsByTx.set(item.transactionId, ids)
    }
    setTagSelection((current) => {
      const next = { ...current }
      for (const [transactionId, ids] of matchedTagIdsByTx) {
        const existing = next[transactionId] ?? []
        if (existing.length === 0) {
          next[transactionId] = ids
        }
      }
      return next
    })
  }

  const loadAiSettings = async () => {
    const settings = await window.api.ai.getSettings()
    const keyStatus = await window.api.ai.keyStatus()
    setAiSettings({
      model: settings.model,
      enabled: settings.enabled,
      confidenceThreshold: settings.confidenceThreshold,
      inputCostPer1M: settings.inputCostPer1M,
      outputCostPer1M: settings.outputCostPer1M,
      webSearch: settings.webSearch ?? 0,
      apiKey: settings.apiKey,
    })
    setAiKeyStatus(keyStatus)
    await loadAiRequests()
  }

  const loadAiRequests = async () => {
    const result = await window.api.ai.listRequests({
      limit: pageSizeAiRequests,
      offset: aiRequestsPage * pageSizeAiRequests,
    })
    setAiRequests(result.rows)
    setAiRequestsTotal(result.total)
  }

  const loadDashboardMonths = async () => {
    const months = await window.api.dashboard.months()
    setDashboardMonths(months)
    if (!dashboardMonth && months.length > 0) {
      setDashboardMonth(months[0])
    }
  }

  const getRangeBounds = (range: 'last1' | 'last3' | 'last6') => {
    const latest = dashboardMonths[0] ?? dashboardMonth
    if (!latest) {
      return null
    }
    const [yearStr, monthStr] = latest.split('-')
    const year = Number(yearStr)
    const month = Number(monthStr)
    if (!year || !month) {
      return null
    }
    const monthsBack = range === 'last1' ? 1 : range === 'last3' ? 3 : 6
    const start = new Date(year, month - 1, 1)
    start.setMonth(start.getMonth() - (monthsBack - 1))
    const startMonth = `${start.getFullYear()}-${String(
      start.getMonth() + 1
    ).padStart(2, '0')}`
    return { startMonth, endMonth: latest, monthsBack }
  }

  const loadDashboardData = async () => {
    const accountIds = selectedAccountIds.length > 0 ? selectedAccountIds : undefined
    if (dashboardRange === 'month') {
      if (!dashboardMonth) {
        return
      }
      const [summary, categories, tagSpend] = await Promise.all([
        window.api.dashboard.summary({ month: dashboardMonth, accountIds }),
        window.api.dashboard.categories({ month: dashboardMonth, accountIds }),
        window.api.dashboard.tags({ month: dashboardMonth, accountIds }),
      ])
      setDashboardSummary(summary)
      setDashboardCategories(categories)
      setDashboardTagSpend(tagSpend)
      return
    }

    const bounds = getRangeBounds(dashboardRange)
    if (!bounds) {
      return
    }

    const [summary, categories, tagSpend] = await Promise.all([
      window.api.dashboard.summaryRange({
        startMonth: bounds.startMonth,
        endMonth: bounds.endMonth,
        accountIds,
      }),
      window.api.dashboard.categoriesRange({
        startMonth: bounds.startMonth,
        endMonth: bounds.endMonth,
        accountIds,
      }),
      window.api.dashboard.tagsRange({
        startMonth: bounds.startMonth,
        endMonth: bounds.endMonth,
        accountIds,
      }),
    ])
    setDashboardSummary(summary)
    setDashboardCategories(categories)
    setDashboardTagSpend(tagSpend)
  }

  const loadDashboardCategoryTransactions = async () => {
    if (!dashboardCategorySelectionId) {
      setDashboardCategoryTransactions([])
      setDashboardCategoryTransactionsTotal(0)
      return
    }

    const accountIds = selectedAccountIds.length > 0 ? selectedAccountIds : undefined
    const result =
      dashboardGroupBy === 'category'
        ? await window.api.transactions.listCategorized({
            limit: pageSizeDashboardTransactions,
            offset: dashboardCategoryPage * pageSizeDashboardTransactions,
            categoryIds: [dashboardCategorySelectionId],
            accountIds,
          })
        : await window.api.transactions.listByTag({
            tagId: dashboardCategorySelectionId,
            limit: pageSizeDashboardTransactions,
            offset: dashboardCategoryPage * pageSizeDashboardTransactions,
            accountIds,
          })

    setDashboardCategoryTransactions(result.rows)
    setDashboardCategoryTransactionsTotal(result.total)
  }

  const handleDashboardCategorySelect = (categoryId: number) => {
    setDashboardCategorySelectionId(categoryId)
    setDashboardCategoryPage(0)
  }

  const renderDashboardCategoryClickLayer = (props: any) => {
    const xAxis = Object.values(props?.xAxisMap ?? {})[0] as any
    const offset = props?.offset as
      | { top: number; height: number }
      | undefined
    const data = Array.isArray(props?.data) ? props.data : []

    if (!xAxis?.scale?.bandwidth || !offset) {
      return null
    }

    const bandWidth = xAxis.scale.bandwidth()

    return (
      <g>
        {data.map((entry: { id?: number; name?: string }, index: number) => {
          if (!entry?.name || !entry?.id) {
            return null
          }
          const x = xAxis.scale(entry.name)
          if (x == null) {
            return null
          }
          return (
            <rect
              key={`${entry.id}-${index}`}
              x={x}
              y={offset.top}
              width={bandWidth}
              height={offset.height}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: 'pointer' }}
              onClick={() => handleDashboardCategorySelect(entry.id as number)}
            />
          )
        })}
      </g>
    )
  }

  useEffect(() => {
    loadTransactions()
    loadUncategorized()
    loadCategorized()
    loadCategories()
    loadCategoriesAll()
    loadRules()
    loadTags()
    loadAiSettings()
    loadDashboardMonths()
    loadAccounts()
  }, [])

  useEffect(() => {
    const unsubscribe = window.api.ai.onSuggestProgress((status) => {
      setAiStatus(status)
    })
    return unsubscribe
  }, [])

  useEffect(() => {
    loadTxTags(transactions.map((tx) => tx.id))
  }, [transactions])

  useEffect(() => {
    loadAllTags()
  }, [])

  useEffect(() => {
    if (dashboardRange === 'month' && dashboardMonth) {
      loadDashboardData()
    }
  }, [dashboardMonth, dashboardRange, selectedAccountIds])

  useEffect(() => {
    if (dashboardRange !== 'month') {
      loadDashboardData()
    }
  }, [dashboardRange, dashboardMonths, selectedAccountIds])

  useEffect(() => {
    if (dashboardNetBreakdown.length === 0) {
      setDashboardCategorySelectionId(null)
      return
    }
    setDashboardCategorySelectionId((current) => {
      if (
        current &&
        dashboardNetBreakdown.some((row) => row.id === current)
      ) {
        return current
      }
      return dashboardNetBreakdown[0].id
    })
    setDashboardCategoryPage(0)
  }, [dashboardNetBreakdown])

  useEffect(() => {
    loadDashboardCategoryTransactions()
  }, [
    dashboardCategorySelectionId,
    dashboardCategoryPage,
    pageSizeDashboardTransactions,
    selectedAccountIds,
  ])

  useEffect(() => {
    if (activeCategories.length > 0 && newRule.categoryId === 0) {
      setNewRule((current) => ({
        ...current,
        categoryId: activeCategories[0].id,
      }))
    }
  }, [activeCategories, newRule.categoryId])

  useEffect(() => {
    setPage(0)
  }, [transactionSearch])

  useEffect(() => {
    loadTransactions()
  }, [page, pageSizeTransactions, transactionSearch, selectedAccountIds])

  useEffect(() => {
    loadUncategorized()
  }, [uncategorizedPage, pageSizeUncategorized, selectedAccountIds])

  useEffect(() => {
    loadCategorized()
  }, [categorizedPage, pageSizeCategorized, categorizedFilter, selectedAccountIds])

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(uncategorizedTotal / pageSizeUncategorized) - 1
    )
    if (uncategorizedPage > maxPage) {
      setUncategorizedPage(maxPage)
    }
  }, [uncategorizedTotal, pageSizeUncategorized, uncategorizedPage])

  useEffect(() => {
    setCategorizedPage(0)
  }, [categorizedFilter])

  useEffect(() => {
    setPage(0)
  }, [selectedAccountIds])

  useEffect(() => {
    setUncategorizedPage(0)
  }, [selectedAccountIds])

  useEffect(() => {
    setCategorizedPage(0)
  }, [selectedAccountIds])

  useEffect(() => {
    setCategoriesPage(0)
  }, [categorySearch])

  useEffect(() => {
    loadCategories()
  }, [categoriesPage, pageSizeCategories, categorySearch])

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(categoriesTotal / pageSizeCategories) - 1
    )
    if (categoriesPage > maxPage) {
      setCategoriesPage(maxPage)
    }
  }, [categoriesTotal, pageSizeCategories, categoriesPage])

  useEffect(() => {
    loadAiRequests()
  }, [aiRequestsPage, pageSizeAiRequests])

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(aiRequestsTotal / pageSizeAiRequests) - 1
    )
    if (aiRequestsPage > maxPage) {
      setAiRequestsPage(maxPage)
    }
  }, [aiRequestsTotal, pageSizeAiRequests, aiRequestsPage])

  useEffect(() => {
    loadRules()
  }, [rulesPage, pageSizeRules, ruleSearch])

  useEffect(() => {
    setRulesPage(0)
  }, [ruleSearch])

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(rulesTotal / pageSizeRules) - 1)
    if (rulesPage > maxPage) {
      setRulesPage(maxPage)
    }
  }, [rulesTotal, pageSizeRules, rulesPage])

  useEffect(() => {
    setTagsPage(0)
  }, [tagSearch])

  useEffect(() => {
    loadTags()
  }, [tagsPage, pageSizeTags, tagSearch])

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(tagsTotal / pageSizeTags) - 1)
    if (tagsPage > maxPage) {
      setTagsPage(maxPage)
    }
  }, [tagsTotal, pageSizeTags, tagsPage])

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(
        dashboardCategoryTransactionsTotal / pageSizeDashboardTransactions
      ) - 1
    )
    if (dashboardCategoryPage > maxPage) {
      setDashboardCategoryPage(maxPage)
    }
  }, [
    dashboardCategoryTransactionsTotal,
    pageSizeDashboardTransactions,
    dashboardCategoryPage,
  ])

  useEffect(() => {
    loadAiSuggestions(uncategorized.map((tx) => tx.id))
  }, [uncategorized])

  useEffect(() => {
    const clamp = (value: number, min: number, max: number) =>
      Math.max(min, Math.min(max, value))
    const updatePageSizes = () => {
      const estimatedRowHeight = 44
      const calc = (reserved: number, min = 8, max = 30) => {
        const available = Math.max(200, window.innerHeight - reserved)
        return clamp(Math.floor(available / estimatedRowHeight), min, max)
      }

      setPageSizeTransactions(calc(320, 10, 30))
      setPageSizeUncategorized(calc(420, 8, 24))
      setPageSizeCategorized(calc(380, 8, 24))
      setPage(0)
      setUncategorizedPage(0)
      setCategorizedPage(0)
    }

    updatePageSizes()
    window.addEventListener('resize', updatePageSizes)
    return () => window.removeEventListener('resize', updatePageSizes)
  }, [])

  const pushToast = (
    message: string,
    tone: Toast['tone'] = 'info',
    duration = 4000
  ) => {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    setToasts((current) => [...current, { id, message, tone }])
    window.setTimeout(() => {
      setToasts((current) => current.filter((toast) => toast.id !== id))
    }, duration)
  }

  const closeImportModal = () => {
    setImportModalOpen(false)
    setFilePath(null)
    setStatus('Idle')
    setWarnings([])
  }

  const clearAndReset = async () => {
    const confirmed = window.confirm(
      'This will permanently delete ALL transactions, rules, budgets, and imports, and restore only the 14 default categories. This cannot be undone. Continue?'
    )
    if (!confirmed) return
    await window.api.db.clearAndReset()
    setDashboardMonths([])
    setDashboardMonth('')
    setDashboardSummary(null)
    setDashboardCategories([])
    loadTransactions()
    loadUncategorized()
    loadCategorized()
    loadCategories()
    loadCategoriesAll()
    loadRules()
    setCategorizationVersion((v) => v + 1)
    pushToast('Database reset. Default categories restored.', 'success')
  }

  const clearTransactions = async () => {
    const confirmed = window.confirm(
      'This will permanently delete all transactions and imports. This cannot be undone. Continue?'
    )
    if (!confirmed) return
    await window.api.db.clearTransactions()
    setDashboardMonths([])
    setDashboardMonth('')
    setDashboardSummary(null)
    setDashboardCategories([])
    loadTransactions()
    loadUncategorized()
    loadCategorized()
    setCategorizationVersion((v) => v + 1)
    pushToast('All transactions deleted.', 'success')
  }

  const pickFile = async (provider: 'dkb' | 'ing' | 'sparkasse' | 'volksbank') => {
    const selected = await window.api.import.pickFile(provider)
    if (selected) {
      setFilePath(selected)
      setImportProvider(provider)
      setStatus('File selected.')
      pushToast('File selected.', 'info')
      setWarnings([])
    }
  }

  const runImport = async () => {
    if (!filePath) {
      setStatus('Pick a CSV file first.')
      pushToast('Pick a CSV file first.', 'error')
      return
    }
    setStatus('Importing...')
    const result =
      importProvider === 'ing'
        ? await window.api.import.ing(filePath)
        : importProvider === 'sparkasse'
        ? await window.api.import.sparkasse(filePath)
        : importProvider === 'volksbank'
        ? await window.api.import.volksbank(filePath)
        : await window.api.import.dkb(filePath)
    if (result.success) {
      setStatus(`Imported ${result.inserted} rows (skipped ${result.skipped}).`)
      pushToast(
        `Imported ${result.inserted} rows (skipped ${result.skipped}).`,
        'success'
      )
      loadTransactions()
      loadUncategorized()
      loadCategorized()
      loadDashboardMonths()
      loadDashboardData()
    } else {
      setStatus(`Import failed: ${result.error ?? 'Unknown error'}`)
      pushToast(`Import failed: ${result.error ?? 'Unknown error'}`, 'error')
    }
    setWarnings(result.warnings ?? [])
  }

  const createCategory = async () => {
    if (!newCategoryName.trim()) {
      setCategoryStatus('Name is required.')
      pushToast('Category name is required.', 'error')
      return
    }

    const createdId = await window.api.categories.create({
      name: newCategoryName.trim(),
      color: newCategoryColor || null,
    })

    if (!createdId) {
      setCategoryStatus('Category could not be created.')
      pushToast('Category could not be created.', 'error')
      return
    }

    setCategoryStatus('Category created.')
    pushToast('Category created.', 'success')
    setNewCategoryName('')
    setNewCategoryColor('#4c7cff')
    setNewCategoryModalOpen(false)
    loadCategories()
    loadCategoriesAll()
  }

  const saveCategory = async (id: number) => {
    const draft = categoryEdits[id]
    if (!draft) {
      return
    }
    await window.api.categories.update({
      id,
      name: draft.name,
      color: draft.color,
      isActive: draft.isActive,
    })
    setCategoryStatus('Category saved.')
    pushToast('Category updated.', 'success')
    loadCategories()
    loadCategoriesAll()
  }

  const saveAccount = async (id: number) => {
    const draft = accountEdits[id]
    if (!draft) {
      return
    }
    const trimmedBalance = draft.anchorBalance.trim()
    const anchorBalance =
      trimmedBalance === '' ? null : parseFloat(trimmedBalance.replace(',', '.'))
    if (anchorBalance !== null && Number.isNaN(anchorBalance)) {
      pushToast('Anchor balance must be a number.', 'error')
      return
    }
    await window.api.accounts.update({
      id,
      name: draft.name,
      type: draft.type,
      anchorBalance,
      anchorDate: draft.anchorDate.trim() === '' ? null : draft.anchorDate,
    })
    pushToast('Account updated.', 'success')
    loadAccounts()
  }

  const deleteAccountRow = (id: number) => {
    const account = accounts.find((a) => a.id === id)
    const txCount = account?.transactionCount ?? 0
    setConfirmDialog({
      message:
        txCount > 0
          ? `Delete this account and all ${txCount} associated transaction${txCount === 1 ? '' : 's'}? This cannot be undone.`
          : 'Delete this account? This cannot be undone.',
      onConfirm: async () => {
        const success = await window.api.accounts.delete({ id })
        if (success) {
          pushToast('Account deleted.', 'success')
        } else {
          pushToast('Account could not be deleted.', 'error')
        }
        setConfirmDialog(null)
        loadAccounts()
      },
    })
  }

  const deleteCategoryRow = async (id: number) => {
    const result = await window.api.categories.delete({ id })
    if (result.deleted) {
      setCategoryStatus('Category deleted.')
      pushToast('Category deleted.', 'success')
    } else if (result.archived) {
      setCategoryStatus('Category in use. Archived instead.')
      pushToast('Category in use. Archived instead.', 'info')
    } else {
      setCategoryStatus('Category could not be deleted.')
      pushToast('Category could not be deleted.', 'error')
    }
    loadCategories()
    loadCategoriesAll()
  }

  const createTag = async () => {
    const name = newTagName.trim()
    if (!name) {
      setTagStatus('Name is required.')
      pushToast('Tag name is required.', 'error')
      return
    }

    const createdId = await window.api.tags.create({ name })

    if (!createdId) {
      setTagStatus('Tag could not be created.')
      pushToast('Tag could not be created.', 'error')
      return
    }

    setTagStatus('Tag created.')
    pushToast('Tag created.', 'success')
    setNewTagName('')
    setNewTagModalOpen(false)
    loadTags()
    loadAllTags()
  }

  const saveTagRow = async (id: number) => {
    const draft = tagEdits[id]
    if (!draft) {
      return
    }
    await window.api.tags.rename({ id, name: draft.name })
    setTagStatus('Tag saved.')
    pushToast('Tag updated.', 'success')
    loadTags()
    loadAllTags()
  }

  const deleteTagRow = async (id: number) => {
    await window.api.tags.delete({ id })
    setTagStatus('Tag deleted.')
    pushToast('Tag deleted.', 'success')
    loadTags()
    loadAllTags()
  }

  const assignCategory = async (transactionId: number) => {
    const categoryIds = selection[transactionId] ?? []
    const tagIds = tagSelection[transactionId] ?? []
    if (categoryIds.length === 0 && tagIds.length === 0) {
      return
    }

    await Promise.all([
      ...categoryIds.map((categoryId) =>
        window.api.transactions.addCategory({ transactionId, categoryId })
      ),
      ...tagIds.flatMap((tagId) => {
        const tag = allTags.find((t) => t.id === tagId)
        return tag ? [window.api.tags.addToTransaction({ transactionId, name: tag.name })] : []
      }),
    ])
    setSelection((current) => {
      const next = { ...current }
      delete next[transactionId]
      return next
    })
    setTagSelection((current) => {
      const next = { ...current }
      delete next[transactionId]
      return next
    })
    loadUncategorized()
    loadCategorized()
    loadDashboardData()
    setCategorizationVersion((v) => v + 1)
    if (tagIds.length > 0) {
      loadAllTags()
    }
  }

  const removeCategory = async (transactionId: number, categoryId: number) => {
    await window.api.transactions.removeCategory({ transactionId, categoryId })
    loadUncategorized()
    loadCategorized()
  }

  const deleteTransactionRow = (transactionId: number) => {
    setConfirmDialog({
      message: 'Delete this transaction? This cannot be undone.',
      onConfirm: async () => {
        const success = await window.api.transactions.delete({
          id: transactionId,
        })
        if (success) {
      pushToast('Transaction deleted.', 'success')
          loadTransactions()
          loadUncategorized()
          loadCategorized()
          loadDashboardMonths()
          loadDashboardData()
        } else {
      pushToast('Transaction could not be deleted.', 'error')
        }
        setConfirmDialog(null)
      },
    })
  }

  const categorizedColumns = useMemo<ColumnDef<CategorizedViewRow>[]>(
    () => [
      { header: 'Date', accessorKey: 'bookingDate' },
      {
        header: 'Payee',
        accessorKey: 'payee',
        cell: ({ row }) => row.original.payee ?? '-',
      },
      {
        header: 'Purpose',
        accessorKey: 'purpose',
        cell: ({ row }) => (
          <span className="purpose">{truncatePurpose(row.original.purpose, 100)}</span>
        ),
      },
      {
        header: 'Amount',
        accessorKey: 'amount',
        cell: ({ row }) => (
          <span className="amount">
            {row.original.amount.toFixed(2)} {row.original.currency}
          </span>
        ),
      },
      {
        id: 'categories',
        header: 'Categories',
        cell: ({ row }) => (
          <div className="chips">
            {row.original.categories.map((cat) => (
              <button
                key={cat.id}
                className="chip"
                onClick={() => removeCategory(row.original.id, cat.id)}
              >
                {cat.name}
                <span className="chip-remove">x</span>
              </button>
            ))}
          </div>
        ),
      },
      {
        id: 'delete',
        header: '',
        cell: ({ row }) => (
          <button onClick={() => deleteTransactionRow(row.original.id)}>
            Remove
          </button>
        ),
      },
    ],
    [removeCategory, deleteTransactionRow]
  )

  const createTagForRuleDraft = async (name: string) => {
    const id = await window.api.tags.create({ name })
    if (!id) return
    await loadAllTags()
    setRuleDraft((current) => (current ? { ...current, tagIds: [...current.tagIds, id] } : current))
  }

  const createTagForRow = async (transactionId: number, name: string) => {
    const id = await window.api.tags.create({ name })
    if (!id) return
    await loadAllTags()
    setTagSelection((current) => ({
      ...current,
      [transactionId]: [...(current[transactionId] ?? []), id],
    }))
  }

  const openRuleDraft = (tx: TransactionRow) => {
    const defaultCategory =
      (selection[tx.id] ?? [])[0] ?? activeCategories[0]?.id
    if (!defaultCategory) {
      setRulesStatusModal('Create a category first.')
      pushToast('Create a category first.', 'error')
      return
    }

    setRuleDraft({
      txId: tx.id,
      matcherType: 'payee',
      matcherOperator: 'contains',
      matcherValue: tx.payee ?? tx.purpose ?? '',
      categoryId: defaultCategory,
      priority: 100,
      isActive: 1,
      tagIds: tagSelection[tx.id] ?? [],
    })
  }

  const createQuickRulesForAll = async () => {
    const txsWithSelection = uncategorized.filter(
      (tx) => (selection[tx.id] ?? []).length > 0
    )
    if (txsWithSelection.length === 0) {
      pushToast('Select a category for at least one transaction first.', 'info')
      return
    }

    let created = 0
    for (const tx of txsWithSelection) {
      const defaultCategory = (selection[tx.id] ?? [])[0]
      if (!defaultCategory) continue
      const matcherType = tx.payee ? 'payee' : 'purpose'
      const matcherValue = tx.payee ?? tx.purpose ?? ''
      if (!matcherValue.trim()) continue
      await window.api.rules.create({
        matcherType,
        matcherOperator: 'contains',
        matcherValue: matcherValue.trim(),
        categoryId: defaultCategory,
        priority: 100,
        isActive: 1,
      })
      created++
    }

    if (created === 0) {
      pushToast('No valid transactions to create rules for.', 'info')
      return
    }

    setRulesStatus(`Creating ${created} rule${created > 1 ? 's' : ''}...`)
    await applyRules()
    loadRules()
    pushToast(`${created} rule${created > 1 ? 's' : ''} created and applied.`, 'success')
  }


  const saveRuleDraft = async () => {
    if (!ruleDraft) {
      return
    }
    if (!ruleDraft.matcherValue.trim()) {
      setRulesStatusModal('Enter a value to match before saving the rule.')
      pushToast('Enter a value to match before saving the rule.', 'error')
      return
    }

    await window.api.rules.create({
      matcherType: ruleDraft.matcherType,
      matcherOperator: ruleDraft.matcherOperator,
      matcherValue: ruleDraft.matcherValue.trim(),
      categoryId: ruleDraft.categoryId,
      priority: ruleDraft.priority,
      isActive: ruleDraft.isActive,
      tagIds: ruleDraft.tagIds,
    })

    setRuleDraft(null)
    await applyRules()
    loadRules()
    setRulesStatusModal('Custom rule created and applied.')
    pushToast('Rule created and applied.', 'success')
  }

  const applyRules = async () => {
    setRulesStatus('Applying rules...')
    const result = await window.api.rules.apply()
    setRulesStatus(
      `Applied ${result.applied} matches across ${result.transactionsMatched} transactions.`
    )
    loadUncategorized()
    loadCategorized()
    loadDashboardData()
    setCategorizationVersion((v) => v + 1)
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(value)

  const formatNetTooltip = (
    value: number | string,
    _name: string,
    item: { payload?: { net?: number } }
  ) => {
    const net = item?.payload?.net
    if (typeof net === 'number') {
      return formatCurrency(net)
    }
    if (typeof value === 'number') {
      return formatCurrency(value)
    }
    return String(value)
  }

  const truncatePurpose = (value: string | null, limit = 100) => {
    if (!value) {
      return '-'
    }
    return value.length > limit ? `${value.slice(0, limit - 3)}...` : value
  }

  const formatCompactCurrency = (value: number) =>
    new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
      notation: 'compact',
      maximumFractionDigits: 1,
    }).format(value)

  const suggestWithAi = async () => {
    if (aiSuggestLoading) return
    setAiSuggestLoading(true)
    setAiStatus('Requesting AI suggestions...')
    try {
      const result = await window.api.ai.suggestAll()

      if (result.error) {
        setAiStatus(result.error)
        pushToast(result.error, 'error')
        return
      }

      const needsReview = result.applied - result.autoApplied
      const summary = `AI categorized ${result.autoApplied} transactions automatically (${result.autoAppliedTags} tags auto-applied); ${needsReview} suggestions need review.`
      setAiStatus(summary)
      pushToast(summary, 'success')
      if (result.warnings?.length) {
        pushToast(`${result.warnings.length} batch(es) failed — run Suggest again to retry those.`, 'error')
      }
      let currentIds = uncategorized.map((tx) => tx.id)
      if (result.autoApplied > 0) {
        currentIds = (await loadUncategorized()).map((tx) => tx.id)
        loadCategorized()
        setCategorizationVersion((v) => v + 1)
      }
      await loadAiSuggestions(currentIds)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'AI suggestion failed unexpectedly.'
      setAiStatus(message)
      pushToast(message, 'error')
    } finally {
      setAiSuggestLoading(false)
    }
  }

  const createRule = async () => {
    if (!newRule.matcherValue.trim() || !newRule.categoryId) {
      setRulesStatusModal('Select a category and enter a match value first.')
      pushToast('Select a category and enter a match value first.', 'error')
      return
    }

    await window.api.rules.create({
      matcherType: newRule.matcherType,
      matcherOperator: newRule.matcherOperator,
      matcherValue: newRule.matcherValue.trim(),
      categoryId: newRule.categoryId,
      priority: newRule.priority,
      isActive: newRule.isActive,
      tagIds: newRule.tagIds,
    })

    setNewRule({
      matcherType: newRule.matcherType,
      matcherOperator: newRule.matcherOperator,
      matcherValue: '',
      categoryId: newRule.categoryId,
      priority: newRule.priority,
      isActive: newRule.isActive,
      tagIds: [],
    })
    await applyRules()
    setRulesStatusModal('Rule created and applied.')
    pushToast('Rule created and applied.', 'success')
    setNewRuleModalOpen(false)
    loadRules()
  }

  const updateRule = async (id: number) => {
    const draft = ruleEdits[id]
    if (!draft) {
      return
    }
    await window.api.rules.update({ id, ...draft })
    pushToast('Rule updated.', 'success')
    loadRules()
  }

  const removeRule = async (id: number) => {
    await window.api.rules.delete({ id })
    pushToast('Rule deleted.', 'success')
    loadRules()
  }

  return (
    <div className="app-shell">
      <div className="toast-stack" role="status" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast ${toast.tone}`}>
            <span>{toast.message}</span>
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() =>
                setToasts((current) =>
                  current.filter((item) => item.id !== toast.id)
                )
              }
            >
              x
            </button>
          </div>
        ))}
      </div>
      <aside className="sidebar">
        <div className="brand">
          <img className="brand-logo" src={horusLogo} alt="Horus logo" />
        </div>
        <div className="sidebar-filter">
          <span className="sidebar-filter-label">Accounts</span>
          <Select
            className="multi-select account-filter"
            classNamePrefix="rs"
            isMulti
            isSearchable
            closeMenuOnSelect={false}
            hideSelectedOptions={false}
            controlShouldRenderValue={false}
            options={accountFilterOptions}
            value={accountFilterOptions.filter((o) => selectedAccountIds.includes(o.value))}
            onChange={(values) => setSelectedAccountIds(values.map((o) => o.value))}
            placeholder={
              selectedAccountIds.length === 0
                ? 'All accounts'
                : selectedAccountIds.length === 1
                ? accountFilterOptions.find((o) => o.value === selectedAccountIds[0])?.label ?? '1 account selected'
                : `${selectedAccountIds.length} accounts selected`
            }
            menuPortalTarget={document.body}
            menuPosition="fixed"
            styles={{
              ...multiSelectStyles,
              valueContainer: (base) => ({
                ...base,
                flexWrap: 'nowrap',
                overflow: 'hidden',
              }),
              placeholder: (base) => ({
                ...base,
                color: selectedAccountIds.length > 0 ? '#1f2937' : '#6b7280',
                overflow: 'hidden',
                whiteSpace: 'nowrap',
                textOverflow: 'ellipsis',
                maxWidth: '100%',
              }),
            }}
          />
        </div>
        <nav className="nav">
          <div className="nav-section">
            <button
              className={activeView === 'dashboard' ? 'active' : ''}
              onClick={() => setActiveView('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={activeView === 'budget' ? 'active' : ''}
              onClick={() => setActiveView('budget')}
            >
              Budget
            </button>
          </div>
          <div className="nav-section">
            <span className="nav-section-label">Actions</span>
            <button
              className={activeView === 'transactions' ? 'active' : ''}
              onClick={() => setActiveView('transactions')}
            >
              Transactions
            </button>
            <button
              className={activeView === 'categorization' ? 'active' : ''}
              onClick={() => setActiveView('categorization')}
            >
              Categorization
            </button>
          </div>
          <div className="nav-section">
            <span className="nav-section-label">Configuration</span>
            <button
              className={activeView === 'categories' ? 'active' : ''}
              onClick={() => setActiveView('categories')}
            >
              Categories
            </button>
            <button
              className={activeView === 'rules' ? 'active' : ''}
              onClick={() => setActiveView('rules')}
            >
              Rules
            </button>
            <button
              className={activeView === 'tags' ? 'active' : ''}
              onClick={() => setActiveView('tags')}
            >
              Tags
            </button>
            <button
              className={activeView === 'accounts' ? 'active' : ''}
              onClick={() => setActiveView('accounts')}
            >
              Accounts
            </button>
          </div>
          <div className="nav-section">
            <button
              className={activeView === 'ai' ? 'active' : ''}
              onClick={() => setActiveView('ai')}
            >
              Settings
            </button>
            <button
              className={activeView === 'docs' ? 'active' : ''}
              onClick={() => setActiveView('docs')}
            >
              Docs
            </button>
          </div>
        </nav>
      </aside>
      <div className="app">
        {activeView === 'dashboard' && (
          <DashboardView
            dashboardMonths={dashboardMonths}
            dashboardMonth={dashboardMonth}
            setDashboardMonth={setDashboardMonth}
            dashboardRange={dashboardRange}
            setDashboardRange={setDashboardRange}
            dashboardGroupBy={dashboardGroupBy}
            setDashboardGroupBy={setDashboardGroupBy}
            dashboardSummary={dashboardSummary}
            dashboardNetBreakdown={dashboardNetBreakdown}
            dashboardCategorySelectionId={dashboardCategorySelectionId}
            setDashboardCategorySelectionId={setDashboardCategorySelectionId}
            dashboardCategoryPage={dashboardCategoryPage}
            setDashboardCategoryPage={setDashboardCategoryPage}
            pageSizeDashboardTransactions={pageSizeDashboardTransactions}
            dashboardCategoryTransactions={dashboardCategoryTransactions}
            dashboardCategoryTransactionsTotal={dashboardCategoryTransactionsTotal}
            selectedDashboardBreakdown={selectedDashboardBreakdown}
            loadDashboardData={loadDashboardData}
            loadDashboardCategoryTransactions={loadDashboardCategoryTransactions}
            handleDashboardCategorySelect={handleDashboardCategorySelect}
            setActiveView={setActiveView}
            formatCurrency={formatCurrency}
            formatCompactCurrency={formatCompactCurrency}
            truncatePurpose={truncatePurpose}
            formatNetTooltip={formatNetTooltip}
            renderDashboardCategoryClickLayer={renderDashboardCategoryClickLayer}
          />
        )}
        {activeView === 'budget' && (
          <BudgetView
            categoriesAll={categoriesAll}
            pushToast={pushToast}
            categorizationVersion={categorizationVersion}
            accountIds={selectedAccountIds}
            loadTransactions={loadTransactions}
            loadDashboardData={loadDashboardData}
            loadUncategorized={loadUncategorized}
            loadCategorized={loadCategorized}
          />
        )}
        {activeView === 'transactions' && (
          <TransactionsView
            transactions={transactions}
            transactionsTotal={transactionsTotal}
            transactionSearch={transactionSearch}
            setTransactionSearch={setTransactionSearch}
            page={page}
            setPage={setPage}
            pageSizeTransactions={pageSizeTransactions}
            loadingTransactions={loadingTransactions}
            loadTransactions={loadTransactions}
            setImportModalOpen={setImportModalOpen}
            transactionColumns={transactionColumns}
          />
        )}
        {activeView === 'categorization' && (
          <CategorizationView
            categorizationTab={categorizationTab}
            setCategorizationTab={setCategorizationTab}
            uncategorized={uncategorized}
            uncategorizedTotal={uncategorizedTotal}
            uncategorizedPage={uncategorizedPage}
            setUncategorizedPage={setUncategorizedPage}
            pageSizeUncategorized={pageSizeUncategorized}
            categorized={categorized}
            categorizedTotal={categorizedTotal}
            categorizedPage={categorizedPage}
            setCategorizedPage={setCategorizedPage}
            pageSizeCategorized={pageSizeCategorized}
            categorizedFilter={categorizedFilter}
            setCategorizedFilter={setCategorizedFilter}
            categoryFilterOptions={categoryFilterOptions}
            rulesStatus={rulesStatus}
            aiStatus={aiStatus}
            aiSuggestLoading={aiSuggestLoading}
            applyRules={applyRules}
            createQuickRulesForAll={createQuickRulesForAll}
            suggestWithAi={suggestWithAi}
            loadUncategorized={loadUncategorized}
            loadCategorized={loadCategorized}
            uncategorizedColumns={uncategorizedColumns}
            categorizedColumns={categorizedColumns}
          />
        )}
        {activeView === 'categories' && (
          <CategoriesView
            categories={categories}
            categoriesTotal={categoriesTotal}
            categorySearch={categorySearch}
            setCategorySearch={setCategorySearch}
            categoriesPage={categoriesPage}
            setCategoriesPage={setCategoriesPage}
            pageSizeCategories={pageSizeCategories}
            categoryStatus={categoryStatus}
            categoryEdits={categoryEdits}
            setCategoryEdits={setCategoryEdits}
            saveCategory={saveCategory}
            deleteCategoryRow={deleteCategoryRow}
            loadCategories={loadCategories}
            setNewCategoryModalOpen={setNewCategoryModalOpen}
            categoryColumns={categoryColumns}
          />
        )}
        {activeView === 'rules' && (
          <RulesView
            rules={rules}
            rulesTotal={rulesTotal}
            ruleSearch={ruleSearch}
            setRuleSearch={setRuleSearch}
            rulesPage={rulesPage}
            setRulesPage={setRulesPage}
            pageSizeRules={pageSizeRules}
            ruleEdits={ruleEdits}
            setRuleEdits={setRuleEdits}
            activeCategories={activeCategories}
            tagOptions={tagOptions}
            updateRule={updateRule}
            removeRule={removeRule}
            loadRules={loadRules}
            setNewRuleModalOpen={setNewRuleModalOpen}
            rulesColumns={rulesColumns}
          />
        )}
        {activeView === 'tags' && (
          <TagsView
            tags={tags}
            tagsTotal={tagsTotal}
            tagSearch={tagSearch}
            setTagSearch={setTagSearch}
            tagsPage={tagsPage}
            setTagsPage={setTagsPage}
            pageSizeTags={pageSizeTags}
            tagStatus={tagStatus}
            tagEdits={tagEdits}
            setTagEdits={setTagEdits}
            saveTagRow={saveTagRow}
            deleteTagRow={deleteTagRow}
            loadTags={loadTags}
            setNewTagModalOpen={setNewTagModalOpen}
            tagColumns={tagColumns}
          />
        )}
        {activeView === 'accounts' && (
          <AccountsView
            accounts={accounts}
            accountEdits={accountEdits}
            setAccountEdits={setAccountEdits}
            saveAccount={saveAccount}
            deleteAccountRow={deleteAccountRow}
            loadAccounts={loadAccounts}
            accountColumns={accountColumns}
          />
        )}
        {activeView === 'ai' && (
          <AiSettingsView
            aiKeyStatus={aiKeyStatus}
            aiSettings={aiSettings}
            setAiSettings={setAiSettings}
            aiRequests={aiRequests}
            aiRequestsTotal={aiRequestsTotal}
            aiRequestsPage={aiRequestsPage}
            setAiRequestsPage={setAiRequestsPage}
            pageSizeAiRequests={pageSizeAiRequests}
            loadAiRequests={loadAiRequests}
            loadAiSettings={loadAiSettings}
            clearAndReset={clearAndReset}
            clearTransactions={clearTransactions}
          />
        )}
        {activeView === 'docs' && <DocsView />}
      {ruleDraft && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Create Rule</h3>
              <button onClick={() => setRuleDraft(null)}>Close</button>
            </div>
            <div className="modal-body">
              <label>
                Field
                <select
                  value={ruleDraft.matcherType}
                  onChange={(event) =>
                    setRuleDraft({
                      ...ruleDraft,
                      matcherType: event.target.value as RuleDraft['matcherType'],
                    })
                  }
                >
                  <option value="payee">Payee</option>
                  <option value="purpose">Purpose</option>
                  <option value="iban">IBAN</option>
                  <option value="method">Method</option>
                  <option value="bic">BIC</option>
                  <option value="amount">Amount</option>
                  <option value="direction">Direction</option>
                </select>
              </label>
              <label>
                Match
                <select
                  value={ruleDraft.matcherOperator}
                  onChange={(event) =>
                    setRuleDraft({
                      ...ruleDraft,
                      matcherOperator: event.target.value as RuleDraft['matcherOperator'],
                    })
                  }
                >
                  <option value="contains">Contains</option>
                  <option value="equals">Equals</option>
                </select>
              </label>
              <label>
                Value
                <input
                  type="text"
                  value={ruleDraft.matcherValue}
                  onChange={(event) =>
                    setRuleDraft({ ...ruleDraft, matcherValue: event.target.value })
                  }
                />
              </label>
              <label>
                Category
                <select
                  value={ruleDraft.categoryId}
                  onChange={(event) =>
                    setRuleDraft({
                      ...ruleDraft,
                      categoryId: Number(event.target.value),
                    })
                  }
                >
                  {activeCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tags
                <CreatableSelect
                  className="multi-select"
                  classNamePrefix="rs"
                  isMulti
                  isSearchable
                  options={tagOptions}
                  value={tagOptions.filter((option) => ruleDraft.tagIds.includes(option.value))}
                  onChange={(values) =>
                    setRuleDraft({
                      ...ruleDraft,
                      tagIds: values.map((option) => option.value),
                    })
                  }
                  onCreateOption={createTagForRuleDraft}
                  placeholder="Select or create tags..."
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={multiSelectStyles}
                />
              </label>
              <label>
                Priority
                <input
                  type="number"
                  value={ruleDraft.priority}
                  min={0}
                  onChange={(event) =>
                    setRuleDraft({
                      ...ruleDraft,
                      priority: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={ruleDraft.isActive === 1}
                  onChange={(event) =>
                    setRuleDraft({
                      ...ruleDraft,
                      isActive: event.target.checked ? 1 : 0,
                    })
                  }
                />
                <span>{ruleDraft.isActive === 1 ? 'Active' : 'Inactive'}</span>
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setRuleDraft(null)}>Cancel</button>
              <button onClick={saveRuleDraft}>Save Rule</button>
            </div>
          </div>
        </div>
      )}
      {rulesStatusModal && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Rules</h3>
              <button onClick={() => setRulesStatusModal(null)}>Close</button>
            </div>
            <div className="modal-body">
              <p>{rulesStatusModal}</p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setRulesStatusModal(null)}>OK</button>
            </div>
          </div>
        </div>
      )}
      {newRuleModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Add Rule</h3>
              <button onClick={() => setNewRuleModalOpen(false)}>Close</button>
            </div>
            <div className="modal-body">
              <label>
                Field
                <select
                  value={newRule.matcherType}
                  onChange={(event) =>
                    setNewRule({
                      ...newRule,
                      matcherType: event.target.value as RuleDraft['matcherType'],
                    })
                  }
                >
                  <option value="payee">Payee</option>
                  <option value="purpose">Purpose</option>
                  <option value="iban">IBAN</option>
                  <option value="method">Method</option>
                  <option value="bic">BIC</option>
                  <option value="amount">Amount</option>
                  <option value="direction">Direction</option>
                </select>
              </label>
              <label>
                Match
                <select
                  value={newRule.matcherOperator}
                  onChange={(event) =>
                    setNewRule({
                      ...newRule,
                      matcherOperator: event.target.value as RuleDraft['matcherOperator'],
                    })
                  }
                >
                  <option value="contains">Contains</option>
                  <option value="equals">Equals</option>
                </select>
              </label>
              <label>
                Value
                <input
                  type="text"
                  value={newRule.matcherValue}
                  onChange={(event) =>
                    setNewRule({ ...newRule, matcherValue: event.target.value })
                  }
                />
              </label>
              <label>
                Category
                <select
                  value={newRule.categoryId}
                  onChange={(event) =>
                    setNewRule({
                      ...newRule,
                      categoryId: Number(event.target.value),
                    })
                  }
                >
                  <option value={0}>Select category</option>
                  {activeCategories.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Tags
                <Select
                  className="multi-select"
                  classNamePrefix="rs"
                  isMulti
                  isSearchable
                  options={tagOptions}
                  value={tagOptions.filter((option) => newRule.tagIds.includes(option.value))}
                  onChange={(values) =>
                    setNewRule({
                      ...newRule,
                      tagIds: values.map((option) => option.value),
                    })
                  }
                  placeholder="Select tags..."
                  menuPortalTarget={document.body}
                  menuPosition="fixed"
                  styles={{
                    control: (base, state) => ({
                      ...base,
                      backgroundColor: '#ffffff',
                      borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
                      boxShadow: state.isFocused ? '0 0 0 1px #2563eb' : 'none',
                      minHeight: 34,
                    }),
                    menu: (base) => ({
                      ...base,
                      backgroundColor: '#ffffff',
                      border: '1px solid #e5e7eb',
                      color: '#1f2937',
                    }),
                    menuPortal: (base) => ({ ...base, zIndex: 9999 }),
                    option: (base, state) => ({
                      ...base,
                      backgroundColor: state.isSelected
                        ? '#2563eb'
                        : state.isFocused
                        ? '#eef2ff'
                        : '#ffffff',
                      color: state.isSelected ? '#ffffff' : '#1f2937',
                    }),
                    singleValue: (base) => ({ ...base, color: '#1f2937' }),
                    placeholder: (base) => ({ ...base, color: '#6b7280' }),
                    input: (base) => ({ ...base, color: '#1f2937' }),
                    multiValue: (base) => ({
                      ...base,
                      backgroundColor: '#eef2ff',
                      border: '1px solid #2563eb',
                    }),
                    multiValueLabel: (base) => ({ ...base, color: '#1f2937' }),
                    multiValueRemove: (base) => ({ ...base, color: '#2563eb' }),
                  }}
                />
              </label>
              <label>
                Priority
                <input
                  type="number"
                  value={newRule.priority}
                  min={0}
                  onChange={(event) =>
                    setNewRule({
                      ...newRule,
                      priority: Number(event.target.value),
                    })
                  }
                />
              </label>
              <label className="toggle">
                <input
                  type="checkbox"
                  checked={newRule.isActive === 1}
                  onChange={(event) =>
                    setNewRule({
                      ...newRule,
                      isActive: event.target.checked ? 1 : 0,
                    })
                  }
                />
                <span>{newRule.isActive === 1 ? 'Active' : 'Inactive'}</span>
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setNewRuleModalOpen(false)}>Cancel</button>
              <button onClick={createRule}>Create Rule</button>
            </div>
          </div>
        </div>
      )}
      {newCategoryModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Add Category</h3>
              <button onClick={() => setNewCategoryModalOpen(false)}>
                Close
              </button>
            </div>
            <div className="modal-body">
              <label>
                Name
                <input
                  type="text"
                  placeholder="Category name"
                  value={newCategoryName}
                  onChange={(event) => setNewCategoryName(event.target.value)}
                />
              </label>
              <label>
                Color
                <input
                  type="color"
                  value={newCategoryColor}
                  onChange={(event) => setNewCategoryColor(event.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setNewCategoryModalOpen(false)}>
                Cancel
              </button>
              <button onClick={createCategory}>Create</button>
            </div>
          </div>
        </div>
      )}
      {newTagModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Add Tag</h3>
              <button onClick={() => setNewTagModalOpen(false)}>Close</button>
            </div>
            <div className="modal-body">
              <label>
                Name
                <input
                  type="text"
                  placeholder="Tag name"
                  value={newTagName}
                  onChange={(event) => setNewTagName(event.target.value)}
                />
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setNewTagModalOpen(false)}>Cancel</button>
              <button onClick={createTag}>Create</button>
            </div>
          </div>
        </div>
      )}
      {importModalOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Import Transactions</h3>
              <button onClick={closeImportModal}>Close</button>
            </div>
            <div className="modal-body">
              <label>
                Provider
                <select
                  value={importProvider}
                  onChange={(event) =>
                    setImportProvider(
                      event.target.value as 'dkb' | 'ing' | 'sparkasse' | 'volksbank'
                    )
                  }
                >
                  <option value="dkb">DKB</option>
                  <option value="ing">ING</option>
                  <option value="sparkasse">Sparkasse</option>
                  <option value="volksbank">Volksbank</option>
                </select>
              </label>
              <div className="actions">
                <button onClick={() => pickFile(importProvider)}>
                  Pick CSV
                </button>
                <button onClick={runImport} disabled={!filePath}>
                  Import
                </button>
              </div>
              <div className="status">
                <strong>Status:</strong> {status}
                {filePath && (
                  <span className="muted">
                    {' '}
                    (provider: {importProvider.toUpperCase()})
                  </span>
                )}
              </div>
              <div className="path">
                <strong>File:</strong> {filePath ?? 'None'}
              </div>
              {warnings.length > 0 && (
                <div className="warnings">
                  <strong>Warnings:</strong>
                  <ul>
                    {warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
            <div className="modal-actions">
              <button onClick={closeImportModal}>Done</button>
            </div>
          </div>
        </div>
      )}
      {confirmDialog && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Confirm</h3>
              <button onClick={() => setConfirmDialog(null)}>Close</button>
            </div>
            <div className="modal-body">
              <p>{confirmDialog.message}</p>
            </div>
            <div className="modal-actions">
              <button onClick={() => setConfirmDialog(null)}>Cancel</button>
              <button onClick={confirmDialog.onConfirm}>Delete</button>
            </div>
          </div>
        </div>
      )}
      </div>

      <datalist id="tag-suggestions">
        {allTags.map((tag) => (
          <option key={tag.id} value={tag.name} />
        ))}
      </datalist>

      {/* Floating chat */}
      <div className="chat-float-container">
        {chatOpen && (
          <div className="chat-float-panel">
            <div className="chat-float-header">
              <span>AI Assistant</span>
              <button className="chat-float-close" onClick={() => setChatOpen(false)}>✕</button>
            </div>
            <ChatView
              activeView={activeView}
              onDataChanged={() => {
                loadTransactions()
                loadUncategorized()
                loadCategorized()
                loadCategories()
                loadCategoriesAll()
                loadRules()
                loadAllTags()
                loadDashboardMonths()
                loadDashboardData()
                setCategorizationVersion((v) => v + 1)
              }}
            />
          </div>
        )}
        <button
          className={`chat-float-btn ${chatOpen ? 'chat-float-btn-open' : ''}`}
          onClick={() => setChatOpen((v) => !v)}
          title="AI Assistant"
        >
          {chatOpen ? '✕' : '✦'}
        </button>
      </div>
    </div>
  )
}

export default App














