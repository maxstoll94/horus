import { useEffect, useState } from 'react'
import './App.css'

type TransactionRow = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
  categoryId: number | null
}

type CategoryRow = {
  id: number
  name: string
  color: string | null
  isActive: number
}

function App() {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Idle')
  const [warnings, setWarnings] = useState<string[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)
  const [categories, setCategories] = useState<CategoryRow[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryColor, setNewCategoryColor] = useState('#4c7cff')
  const [categoryStatus, setCategoryStatus] = useState<string>('')
  const [activeView, setActiveView] = useState<'transactions' | 'categories'>(
    'transactions'
  )
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(20)

  const loadTransactions = async () => {
    setLoadingTransactions(true)
    const rows = await window.api.transactions.list({
      limit: pageSize,
      offset: page * pageSize,
    })
    setTransactions(rows)
    setLoadingTransactions(false)
  }

  const loadCategories = async () => {
    const rows = await window.api.categories.list()
    setCategories(rows)
  }

  useEffect(() => {
    loadTransactions()
    loadCategories()
  }, [])

  useEffect(() => {
    loadTransactions()
  }, [page, pageSize])

  useEffect(() => {
    const updatePageSize = () => {
      const estimatedRowHeight = 44
      const reservedSpace = 360
      const available = Math.max(200, window.innerHeight - reservedSpace)
      const nextSize = Math.max(10, Math.floor(available / estimatedRowHeight))
      setPageSize(nextSize)
      setPage(0)
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
                        updateCategory(cat, { isActive: event.target.checked ? 1 : 0 })
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
    </div>
  )
}

export default App
