import { useEffect, useMemo, useState } from 'react'
import './App.css'

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
    'transactions' | 'categories' | 'categorization'
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

  useEffect(() => {
    loadTransactions()
    loadUncategorized()
    loadCategorized()
    loadCategories()
  }, [])

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

  const activeCategories = useMemo(
    () => categories.filter((cat) => cat.isActive === 1),
    [categories]
  )

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
              <div className="table">
                <div className="table-row table-head">
                  <div>Date</div>
                  <div>Payee</div>
                  <div>Purpose</div>
                  <div className="amount">Amount</div>
                </div>
                {transactions.length === 0 && (
                  <div className="table-row empty">No transactions yet.</div>
                )}
                {transactions.map((tx) => (
                  <div className="table-row" key={tx.id}>
                    <div>{tx.bookingDate}</div>
                    <div>{tx.payee ?? '-'}</div>
                    <div className="purpose">{tx.purpose ?? '-'}</div>
                    <div className="amount">
                      {tx.amount.toFixed(2)} {tx.currency}
                    </div>
                  </div>
                ))}
              </div>
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
                <div className="table">
                  <div className="table-row table-head categorize-row">
                    <div>Date</div>
                    <div>Payee</div>
                    <div>Purpose</div>
                    <div className="amount">Amount</div>
                    <div>Category</div>
                    <div></div>
                    <div></div>
                  </div>
                  {uncategorized.length === 0 && (
                    <div className="table-row empty">
                      All transactions are categorized.
                    </div>
                  )}
                  {uncategorized.map((tx) => (
                    <div className="table-row categorize-row" key={tx.id}>
                      <div>{tx.bookingDate}</div>
                      <div>{tx.payee ?? '-'}</div>
                      <div className="purpose">{tx.purpose ?? '-'}</div>
                      <div className="amount">
                        {tx.amount.toFixed(2)} {tx.currency}
                      </div>
                      <select
                        value={selection[tx.id] ?? ''}
                        onChange={(event) =>
                          setSelection((current) => ({
                            ...current,
                            [tx.id]: Number(event.target.value),
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
                      <button
                        onClick={() => assignCategory(tx.id)}
                        disabled={!selection[tx.id]}
                      >
                        Add
                      </button>
                      <button
                        onClick={() => openRuleDraft(tx)}
                        disabled={!selection[tx.id]}
                      >
                        Create Rule
                      </button>
                    </div>
                  ))}
                </div>
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
                <div className="table">
                  <div className="table-row table-head categorized-row">
                    <div>Date</div>
                    <div>Payee</div>
                    <div>Purpose</div>
                    <div className="amount">Amount</div>
                    <div>Categories</div>
                  </div>
                  {categorized.length === 0 && (
                    <div className="table-row empty">
                      No categorized transactions yet.
                    </div>
                  )}
                  {categorized.map((tx) => (
                    <div className="table-row categorized-row" key={tx.id}>
                      <div>{tx.bookingDate}</div>
                      <div>{tx.payee ?? '-'}</div>
                      <div className="purpose">{tx.purpose ?? '-'}</div>
                      <div className="amount">
                        {tx.amount.toFixed(2)} {tx.currency}
                      </div>
                      <div className="chips">
                        {tx.categories.map((cat) => (
                          <button
                            key={cat.id}
                            className="chip"
                            onClick={() => removeCategory(tx.id, cat.id)}
                          >
                            {cat.name}
                            <span className="chip-remove">×</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
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
            <div className="table">
              <div className="table-row table-head category-row">
                <div>Name</div>
                <div>Color</div>
                <div>Status</div>
              </div>
              {categories.length === 0 && (
                <div className="table-row empty">No categories yet.</div>
              )}
              {categories.map((cat) => (
                <div className="table-row category-row" key={cat.id}>
                  <input
                    type="text"
                    value={cat.name}
                    onChange={(event) =>
                      updateCategory(cat, { name: event.target.value })
                    }
                  />
                  <input
                    type="color"
                    value={cat.color ?? '#4c7cff'}
                    onChange={(event) =>
                      updateCategory(cat, { color: event.target.value })
                    }
                  />
                  <label className="toggle">
                    <input
                      type="checkbox"
                      checked={cat.isActive === 1}
                      onChange={(event) =>
                        updateCategory(cat, {
                          isActive: event.target.checked ? 1 : 0,
                        })
                      }
                    />
                    <span>{cat.isActive === 1 ? 'Active' : 'Inactive'}</span>
                  </label>
                </div>
              ))}
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
    </div>
  )
}

export default App
