import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Select from 'react-select'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Customized,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import './App.css'
import { DataTable } from './components/DataTable'

type TransactionRow = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
  categoryCount: number
}

type RuleRow = {
  id: number
  matcherType: string
  matcherOperator: string
  matcherValue: string
  categoryId: number
  priority: number
  isActive: number
}

type CategoryRow = {
  id: number
  name: string
  color: string | null
  isActive: number
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
}

type CategoryOption = {
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

type RuleTableMeta = {
  ruleEdits: Record<
    number,
    {
      matcherType: string
      matcherOperator: string
      matcherValue: string
      categoryId: number
      priority: number
      isActive: number
    }
  >
  setRuleEdits: React.Dispatch<
    React.SetStateAction<
      Record<
        number,
        {
          matcherType: string
          matcherOperator: string
          matcherValue: string
          categoryId: number
          priority: number
          isActive: number
        }
      >
    >
  >
  activeCategories: CategoryRow[]
  saveRule: (id: number) => void
  deleteRule: (id: number) => void
}

function App() {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [importProvider, setImportProvider] = useState<'dkb' | 'ing'>('dkb')
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
  const [activeView, setActiveView] = useState<
    'dashboard' | 'transactions' | 'categories' | 'categorization' | 'rules' | 'ai'
  >('dashboard')
  const [categorizationTab, setCategorizationTab] = useState<
    'uncategorized' | 'categorized'
  >('uncategorized')
  const [page, setPage] = useState(0)
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
  const [categorizedFilter, setCategorizedFilter] = useState<number[]>([])
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
  const [aiStatus, setAiStatus] = useState<string>('')
  const [aiSettings, setAiSettings] = useState<{
    model: string
    enabled: number
    confidenceThreshold: number
    inputCostPer1M: number | null
    outputCostPer1M: number | null
  } | null>(null)
  const [aiKeyPresent, setAiKeyPresent] = useState<boolean | null>(null)
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
  const [rules, setRules] = useState<
    Array<{
      id: number
      matcherType: string
      matcherOperator: string
      matcherValue: string
      categoryId: number
      priority: number
      isActive: number
    }>
  >([])
  const [rulesTotal, setRulesTotal] = useState(0)
  const [ruleSearch, setRuleSearch] = useState('')
  const [ruleEdits, setRuleEdits] = useState<
    Record<
      number,
      {
        matcherType: string
        matcherOperator: string
        matcherValue: string
        categoryId: number
        priority: number
        isActive: number
      }
    >
  >({})
  const [newRule, setNewRule] = useState({
    matcherType: 'payee' as RuleDraft['matcherType'],
    matcherOperator: 'contains' as RuleDraft['matcherOperator'],
    matcherValue: '',
    categoryId: 0,
    priority: 100,
    isActive: 1,
  })
  const [dashboardMonths, setDashboardMonths] = useState<string[]>([])
  const [dashboardMonth, setDashboardMonth] = useState<string>('')
  const [dashboardRange, setDashboardRange] = useState<
    'month' | 'last1' | 'last3' | 'last6'
  >('month')
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
  const dashboardNetCategories = useMemo(() => {
    const mapped = dashboardCategories
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
  }, [dashboardCategories])

  const selectedDashboardCategory = useMemo(
    () =>
      dashboardNetCategories.find(
        (row) => row.categoryId === dashboardCategorySelectionId
      ),
    [dashboardNetCategories, dashboardCategorySelectionId]
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

  const transactionColumns = useMemo<ColumnDef<TransactionRow>[]>(
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
    ],
    []
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
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="rule-actions">
            <button
              className="rule-action"
              onClick={() => assignCategory(row.original.id)}
              disabled={(selection[row.original.id] ?? []).length === 0}
            >
              <span className="rule-icon rule-icon-add" aria-hidden="true" />
              <span className="rule-action-text">
                <strong>Add</strong>
                <span className="rule-action-sub">Category</span>
              </span>
            </button>
            <span className="rule-action-separator" aria-hidden="true" />
            <button
              className="rule-action rule-action-remove"
              onClick={() => deleteTransactionRow(row.original.id)}
            >
              <span className="rule-icon rule-icon-remove" aria-hidden="true" />
              <span className="rule-action-text">
                <strong>Delete</strong>
                <span className="rule-action-sub">Transaction</span>
              </span>
            </button>
            <span className="rule-action-separator" aria-hidden="true" />
            <button
              className="rule-action rule-action-quick"
              onClick={() => createRuleFromPayee(row.original)}
              disabled={(selection[row.original.id] ?? []).length === 0}
            >
              <span className="rule-icon rule-icon-quick" aria-hidden="true" />
              <span className="rule-action-text">
                <strong>Quick rule</strong>
                <span className="rule-action-sub">From payee</span>
              </span>
            </button>
            <button
              className="rule-action rule-action-custom"
              onClick={() => openRuleDraft(row.original)}
              disabled={categoryOptions.length === 0}
            >
              <span className="rule-icon rule-icon-custom" aria-hidden="true" />
              <span className="rule-action-text">
                <strong>Custom rule</strong>
                <span className="rule-action-sub">Pick field</span>
              </span>
            </button>
          </div>
        ),
      },
      {
        id: 'ai',
        header: 'AI Suggestion',
        cell: ({ row }) => {
          const suggestion = aiSuggestions[row.original.id]
          if (!suggestion) {
            return <span className="muted">-</span>
          }
          const category = activeCategories.find(
            (cat) => cat.id === suggestion.categoryId
          )
          return (
            <div className="ai-suggestion">
              <div>
                {category?.name ?? 'Unknown'} ({suggestion.confidence.toFixed(2)})
              </div>
              {suggestion.reason && (
                <div className="muted">{suggestion.reason}</div>
              )}
              <button onClick={() => applyAiSuggestion(row.original.id)}>
                Apply
              </button>
            </div>
          )
        },
      },
    ],
    [categoryOptions, selection, aiSuggestions]
  )

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
    []
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
              >
                <span className="rule-icon rule-icon-save" aria-hidden="true" />
                <span className="rule-action-text">
                  <strong>Save</strong>
                </span>
              </button>
              <button
                className="rule-action rule-action-remove"
                onClick={() => meta.deleteCategoryRow(row.original.id)}
              >
                <span className="rule-icon rule-icon-remove" aria-hidden="true" />
                <span className="rule-action-text">
                  <strong>Delete</strong>
                </span>
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
              draft.isActive !== row.original.isActive)
          return (
            <div className="rule-actions">
              <button
                className="rule-action"
                onClick={() => meta.saveRule(row.original.id)}
                disabled={!hasChanges}
              >
                <span className="rule-icon rule-icon-save" aria-hidden="true" />
                <span className="rule-action-text">
                  <strong>Save</strong>
                </span>
              </button>
              <button
                className="rule-action rule-action-remove"
                onClick={() => meta.deleteRule(row.original.id)}
              >
                <span className="rule-icon rule-icon-remove" aria-hidden="true" />
                <span className="rule-action-text">
                  <strong>Delete</strong>
                </span>
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
    })
    setTransactions(result.rows)
    setTransactionsTotal(result.total)
    setLoadingTransactions(false)
  }

  const loadUncategorized = async () => {
    const result = await window.api.transactions.listUncategorized({
      limit: pageSizeUncategorized,
      offset: uncategorizedPage * pageSizeUncategorized,
    })
    setUncategorized(result.rows)
    setUncategorizedTotal(result.total)
  }

  const loadCategorized = async () => {
    const result = await window.api.transactions.listCategorized({
      limit: pageSizeCategorized,
      offset: categorizedPage * pageSizeCategorized,
      categoryIds: categorizedFilter.length > 0 ? categorizedFilter : undefined,
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
      return
    }

    const suggestions = await window.api.ai.suggestions({
      transactionIds: ids,
    })
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
    })
    setAiKeyPresent(keyStatus.present)
    const requests = await window.api.ai.listRequests({ limit: 50 })
    setAiRequests(requests)
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
    if (dashboardRange === 'month') {
      if (!dashboardMonth) {
        return
      }
      const [summary, categories] = await Promise.all([
        window.api.dashboard.summary({ month: dashboardMonth }),
        window.api.dashboard.categories({ month: dashboardMonth }),
      ])
      setDashboardSummary(summary)
      setDashboardCategories(categories)
      return
    }

    const bounds = getRangeBounds(dashboardRange)
    if (!bounds) {
      return
    }

    const [summary, categories] = await Promise.all([
      window.api.dashboard.summaryRange({
        startMonth: bounds.startMonth,
        endMonth: bounds.endMonth,
      }),
      window.api.dashboard.categoriesRange({
        startMonth: bounds.startMonth,
        endMonth: bounds.endMonth,
      }),
    ])
    setDashboardSummary(summary)
    setDashboardCategories(categories)
  }

  const loadDashboardCategoryTransactions = async () => {
    if (!dashboardCategorySelectionId) {
      setDashboardCategoryTransactions([])
      setDashboardCategoryTransactionsTotal(0)
      return
    }

    const result = await window.api.transactions.listCategorized({
      limit: pageSizeDashboardTransactions,
      offset: dashboardCategoryPage * pageSizeDashboardTransactions,
      categoryIds: [dashboardCategorySelectionId],
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
        {data.map((entry: { categoryId?: number; categoryName?: string }, index: number) => {
          if (!entry?.categoryName || !entry?.categoryId) {
            return null
          }
          const x = xAxis.scale(entry.categoryName)
          if (x == null) {
            return null
          }
          return (
            <rect
              key={`${entry.categoryId}-${index}`}
              x={x}
              y={offset.top}
              width={bandWidth}
              height={offset.height}
              fill="transparent"
              pointerEvents="all"
              style={{ cursor: 'pointer' }}
              onClick={() => handleDashboardCategorySelect(entry.categoryId as number)}
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
    loadAiSettings()
    loadDashboardMonths()
  }, [])

  useEffect(() => {
    if (dashboardRange === 'month' && dashboardMonth) {
      loadDashboardData()
    }
  }, [dashboardMonth, dashboardRange])

  useEffect(() => {
    if (dashboardRange !== 'month') {
      loadDashboardData()
    }
  }, [dashboardRange, dashboardMonths])

  useEffect(() => {
    if (dashboardNetCategories.length === 0) {
      setDashboardCategorySelectionId(null)
      return
    }
    setDashboardCategorySelectionId((current) => {
      if (
        current &&
        dashboardNetCategories.some((row) => row.categoryId === current)
      ) {
        return current
      }
      return dashboardNetCategories[0].categoryId
    })
    setDashboardCategoryPage(0)
  }, [dashboardNetCategories])

  useEffect(() => {
    loadDashboardCategoryTransactions()
  }, [
    dashboardCategorySelectionId,
    dashboardCategoryPage,
    pageSizeDashboardTransactions,
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
  }, [page, pageSizeTransactions, transactionSearch])

  useEffect(() => {
    loadUncategorized()
  }, [uncategorizedPage, pageSizeUncategorized])

  useEffect(() => {
    loadCategorized()
  }, [categorizedPage, pageSizeCategorized, categorizedFilter])

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

  const pickFile = async (provider: 'dkb' | 'ing') => {
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

  const assignCategory = async (transactionId: number) => {
    const categoryIds = selection[transactionId] ?? []
    if (categoryIds.length === 0) {
      return
    }

    await Promise.all(
      categoryIds.map((categoryId) =>
        window.api.transactions.addCategory({ transactionId, categoryId })
      )
    )
    setSelection((current) => {
      const next = { ...current }
      delete next[transactionId]
      return next
    })
    loadUncategorized()
    loadCategorized()
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
    })
  }

  const createRuleFromPayee = async (tx: TransactionRow) => {
    const defaultCategory = (selection[tx.id] ?? [])[0]
    if (!defaultCategory) {
      return
    }
    const matcherValue = tx.payee ?? tx.purpose ?? ''
    if (!matcherValue.trim()) {
      setRulesStatusModal('No payee available for this transaction.')
      pushToast('No payee available for this transaction.', 'error')
      return
    }

    await window.api.rules.create({
      matcherType: 'payee',
      matcherOperator: 'contains',
      matcherValue: matcherValue.trim(),
      categoryId: defaultCategory,
      priority: 100,
      isActive: 1,
    })
    await applyRules()
    setRulesStatusModal('Rule created from payee and applied.')
    pushToast('Rule created and applied.', 'success')
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
    })

    setRuleDraft(null)
    await applyRules()
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
    setAiStatus('Requesting AI suggestions...')
    const result = await window.api.ai.suggest({
      transactions: uncategorized.map((tx) => ({
        id: tx.id,
        bookingDate: tx.bookingDate,
        amount: tx.amount,
        currency: tx.currency,
        payee: tx.payee,
        purpose: tx.purpose,
      })),
      categories: activeCategories.map((cat) => ({
        id: cat.id,
        name: cat.name,
      })),
    })

    if (result.error) {
      setAiStatus(result.error)
      pushToast(result.error, 'error')
      return
    }

    setAiStatus(`AI suggested ${result.applied} transactions.`)
    pushToast(`AI suggested ${result.applied} transactions.`, 'info')
    loadAiSuggestions(uncategorized.map((tx) => tx.id))
  }

  const applyAiSuggestion = async (transactionId: number) => {
    const suggestion = aiSuggestions[transactionId]
    if (!suggestion) {
      return
    }
    await window.api.transactions.addCategory({
      transactionId,
      categoryId: suggestion.categoryId,
    })
    loadUncategorized()
    loadCategorized()
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
    })

    setNewRule({
      matcherType: newRule.matcherType,
      matcherOperator: newRule.matcherOperator,
      matcherValue: '',
      categoryId: newRule.categoryId,
      priority: newRule.priority,
      isActive: newRule.isActive,
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
          <img className="brand-logo" src="/horus-logo-v2.svg" alt="Horus logo" />
        </div>
        <nav className="nav">
          <button
            className={activeView === 'dashboard' ? 'active' : ''}
            onClick={() => setActiveView('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={activeView === 'categorization' ? 'active' : ''}
            onClick={() => setActiveView('categorization')}
          >
            Categorization
          </button>
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
            className={activeView === 'transactions' ? 'active' : ''}
            onClick={() => setActiveView('transactions')}
          >
            Transactions
          </button>
          <button
            className={activeView === 'ai' ? 'active' : ''}
            onClick={() => setActiveView('ai')}
          >
            AI Settings
          </button>
        </nav>
      </aside>
      <div className="app">
        {activeView === 'dashboard' && (
          <div className="card dashboard">
            <div className="card-header">
              <h2>Dashboard</h2>
              <div className="actions">
                <label className="picker">
                  Month
                  <select
                    value={dashboardMonth}
                    onChange={(event) => setDashboardMonth(event.target.value)}
                    disabled={dashboardRange !== 'month'}
                  >
                    {dashboardMonths.length === 0 && (
                      <option value="">No data</option>
                    )}
                    {dashboardMonths.map((month) => (
                      <option key={month} value={month}>
                        {month}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="picker">
                  Range
                  <select
                    value={dashboardRange}
                    onChange={(event) =>
                      setDashboardRange(
                        event.target.value as
                          | 'month'
                          | 'last1'
                          | 'last3'
                          | 'last6'
                      )
                    }
                  >
                    <option value="month">Selected month</option>
                    <option value="last1">Last month</option>
                    <option value="last3">Last 3 months</option>
                    <option value="last6">Last 6 months</option>
                  </select>
                </label>
                <button onClick={() => loadDashboardData()}>
                  Refresh
                </button>
              </div>
            </div>
            {dashboardSummary ? (
              <div className="dashboard-grid">
                <div className="summary-grid">
                  <div className="summary-card">
                    <span className="label">Total spend</span>
                    <strong>{formatCurrency(dashboardSummary.totalSpend)}</strong>
                  </div>
                  <div className="summary-card">
                    <span className="label">Total income</span>
                    <strong>{formatCurrency(dashboardSummary.totalIncome)}</strong>
                  </div>
                  <div className="summary-card">
                    <span className="label">Net</span>
                    <strong>{formatCurrency(dashboardSummary.net)}</strong>
                  </div>
                  <div className="summary-card">
                    <span className="label">Categorized</span>
                    <strong>
                      {dashboardSummary.transactionCount > 0
                        ? `${Math.round(
                            (dashboardSummary.categorizedCount /
                              dashboardSummary.transactionCount) *
                              100
                          )}%`
                        : '0%'}
                    </strong>
                    <span className="muted">
                      {dashboardSummary.uncategorizedCount} uncategorized
                    </span>
                    <button
                      className="inline-action"
                      onClick={() => setActiveView('categorization')}
                    >
                      Go to Categorization
                    </button>
                  </div>
                </div>
                <div className="chart-card">
                  <div className="card-header">
                    <h3>NET SPENDING BY CATEGORY</h3>
                  </div>
                  {dashboardNetCategories.length === 0 ? (
                    <div className="muted">No negative net categories.</div>
                  ) : (
                    <div className="chart-scroll">
                      <div
                        className="chart"
                        style={{
                          width: Math.max(
                            520,
                            dashboardNetCategories.length * 120
                          ),
                        }}
                      >
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart
                            data={dashboardNetCategories}
                            onClick={(state) => {
                              const label = (state as { activeLabel?: string })?.activeLabel
                              if (!label) {
                                return
                              }
                              const match = dashboardNetCategories.find(
                                (row) => row.categoryName === label
                              )
                              if (match) {
                                handleDashboardCategorySelect(match.categoryId)
                              }
                            }}
                          >
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="categoryName"
                              interval={0}
                              angle={0}
                              textAnchor="middle"
                              height={40}
                              tick={(props: any) => {
                                const value = String(props.payload?.value ?? '')
                                const label =
                                  value.length > 12 ? `${value.slice(0, 12)}...` : value
                                const match = dashboardNetCategories.find(
                                  (row) => row.categoryName === value
                                )
                                return (
                                  <g
                                    transform={`translate(${props.x},${props.y})`}
                                    onClick={() => {
                                      if (match) {
                                        handleDashboardCategorySelect(match.categoryId)
                                      }
                                    }}
                                    style={{ cursor: match ? 'pointer' : 'default' }}
                                  >
                                    <text
                                      x={0}
                                      y={0}
                                      dy={16}
                                      textAnchor="middle"
                                      fill="#6b7280"
                                    >
                                      {label}
                                    </text>
                                  </g>
                                )
                              }}
                            />
                            <YAxis
                              tickFormatter={(value: number) =>
                                formatCompactCurrency(value)
                              }
                            />
                            <Tooltip
                              formatter={(value, _name, item) => {
                                const normalized = Array.isArray(value)
                                  ? value[0] ?? ''
                                  : value ?? ''
                                return formatNetTooltip(
                                  normalized,
                                  String(_name ?? ''),
                                  item as { payload?: { net?: number } }
                                )
                              }}
                            />
                            <Bar
                              dataKey="netAbs"
                              name="Net (abs)"
                              fill="#f59e0b"
                              onClick={(data) => {
                                const payload = (data as { categoryId?: number }) ?? {}
                                if (payload.categoryId) {
                                  handleDashboardCategorySelect(payload.categoryId)
                                }
                              }}
                            >
                              {dashboardNetCategories.map((entry) => (
                                <Cell
                                  key={`net-${entry.categoryId}`}
                                  fill={entry.categoryColor ?? '#f59e0b'}
                                />
                              ))}
                            </Bar>
                            <Customized component={renderDashboardCategoryClickLayer} />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </div>
                <div className="chart-card">
                  <div className="card-header">
                    <h3>
                      TRANSACTIONS:
                      {selectedDashboardCategory
                        ? ` ${selectedDashboardCategory.categoryName}`
                        : ''}
                    </h3>
                    <div className="actions">
                      <label className="picker">
                        Category
                        <select
                          value={dashboardCategorySelectionId ?? ''}
                          onChange={(event) => {
                            const value = Number(event.target.value)
                            setDashboardCategorySelectionId(
                              Number.isNaN(value) ? null : value
                            )
                            setDashboardCategoryPage(0)
                          }}
                          disabled={dashboardNetCategories.length === 0}
                        >
                          {dashboardNetCategories.length === 0 && (
                            <option value="">No categories</option>
                          )}
                          {dashboardNetCategories.map((row) => (
                            <option key={row.categoryId} value={row.categoryId}>
                              {row.categoryName}
                            </option>
                          ))}
                        </select>
                      </label>
                      <button
                        onClick={() => loadDashboardCategoryTransactions()}
                        disabled={!dashboardCategorySelectionId}
                      >
                        Refresh
                      </button>
                      <button
                        onClick={() => setDashboardCategoryPage(0)}
                        disabled={dashboardCategoryPage === 0}
                      >
                        First
                      </button>
                      <button
                        onClick={() =>
                          setDashboardCategoryPage((p) => Math.max(0, p - 1))
                        }
                        disabled={dashboardCategoryPage === 0}
                      >
                        Prev
                      </button>
                      <span className="page-indicator">
                        Page{' '}
                        {dashboardCategoryTransactionsTotal === 0
                          ? 0
                          : dashboardCategoryPage + 1}
                      </span>
                      <button
                        onClick={() => setDashboardCategoryPage((p) => p + 1)}
                        disabled={
                          dashboardCategoryTransactionsTotal === 0 ||
                          (dashboardCategoryPage + 1) *
                            pageSizeDashboardTransactions >=
                            dashboardCategoryTransactionsTotal
                        }
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  {!dashboardCategorySelectionId ? (
                    <div className="muted">
                      Select a category in the chart to see transactions.
                    </div>
                  ) : dashboardCategoryTransactionsTotal === 0 ? (
                    <div className="muted">No transactions for this category.</div>
                  ) : (
                    <div className="data-table dashboard-transactions">
                      <table>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Payee</th>
                            <th>Purpose</th>
                            <th>Amount</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dashboardCategoryTransactions.map((row) => (
                            <tr key={row.id}>
                              <td>{row.bookingDate}</td>
                              <td>{row.payee ?? '-'}</td>
                              <td className="purpose">{truncatePurpose(row.purpose, 100)}</td>
                              <td className="amount">
                                {row.amount.toFixed(2)} {row.currency}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="data-table-footer">
                        Total: {dashboardCategoryTransactionsTotal}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="muted">No data yet.</div>
            )}
          </div>
        )}
        {activeView === 'transactions' && (
          <>
            <div className="card">
              <div className="card-header">
                <h2>Transactions</h2>
                <div className="actions">
                  <input
                    type="text"
                    placeholder="Search payee or purpose..."
                    value={transactionSearch}
                    onChange={(event) => setTransactionSearch(event.target.value)}
                  />
                  <button onClick={() => setImportModalOpen(true)}>
                    Import Transactions
                  </button>
                  <button onClick={() => setPage(0)} disabled={page === 0}>
                    First
                  </button>
                  <button
                    onClick={() => setPage((p) => Math.max(0, p - 1))}
                    disabled={page === 0}
                  >
                    Prev
                  </button>
                  <span className="page-indicator">Page {page + 1}</span>
                  <button
                    onClick={() => setPage((p) => p + 1)}
                    disabled={
                      (page + 1) * pageSizeTransactions >= transactionsTotal
                    }
                  >
                    Next
                  </button>
                  <button onClick={loadTransactions} disabled={loadingTransactions}>
                    {loadingTransactions ? 'Loading...' : 'Refresh'}
                  </button>
                </div>
              </div>
                <DataTable
                  data={transactions}
                  columns={transactionColumns}
                  getRowId={(row) => String(row.id)}
                  totalCount={transactionsTotal}
                  emptyMessage="No transactions yet."
                />
            </div>
          </>
        )}
        {activeView === 'categorization' && (
          <div className="card">
            <div className="card-header">
              <h2>Categorization</h2>
              <div className="actions">
                <button
                  className={categorizationTab === 'uncategorized' ? 'active' : ''}
                  onClick={() => setCategorizationTab('uncategorized')}
                >
                  Uncategorized
                </button>
                <button
                  className={categorizationTab === 'categorized' ? 'active' : ''}
                  onClick={() => setCategorizationTab('categorized')}
                >
                  Categorized
                </button>
              </div>
            </div>
            {categorizationTab === 'uncategorized' && (
              <>
                <div className="card-header subheader">
                  <h3>Uncategorized</h3>
                  <div className="actions">
                    <button onClick={applyRules}>Apply Rules</button>
                    <button onClick={suggestWithAi}>Suggest with AI</button>
                    <button
                      onClick={() => setUncategorizedPage(0)}
                      disabled={uncategorizedPage === 0}
                    >
                      First
                    </button>
                    <button
                      onClick={() => setUncategorizedPage((p) => Math.max(0, p - 1))}
                      disabled={uncategorizedPage === 0}
                    >
                      Prev
                    </button>
                    <span className="page-indicator">Page {uncategorizedPage + 1}</span>
                  <button
                    onClick={() => setUncategorizedPage((p) => p + 1)}
                    disabled={
                      uncategorizedTotal === 0 ||
                      (uncategorizedPage + 1) * pageSizeUncategorized >=
                        uncategorizedTotal
                    }
                  >
                    Next
                  </button>
                    <button onClick={loadUncategorized}>Refresh</button>
                  </div>
                </div>
                {rulesStatus && <div className="status">{rulesStatus}</div>}
                {aiStatus && <div className="status">{aiStatus}</div>}
                <DataTable
                  data={uncategorized}
                  columns={uncategorizedColumns}
                  getRowId={(row) => String(row.id)}
                  totalCount={uncategorizedTotal}
                  emptyMessage="All transactions are categorized."
                />
              </>
            )}
            {categorizationTab === 'categorized' && (
              <>
                <div className="card-header subheader">
                  <h3>Categorized</h3>
                  <div className="actions">
                    <Select
                      className="multi-select category-filter"
                      classNamePrefix="rs"
                      isMulti
                      isSearchable
                      options={categoryFilterOptions}
                      value={categoryFilterOptions.filter((option) =>
                        categorizedFilter.includes(option.value)
                      )}
                      onChange={(values) =>
                        setCategorizedFilter(values.map((option) => option.value))
                      }
                      placeholder="Filter categories..."
                      menuPortalTarget={document.body}
                      menuPosition="fixed"
                      styles={{
                        control: (base, state) => ({
                          ...base,
                          backgroundColor: '#ffffff',
                          borderColor: state.isFocused ? '#2563eb' : '#d1d5db',
                          boxShadow: state.isFocused
                            ? '0 0 0 1px #2563eb'
                            : 'none',
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
                        multiValueLabel: (base) => ({
                          ...base,
                          color: '#1f2937',
                        }),
                        multiValueRemove: (base) => ({
                          ...base,
                          color: '#2563eb',
                        }),
                      }}
                    />
                    <button
                      onClick={() => setCategorizedPage(0)}
                      disabled={categorizedPage === 0}
                    >
                      First
                    </button>
                    <button
                      onClick={() => setCategorizedPage((p) => Math.max(0, p - 1))}
                      disabled={categorizedPage === 0}
                    >
                      Prev
                    </button>
                    <span className="page-indicator">
                      Page {categorizedTotal === 0 ? 0 : categorizedPage + 1}
                    </span>
                    <button
                      onClick={() => setCategorizedPage((p) => p + 1)}
                      disabled={
                        categorizedTotal === 0 ||
                        (categorizedPage + 1) * pageSizeCategorized >=
                          categorizedTotal
                      }
                    >
                      Next
                    </button>
                    <button onClick={loadCategorized}>Refresh</button>
                  </div>
                </div>
                <DataTable
                  data={categorized}
                  columns={categorizedColumns}
                  getRowId={(row) => String(row.id)}
                  totalCount={categorizedTotal}
                  emptyMessage="No categorized transactions yet."
                />
              </>
            )}
          </div>
        )}
        {activeView === 'categories' && (
          <div className="card">
              <div className="card-header">
              <h2>Categories</h2>
              <div className="actions">
                <input
                  type="text"
                  placeholder="Search category..."
                  value={categorySearch}
                  onChange={(event) => setCategorySearch(event.target.value)}
                />
                <button onClick={() => setNewCategoryModalOpen(true)}>
                  Add Category
                </button>
                <button onClick={loadCategories}>Refresh</button>
                <button
                  onClick={() => setCategoriesPage(0)}
                  disabled={categoriesPage === 0}
                >
                  First
                </button>
                <button
                  onClick={() => setCategoriesPage((p) => Math.max(0, p - 1))}
                  disabled={categoriesPage === 0}
                >
                  Prev
                </button>
                <span className="page-indicator">
                  Page {categoriesTotal === 0 ? 0 : categoriesPage + 1}
                </span>
                <button
                  onClick={() => setCategoriesPage((p) => p + 1)}
                  disabled={
                    categoriesTotal === 0 ||
                    (categoriesPage + 1) * pageSizeCategories >= categoriesTotal
                  }
                >
                  Next
                </button>
              </div>
            </div>
            {categoryStatus && <div className="status">{categoryStatus}</div>}
            <DataTable
              data={categories}
              columns={categoryColumns}
              getRowId={(row) => String(row.id)}
              totalCount={categoriesTotal}
              meta={{
                categoryEdits,
                setCategoryEdits,
                saveCategory,
                deleteCategoryRow,
              }}
              emptyMessage="No categories yet."
            />
          </div>
        )}
        {activeView === 'rules' && (
          <div className="card">
            <div className="card-header">
              <h2>Rules</h2>
              <div className="actions">
                <input
                  type="text"
                  placeholder="Search rules..."
                  value={ruleSearch}
                  onChange={(event) => setRuleSearch(event.target.value)}
                />
                <button onClick={() => setNewRuleModalOpen(true)}>Add Rule</button>
                <button onClick={loadRules}>Refresh</button>
                <button
                  onClick={() => setRulesPage(0)}
                  disabled={rulesPage === 0}
                >
                  First
                </button>
                <button
                  onClick={() => setRulesPage((p) => Math.max(0, p - 1))}
                  disabled={rulesPage === 0}
                >
                  Prev
                </button>
                <span className="page-indicator">
                  Page {rulesTotal === 0 ? 0 : rulesPage + 1}
                </span>
                <button
                  onClick={() => setRulesPage((p) => p + 1)}
                  disabled={
                    rulesTotal === 0 ||
                    (rulesPage + 1) * pageSizeRules >= rulesTotal
                  }
                >
                  Next
                </button>
              </div>
            </div>
            <DataTable
              data={rules}
              columns={rulesColumns}
              getRowId={(row) => String(row.id)}
              totalCount={rulesTotal}
              meta={{
                ruleEdits,
                setRuleEdits,
                activeCategories,
                saveRule: updateRule,
                deleteRule: removeRule,
              }}
              emptyMessage="No rules yet."
            />
          </div>
        )}
        {activeView === 'ai' && (
          <div className="card">
            <div className="card-header">
              <h2>AI Settings</h2>
              <button onClick={loadAiSettings}>Refresh</button>
            </div>
            <div className="status">
              <strong>API key:</strong>{' '}
              {aiKeyPresent === null
                ? 'Checking...'
                : aiKeyPresent
                ? 'Present'
                : 'Missing'}
            </div>
            {aiKeyPresent === false && (
              <div className="status warning">
                OPENAI_API_KEY is not set. AI suggestions will not work until
                you set it in your environment.
              </div>
            )}
            {aiSettings && (
              <div className="ai-form">
                <label>
                  Model
                  <input
                    type="text"
                    value={aiSettings.model}
                    onChange={(event) =>
                      setAiSettings({
                        ...aiSettings,
                        model: event.target.value,
                      })
                    }
                  />
                </label>
                <label className="ai-checkbox">
                  Enabled
                  <input
                    type="checkbox"
                    checked={aiSettings.enabled === 1}
                    onChange={(event) =>
                      setAiSettings({
                        ...aiSettings,
                        enabled: event.target.checked ? 1 : 0,
                      })
                    }
                  />
                </label>
                <label>
                  Confidence threshold
                  <input
                    type="number"
                    min={0}
                    max={1}
                    step={0.01}
                    value={aiSettings.confidenceThreshold}
                    onChange={(event) =>
                      setAiSettings({
                        ...aiSettings,
                        confidenceThreshold: Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Input cost ($ per 1M tokens)
                  <input
                    type="number"
                    min={0}
                    step={0.000001}
                    value={aiSettings.inputCostPer1M ?? ''}
                    onChange={(event) =>
                      setAiSettings({
                        ...aiSettings,
                        inputCostPer1M:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  Output cost ($ per 1M tokens)
                  <input
                    type="number"
                    min={0}
                    step={0.000001}
                    value={aiSettings.outputCostPer1M ?? ''}
                    onChange={(event) =>
                      setAiSettings({
                        ...aiSettings,
                        outputCostPer1M:
                          event.target.value === ''
                            ? null
                            : Number(event.target.value),
                      })
                    }
                  />
                </label>
                <button
                  onClick={async () => {
                    const updated = await window.api.ai.updateSettings({
                      model: aiSettings.model,
                      enabled: aiSettings.enabled,
                      confidenceThreshold: aiSettings.confidenceThreshold,
                      inputCostPer1M: aiSettings.inputCostPer1M,
                      outputCostPer1M: aiSettings.outputCostPer1M,
                    })
                    setAiSettings({
                      model: updated.model,
                      enabled: updated.enabled,
                      confidenceThreshold: updated.confidenceThreshold,
                      inputCostPer1M: updated.inputCostPer1M,
                      outputCostPer1M: updated.outputCostPer1M,
                    })
                  }}
                >
                  Save
                </button>
              </div>
            )}
            <div className="ai-requests">
              <h3>AI Requests</h3>
              <div className="data-table">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Status</th>
                      <th>Model</th>
                      <th>Tokens</th>
                      <th>Cost</th>
                      <th>Details</th>
                    </tr>
                  </thead>
                  <tbody>
                    {aiRequests.length === 0 ? (
                      <tr>
                        <td className="empty" colSpan={6}>
                          No AI requests yet.
                        </td>
                      </tr>
                    ) : (
                      aiRequests.map((req) => (
                        <tr key={req.id}>
                          <td>{req.createdAt}</td>
                          <td>{req.status}</td>
                          <td>{req.model ?? '-'}</td>
                          <td>
                            {req.inputTokens != null && req.outputTokens != null
                              ? `${req.inputTokens}/${req.outputTokens}/${req.totalTokens ?? req.inputTokens + req.outputTokens}`
                              : '-'}
                          </td>
                          <td>
                            {req.costUsd != null ? `$${req.costUsd.toFixed(6)}` : '-'}
                          </td>
                          <td>
                            <details>
                              <summary>View</summary>
                              {req.error && (
                                <div className="muted">Error: {req.error}</div>
                              )}
                              {req.requestPayload && (
                                <pre className="payload">
                                  {req.requestPayload}
                                </pre>
                              )}
                              {req.responsePayload && (
                                <pre className="payload">
                                  {req.responsePayload}
                                </pre>
                              )}
                            </details>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}
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
                    setImportProvider(event.target.value as 'dkb' | 'ing')
                  }
                >
                  <option value="dkb">DKB</option>
                  <option value="ing">ING</option>
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
    </div>
  )
}

export default App














