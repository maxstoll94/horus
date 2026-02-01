import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import Select from 'react-select'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
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

type CategorizedTransactionRow = TransactionRow & {
  categoryId: number
  categoryName: string
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
  matcherValue: string
  categoryId: number
  priority: number
  isActive: number
}

type CategoryOption = {
  value: number
  label: string
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

function App() {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Idle')
  const [warnings, setWarnings] = useState<string[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [uncategorized, setUncategorized] = useState<TransactionRow[]>([])
  const [categorized, setCategorized] = useState<CategorizedViewRow[]>([])
  const [categorizedTotal, setCategorizedTotal] = useState(0)
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#4c7cff')
  const [categoryStatus, setCategoryStatus] = useState<string>('')
  const [newCategoryModalOpen, setNewCategoryModalOpen] = useState(false)
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
  const [pageSizeCategories, setPageSizeCategories] = useState(16)
  const [pageSizeRules, setPageSizeRules] = useState(16)
  const [pageSizeDashboardCategories, setPageSizeDashboardCategories] =
    useState(8)
  const [selection, setSelection] = useState<Record<number, number[]>>({})
  const [categorizedFilter, setCategorizedFilter] = useState<number[]>([])
  const [ruleDraft, setRuleDraft] = useState<RuleDraft | null>(null)
  const [rulesStatus, setRulesStatus] = useState<string>('')
  const [rulesStatusModal, setRulesStatusModal] = useState<string | null>(null)
  const [newRuleModalOpen, setNewRuleModalOpen] = useState(false)
  const [ruleMenuOpen, setRuleMenuOpen] = useState<Record<number, boolean>>({})
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
      matcherValue: string
      categoryId: number
      priority: number
      isActive: number
    }>
  >([])
  const [ruleEdits, setRuleEdits] = useState<
    Record<
      number,
      {
        matcherType: string
        matcherValue: string
        categoryId: number
        priority: number
        isActive: number
      }
    >
  >({})
  const [newRule, setNewRule] = useState({
    matcherType: 'payee' as RuleDraft['matcherType'],
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
      transactionCount: number
      categoryColor: string | null
    }>
  >([])
  const [dashboardTrend, setDashboardTrend] = useState<
    Array<{
      month: string
      totalSpend: number
      totalIncome: number
      net: number
    }>
  >([])

  const dashboardSpendCategories = useMemo(
    () => dashboardCategories.filter((row) => row.totalSpend > 0),
    [dashboardCategories]
  )

  const pagedCategories = useMemo(() => {
    const start = categoriesPage * pageSizeCategories
    return categories.slice(start, start + pageSizeCategories)
  }, [categories, categoriesPage, pageSizeCategories])

  const pagedRules = useMemo(() => {
    const start = rulesPage * pageSizeRules
    return rules.slice(start, start + pageSizeRules)
  }, [rules, rulesPage, pageSizeRules])

  const pagedDashboardCategories = useMemo(() => {
    const start = dashboardCategoryPage * pageSizeDashboardCategories
    return dashboardSpendCategories.slice(
      start,
      start + pageSizeDashboardCategories
    )
  }, [
    dashboardSpendCategories,
    dashboardCategoryPage,
    pageSizeDashboardCategories,
  ])

  const activeCategories = useMemo(
    () => categories.filter((cat) => cat.isActive === 1),
    [categories]
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
      categories.map((cat) => ({
        value: cat.id,
        label: cat.name,
      })),
    [categories]
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
          <span className="purpose">{row.original.purpose ?? '-'}</span>
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
          <span className="purpose">{row.original.purpose ?? '-'}</span>
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
                backgroundColor: '#101010',
                borderColor: state.isFocused ? '#2b4cff' : '#2a2a2a',
                boxShadow: state.isFocused ? '0 0 0 1px #2b4cff' : 'none',
                minHeight: 34,
              }),
              menu: (base) => ({
                ...base,
                backgroundColor: '#141414',
                border: '1px solid #2a2a2a',
                color: '#f0f0f0',
              }),
              menuPortal: (base) => ({
                ...base,
                zIndex: 9999,
              }),
              option: (base, state) => ({
                ...base,
                backgroundColor: state.isSelected
                  ? '#2b4cff'
                  : state.isFocused
                  ? '#1f2338'
                  : '#141414',
                color: '#f0f0f0',
              }),
              singleValue: (base) => ({ ...base, color: '#f0f0f0' }),
              placeholder: (base) => ({ ...base, color: '#bdbdbd' }),
              input: (base) => ({ ...base, color: '#f0f0f0' }),
              multiValue: (base) => ({
                ...base,
                backgroundColor: '#1b1f33',
                border: '1px solid #2b4cff',
              }),
              multiValueLabel: (base) => ({ ...base, color: '#e6e9ff' }),
              multiValueRemove: (base) => ({ ...base, color: '#cbd3ff' }),
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
        id: 'add',
        header: '',
        cell: ({ row }) => (
          <button
            onClick={() => assignCategory(row.original.id)}
            disabled={(selection[row.original.id] ?? []).length === 0}
          >
            Add
          </button>
        ),
      },
      {
        id: 'rule',
        header: '',
        cell: ({ row }) => (
          <div className="dropdown">
            <div className="dropdown-split">
              <button
                className="dropdown-main"
                onClick={() => createRuleFromPayee(row.original)}
                disabled={(selection[row.original.id] ?? []).length === 0}
              >
                Create Rule
              </button>
              <button
                className="dropdown-toggle"
                onClick={() =>
                  setRuleMenuOpen((current) => ({
                    ...current,
                    [row.original.id]: !current[row.original.id],
                  }))
                }
                disabled={(selection[row.original.id] ?? []).length === 0}
                aria-label="Open rule options"
              >
                ▾
              </button>
            </div>
            {ruleMenuOpen[row.original.id] && (
              <div className="dropdown-menu">
                <button onClick={() => createRuleFromPayee(row.original)}>
                  Create Rule
                </button>
                <button onClick={() => openRuleDraft(row.original)}>
                  Custom
                </button>
              </div>
            )}
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
          <span className="purpose">{row.original.purpose ?? '-'}</span>
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
                onClick={() => meta.saveCategory(row.original.id)}
                disabled={!hasChanges}
              >
                Save
              </button>
              <button onClick={() => meta.deleteCategoryRow(row.original.id)}>
                Delete
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
        cell: ({ row }) => {
          const draft = ruleEdits[row.original.id] ?? row.original
          return (
            <select
              value={draft.matcherType}
              onChange={(event) =>
                setRuleEdits((current) => ({
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
        header: 'Value',
        accessorKey: 'matcherValue',
        cell: ({ row }) => {
          const draft = ruleEdits[row.original.id] ?? row.original
          return (
            <input
              type="text"
              value={draft.matcherValue}
              onChange={(event) =>
                setRuleEdits((current) => ({
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
        cell: ({ row }) => {
          const draft = ruleEdits[row.original.id] ?? row.original
          return (
            <select
              value={draft.categoryId}
              onChange={(event) =>
                setRuleEdits((current) => ({
                  ...current,
                  [row.original.id]: {
                    ...draft,
                    categoryId: Number(event.target.value),
                  },
                }))
              }
            >
              {activeCategories.map((cat) => (
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
        cell: ({ row }) => {
          const draft = ruleEdits[row.original.id] ?? row.original
          return (
            <input
              type="number"
              value={draft.priority}
              min={0}
              onChange={(event) =>
                setRuleEdits((current) => ({
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
        cell: ({ row }) => {
          const draft = ruleEdits[row.original.id] ?? row.original
          return (
            <label className="toggle">
              <input
                type="checkbox"
                checked={draft.isActive === 1}
                onChange={(event) =>
                  setRuleEdits((current) => ({
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
        cell: ({ row }) => (
          <div className="rule-actions">
            <button onClick={() => updateRule(row.original.id)}>Save</button>
            <button onClick={() => removeRule(row.original.id)}>Delete</button>
          </div>
        ),
      },
    ],
    [activeCategories, ruleEdits]
  )

  const loadTransactions = async () => {
    setLoadingTransactions(true)
    const rows = await window.api.transactions.list({
      limit: pageSizeTransactions,
      offset: page * pageSizeTransactions,
    })
    setTransactions(rows)
    setLoadingTransactions(false)
  }

  const loadUncategorized = async () => {
    const rows = await window.api.transactions.listUncategorized({
      limit: pageSizeUncategorized,
      offset: uncategorizedPage * pageSizeUncategorized,
    })
    setUncategorized(rows)
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
    const rows = await window.api.categories.list()
    setCategories(rows)
    setCategoryEdits({})
  }

  const loadRules = async () => {
    const rows = await window.api.rules.list()
    setRules(rows)
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
      const [summary, categories, trend] = await Promise.all([
        window.api.dashboard.summary({ month: dashboardMonth }),
        window.api.dashboard.categories({ month: dashboardMonth }),
        window.api.dashboard.trend({ months: 6 }),
      ])
      setDashboardSummary(summary)
      setDashboardCategories(categories)
      setDashboardTrend([...trend].reverse())
      return
    }

    const bounds = getRangeBounds(dashboardRange)
    if (!bounds) {
      return
    }

    const [summary, categories, trend] = await Promise.all([
      window.api.dashboard.summaryRange({
        startMonth: bounds.startMonth,
        endMonth: bounds.endMonth,
      }),
      window.api.dashboard.categoriesRange({
        startMonth: bounds.startMonth,
        endMonth: bounds.endMonth,
      }),
      window.api.dashboard.trend({ months: bounds.monthsBack }),
    ])
    setDashboardSummary(summary)
    setDashboardCategories(categories)
    setDashboardTrend([...trend].reverse())
  }

  useEffect(() => {
    loadTransactions()
    loadUncategorized()
    loadCategorized()
    loadCategories()
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
    if (activeCategories.length > 0 && newRule.categoryId === 0) {
      setNewRule((current) => ({
        ...current,
        categoryId: activeCategories[0].id,
      }))
    }
  }, [activeCategories, newRule.categoryId])

  useEffect(() => {
    loadTransactions()
  }, [page, pageSizeTransactions])

  useEffect(() => {
    loadUncategorized()
  }, [uncategorizedPage, pageSizeUncategorized])

  useEffect(() => {
    loadCategorized()
  }, [categorizedPage, pageSizeCategorized, categorizedFilter])

  useEffect(() => {
    setCategorizedPage(0)
  }, [categorizedFilter])

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(categories.length / pageSizeCategories) - 1)
    if (categoriesPage > maxPage) {
      setCategoriesPage(maxPage)
    }
  }, [categories.length, pageSizeCategories, categoriesPage])

  useEffect(() => {
    const maxPage = Math.max(0, Math.ceil(rules.length / pageSizeRules) - 1)
    if (rulesPage > maxPage) {
      setRulesPage(maxPage)
    }
  }, [rules.length, pageSizeRules, rulesPage])

  useEffect(() => {
    const maxPage = Math.max(
      0,
      Math.ceil(dashboardSpendCategories.length / pageSizeDashboardCategories) - 1
    )
    if (dashboardCategoryPage > maxPage) {
      setDashboardCategoryPage(maxPage)
    }
  }, [
    dashboardSpendCategories.length,
    pageSizeDashboardCategories,
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

  const pickFile = async () => {
    const selected = await window.api.import.pickFile()
    if (selected) {
      setFilePath(selected)
      setStatus('File selected.')
      setWarnings([])
    }
  }

  const runImport = async () => {
    if (!filePath) {
      setStatus('Pick a CSV file first.')
      return
    }
    setStatus('Importing...')
    const result = await window.api.import.dkb(filePath)
    if (result.success) {
      setStatus(`Imported ${result.inserted} rows (skipped ${result.skipped}).`)
      loadTransactions()
      loadUncategorized()
      loadCategorized()
      loadDashboardMonths()
      loadDashboardData()
    } else {
      setStatus(`Import failed: ${result.error ?? 'Unknown error'}`)
    }
    setWarnings(result.warnings ?? [])
  }

  const createCategory = async () => {
    if (!newCategoryName.trim()) {
      setCategoryStatus('Name is required.')
      return
    }

    const createdId = await window.api.categories.create({
      name: newCategoryName.trim(),
      color: newCategoryColor || null,
    })

    if (!createdId) {
      setCategoryStatus('Category could not be created.')
      return
    }

    setCategoryStatus('Category created.')
    setNewCategoryName('')
    setNewCategoryColor('#4c7cff')
    setNewCategoryModalOpen(false)
    loadCategories()
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
    loadCategories()
  }

  const deleteCategoryRow = async (id: number) => {
    const result = await window.api.categories.delete({ id })
    if (result.deleted) {
      setCategoryStatus('Category deleted.')
    } else if (result.archived) {
      setCategoryStatus('Category in use. Archived instead.')
    } else {
      setCategoryStatus('Category could not be deleted.')
    }
    loadCategories()
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

  const openRuleDraft = (tx: TransactionRow) => {
    const defaultCategory = (selection[tx.id] ?? [])[0]
    if (!defaultCategory) {
      return
    }

    setRuleDraft({
      txId: tx.id,
      matcherType: 'payee',
      matcherValue: tx.payee ?? tx.purpose ?? '',
      categoryId: defaultCategory,
      priority: 100,
      isActive: 1,
    })
    setRuleMenuOpen((current) => ({ ...current, [tx.id]: false }))
  }

  const createRuleFromPayee = async (tx: TransactionRow) => {
    const defaultCategory = (selection[tx.id] ?? [])[0]
    if (!defaultCategory) {
      return
    }
    const matcherValue = tx.payee ?? tx.purpose ?? ''
    if (!matcherValue.trim()) {
      setRulesStatusModal('No payee available for this transaction.')
      return
    }

    await window.api.rules.create({
      matcherType: 'payee',
      matcherValue: matcherValue.trim(),
      categoryId: defaultCategory,
      priority: 100,
      isActive: 1,
    })
    await applyRules()
    setRuleMenuOpen((current) => ({ ...current, [tx.id]: false }))
    setRulesStatusModal('Rule created from payee and applied.')
  }

  const saveRuleDraft = async () => {
    if (!ruleDraft || !ruleDraft.matcherValue.trim()) {
      return
    }

    await window.api.rules.create({
      matcherType: ruleDraft.matcherType,
      matcherValue: ruleDraft.matcherValue.trim(),
      categoryId: ruleDraft.categoryId,
      priority: ruleDraft.priority,
      isActive: ruleDraft.isActive,
    })

    setRuleDraft(null)
    await applyRules()
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
      return
    }

    setAiStatus(`AI suggested ${result.applied} transactions.`)
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
      return
    }

    await window.api.rules.create({
      matcherType: newRule.matcherType,
      matcherValue: newRule.matcherValue.trim(),
      categoryId: newRule.categoryId,
      priority: newRule.priority,
      isActive: newRule.isActive,
    })

    setNewRule({
      matcherType: newRule.matcherType,
      matcherValue: '',
      categoryId: newRule.categoryId,
      priority: newRule.priority,
      isActive: newRule.isActive,
    })
    await applyRules()
    setRulesStatusModal('Rule created and applied.')
    setNewRuleModalOpen(false)
    loadRules()
  }

  const updateRule = async (id: number) => {
    const draft = ruleEdits[id]
    if (!draft) {
      return
    }
    await window.api.rules.update({ id, ...draft })
    loadRules()
  }

  const removeRule = async (id: number) => {
    await window.api.rules.delete({ id })
    loadRules()
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">Horus</div>
        <nav className="nav">
          <button
            className={activeView === 'dashboard' ? 'active' : ''}
            onClick={() => setActiveView('dashboard')}
          >
            Dashboard
          </button>
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
          <button
            className={activeView === 'rules' ? 'active' : ''}
            onClick={() => setActiveView('rules')}
          >
            Rules
          </button>
          <button
            className={activeView === 'ai' ? 'active' : ''}
            onClick={() => setActiveView('ai')}
          >
            AI Settings
          </button>
          <button
            className={activeView === 'categories' ? 'active' : ''}
            onClick={() => setActiveView('categories')}
          >
            Categories
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
                <div className="chart-grid">
                  <div className="chart-card">
                    <div className="card-header">
                      <h3>Spend by category</h3>
                    </div>
                    {dashboardSpendCategories.length === 0 ? (
                      <div className="muted">No categorized spend yet.</div>
                    ) : (
                      <div className="chart">
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={dashboardSpendCategories}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis
                              dataKey="categoryName"
                              interval={0}
                              angle={0}
                              textAnchor="middle"
                              height={40}
                              tickFormatter={(value: string) =>
                                value.length > 12 ? `${value.slice(0, 12)}…` : value
                              }
                            />
                            <YAxis />
                            <Tooltip
                              formatter={(value: number) => formatCurrency(value)}
                            />
                            <Bar dataKey="totalSpend" fill="#2b4cff">
                              {dashboardSpendCategories.map((entry) => (
                                <Cell
                                  key={`bar-${entry.categoryId}`}
                                  fill={entry.categoryColor ?? '#2b4cff'}
                                />
                              ))}
                              <LabelList
                                dataKey="totalSpend"
                                position="top"
                                fill="#f0f0f0"
                                formatter={(value: number, entry: any, index: number) =>
                                  index < 10
                                    ? `${entry.categoryName} ${formatCompactCurrency(
                                        value
                                      )}`
                                    : ''
                                }
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="chart-card">
                    <div className="card-header">
                      <h3>Spend & income trend (last 6 months)</h3>
                    </div>
                    {dashboardTrend.length === 0 ? (
                      <div className="muted">No trend data yet.</div>
                    ) : (
                      <div className="chart">
                        <ResponsiveContainer width="100%" height={260}>
                          <LineChart data={dashboardTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="month" />
                            <YAxis />
                            <Tooltip
                              formatter={(value: number) => formatCurrency(value)}
                            />
                            <Line
                              type="monotone"
                              dataKey="totalSpend"
                              stroke="#f2c14e"
                              strokeWidth={2}
                            />
                            <Line
                              type="monotone"
                              dataKey="totalIncome"
                              stroke="#2b4cff"
                              strokeWidth={2}
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
                <div className="chart-card">
                  <div className="card-header">
                    <h3>Transactions per category</h3>
                    <div className="actions">
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
                        {dashboardSpendCategories.length === 0
                          ? 0
                          : dashboardCategoryPage + 1}
                      </span>
                      <button
                        onClick={() => setDashboardCategoryPage((p) => p + 1)}
                        disabled={
                          dashboardSpendCategories.length === 0 ||
                          (dashboardCategoryPage + 1) *
                            pageSizeDashboardCategories >=
                            dashboardSpendCategories.length
                        }
                      >
                        Next
                      </button>
                    </div>
                  </div>
                  {dashboardSpendCategories.length === 0 ? (
                    <div className="muted">No categorized transactions yet.</div>
                  ) : (
                    <div className="data-table">
                      <table>
                        <thead>
                          <tr>
                            <th>Category</th>
                            <th>Transactions</th>
                            <th>Total spend</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedDashboardCategories.map((row) => (
                            <tr key={row.categoryId}>
                              <td>
                                <span
                                  className="category-swatch"
                                  style={{
                                    backgroundColor:
                                      row.categoryColor ?? '#2b4cff',
                                  }}
                                />
                                {row.categoryName}
                              </td>
                              <td>{row.transactionCount}</td>
                              <td>{formatCurrency(row.totalSpend)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      <div className="data-table-footer">
                        Total: {dashboardSpendCategories.length}
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
              <button onClick={pickFile}>Pick DKB CSV</button>
              <button onClick={runImport} disabled={!filePath}>
                Import
              </button>
              <div className="status">
                <strong>Status:</strong> {status}
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
            <div className="card">
              <div className="card-header">
                <h2>Transactions</h2>
                <div className="actions">
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
                    disabled={transactions.length < pageSizeTransactions}
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
                    disabled={uncategorized.length < pageSizeUncategorized}
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
                          backgroundColor: '#101010',
                          borderColor: state.isFocused ? '#2b4cff' : '#2a2a2a',
                          boxShadow: state.isFocused
                            ? '0 0 0 1px #2b4cff'
                            : 'none',
                          minHeight: 34,
                        }),
                        menu: (base) => ({
                          ...base,
                          backgroundColor: '#141414',
                          border: '1px solid #2a2a2a',
                          color: '#f0f0f0',
                        }),
                        menuPortal: (base) => ({
                          ...base,
                          zIndex: 9999,
                        }),
                        option: (base, state) => ({
                          ...base,
                          backgroundColor: state.isSelected
                            ? '#2b4cff'
                            : state.isFocused
                            ? '#1f2338'
                            : '#141414',
                          color: '#f0f0f0',
                        }),
                        singleValue: (base) => ({ ...base, color: '#f0f0f0' }),
                        placeholder: (base) => ({ ...base, color: '#bdbdbd' }),
                        input: (base) => ({ ...base, color: '#f0f0f0' }),
                        multiValue: (base) => ({
                          ...base,
                          backgroundColor: '#1b1f33',
                          border: '1px solid #2b4cff',
                        }),
                        multiValueLabel: (base) => ({
                          ...base,
                          color: '#e6e9ff',
                        }),
                        multiValueRemove: (base) => ({
                          ...base,
                          color: '#cbd3ff',
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
                  Page {categories.length === 0 ? 0 : categoriesPage + 1}
                </span>
                <button
                  onClick={() => setCategoriesPage((p) => p + 1)}
                  disabled={
                    categories.length === 0 ||
                    (categoriesPage + 1) * pageSizeCategories >= categories.length
                  }
                >
                  Next
                </button>
              </div>
            </div>
            {categoryStatus && <div className="status">{categoryStatus}</div>}
            <DataTable
              data={pagedCategories}
              columns={categoryColumns}
              getRowId={(row) => String(row.id)}
              totalCount={categories.length}
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
                  Page {rules.length === 0 ? 0 : rulesPage + 1}
                </span>
                <button
                  onClick={() => setRulesPage((p) => p + 1)}
                  disabled={
                    rules.length === 0 ||
                    (rulesPage + 1) * pageSizeRules >= rules.length
                  }
                >
                  Next
                </button>
              </div>
            </div>
            <DataTable
              data={pagedRules}
              columns={rulesColumns}
              getRowId={(row) => String(row.id)}
              totalCount={rules.length}
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
      </div>
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
    </div>
  )
}

export default App



