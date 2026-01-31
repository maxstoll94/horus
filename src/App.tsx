import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import {
  Bar,
  BarChart,
  CartesianGrid,
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

function App() {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Idle')
  const [warnings, setWarnings] = useState<string[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [uncategorized, setUncategorized] = useState<TransactionRow[]>([])
  const [categorized, setCategorized] = useState<CategorizedViewRow[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#4c7cff')
  const [categoryStatus, setCategoryStatus] = useState<string>('')
  const [activeView, setActiveView] = useState<
    'dashboard' | 'transactions' | 'categories' | 'categorization' | 'rules' | 'ai'
  >('dashboard')
  const [categorizationTab, setCategorizationTab] = useState<
    'uncategorized' | 'categorized'
  >('uncategorized')
  const [page, setPage] = useState(0)
  const [uncategorizedPage, setUncategorizedPage] = useState(0)
  const [categorizedPage, setCategorizedPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)
  const [selection, setSelection] = useState<Record<number, number>>({})
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

  const activeCategories = useMemo(
    () => categories.filter((cat) => cat.isActive === 1),
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
          <select
            value={selection[row.original.id] ?? ''}
            onChange={(event) =>
              setSelection((current) => ({
                ...current,
                [row.original.id]: Number(event.target.value),
              }))
            }
          >
            <option value="">Select...</option>
            {activeCategories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
        ),
      },
      {
        id: 'add',
        header: '',
        cell: ({ row }) => (
          <button
            onClick={() => assignCategory(row.original.id)}
            disabled={!selection[row.original.id]}
          >
            Add
          </button>
        ),
      },
      {
        id: 'rule',
        header: '',
        cell: ({ row }) => (
          <button
            onClick={() => openRuleDraft(row.original)}
            disabled={!selection[row.original.id]}
          >
            Create Rule
          </button>
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
    [activeCategories, selection, aiSuggestions]
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
        cell: ({ row }) => (
          <input
            type="text"
            value={row.original.name}
            onChange={(event) =>
              updateCategory(row.original, { name: event.target.value })
            }
          />
        ),
      },
      {
        header: 'Color',
        accessorKey: 'color',
        cell: ({ row }) => (
          <input
            type="color"
            value={row.original.color ?? '#4c7cff'}
            onChange={(event) =>
              updateCategory(row.original, { color: event.target.value })
            }
          />
        ),
      },
      {
        header: 'Status',
        id: 'status',
        cell: ({ row }) => (
          <label className="toggle">
            <input
              type="checkbox"
              checked={row.original.isActive === 1}
              onChange={(event) =>
                updateCategory(row.original, {
                  isActive: event.target.checked ? 1 : 0,
                })
              }
            />
            <span>{row.original.isActive === 1 ? 'Active' : 'Inactive'}</span>
          </label>
        ),
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
      limit: pageSize,
      offset: page * pageSize,
    })
    setTransactions(rows)
    setLoadingTransactions(false)
  }

  const loadUncategorized = async () => {
    const rows = await window.api.transactions.listUncategorized({
      limit: pageSize,
      offset: uncategorizedPage * pageSize,
    })
    setUncategorized(rows)
  }

  const loadCategorized = async () => {
    const rows = await window.api.transactions.listCategorized({
      limit: pageSize,
      offset: categorizedPage * pageSize,
    })
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

  const loadDashboardData = async (month: string) => {
    if (!month) {
      return
    }
    const [summary, categories, trend] = await Promise.all([
      window.api.dashboard.summary({ month }),
      window.api.dashboard.categories({ month }),
      window.api.dashboard.trend({ months: 6 }),
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
    if (dashboardMonth) {
      loadDashboardData(dashboardMonth)
    }
  }, [dashboardMonth])

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
  }, [page, pageSize])

  useEffect(() => {
    loadUncategorized()
  }, [uncategorizedPage, pageSize])

  useEffect(() => {
    loadCategorized()
  }, [categorizedPage, pageSize])

  useEffect(() => {
    loadAiSuggestions(uncategorized.map((tx) => tx.id))
  }, [uncategorized])

  useEffect(() => {
    const updatePageSize = () => {
      const estimatedRowHeight = 44
      const reservedSpace = 360
      const available = Math.max(200, window.innerHeight - reservedSpace)
      const nextSize = Math.max(10, Math.floor(available / estimatedRowHeight))
      setPageSize(nextSize)
      setPage(0)
      setUncategorizedPage(0)
      setCategorizedPage(0)
    }

    updatePageSize()
    window.addEventListener('resize', updatePageSize)
    return () => window.removeEventListener('resize', updatePageSize)
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
    loadCategories()
  }

  const updateCategory = async (
    category: CategoryRow,
    changes: Partial<CategoryRow>
  ) => {
    await window.api.categories.update({
      id: category.id,
      name: changes.name ?? category.name,
      color: changes.color ?? category.color,
      isActive: changes.isActive ?? category.isActive,
    })
    loadCategories()
  }

  const assignCategory = async (transactionId: number) => {
    const categoryId = selection[transactionId]
    if (!categoryId) {
      return
    }

    await window.api.transactions.addCategory({ transactionId, categoryId })
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
    const defaultCategory = selection[tx.id]
    if (!defaultCategory) {
      return
    }

    setRuleDraft({
      txId: tx.id,
      matcherType: 'payee',
      matcherValue: tx.payee ?? '',
      categoryId: defaultCategory,
      priority: 100,
      isActive: 1,
    })
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
    setRulesStatusModal('Rule created.')
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
        <h1>Horus</h1>
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
                <button onClick={() => setActiveView('categorization')}>
                  Go to Categorization
                </button>
                <button onClick={() => loadDashboardData(dashboardMonth)}>
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
                    {dashboardCategories.length === 0 ? (
                      <div className="muted">No categorized spend yet.</div>
                    ) : (
                      <div className="chart">
                        <ResponsiveContainer width="100%" height={260}>
                          <BarChart data={dashboardCategories}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="categoryName" />
                            <YAxis />
                            <Tooltip
                              formatter={(value: number) => formatCurrency(value)}
                            />
                            <Bar dataKey="totalSpend" fill="#2b4cff" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                  <div className="chart-card">
                    <div className="card-header">
                      <h3>Spend trend (last 6 months)</h3>
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
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>
                <div className="chart-card">
                  <div className="card-header">
                    <h3>Transactions per category</h3>
                  </div>
                  {dashboardCategories.length === 0 ? (
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
                          {dashboardCategories.map((row) => (
                            <tr key={row.categoryId}>
                              <td>{row.categoryName}</td>
                              <td>{row.transactionCount}</td>
                              <td>{formatCurrency(row.totalSpend)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
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
                    disabled={transactions.length < pageSize}
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
                      disabled={uncategorized.length < pageSize}
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
                  emptyMessage="All transactions are categorized."
                />
              </>
            )}
            {categorizationTab === 'categorized' && (
              <>
                <div className="card-header subheader">
                  <h3>Categorized</h3>
                  <div className="actions">
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
                    <span className="page-indicator">Page {categorizedPage + 1}</span>
                    <button
                      onClick={() => setCategorizedPage((p) => p + 1)}
                      disabled={categorized.length < pageSize}
                    >
                      Next
                    </button>
                    <button onClick={loadCategorized}>Refresh</button>
                  </div>
                </div>
                <DataTable
                  data={categorized}
                  columns={categorizedColumns}
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
              <button onClick={loadCategories}>Refresh</button>
            </div>
            <div className="category-form">
              <input
                type="text"
                placeholder="Category name"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
              />
              <input
                type="color"
                value={newCategoryColor}
                onChange={(event) => setNewCategoryColor(event.target.value)}
              />
              <button onClick={createCategory}>Add</button>
            </div>
            {categoryStatus && <div className="status">{categoryStatus}</div>}
            <DataTable
              data={categories}
              columns={categoryColumns}
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
              </div>
            </div>
            <DataTable
              data={rules}
              columns={rulesColumns}
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
                <label>
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
    </div>
  )
}

export default App



