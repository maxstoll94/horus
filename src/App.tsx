import { useEffect, useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
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
    'transactions' | 'categories' | 'categorization' | 'rules'
  >('transactions')
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
    ],
    [activeCategories, selection]
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

  useEffect(() => {
    loadTransactions()
    loadUncategorized()
    loadCategorized()
    loadCategories()
    loadRules()
  }, [])

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
            className={activeView === 'categories' ? 'active' : ''}
            onClick={() => setActiveView('categories')}
          >
            Categories
          </button>
        </nav>
      </aside>
      <div className="app">
        <h1>Horus</h1>
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



