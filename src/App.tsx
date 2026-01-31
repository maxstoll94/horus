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

function App() {
  const [filePath, setFilePath] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('Idle')
  const [warnings, setWarnings] = useState<string[]>([])
  const [transactions, setTransactions] = useState<TransactionRow[]>([])
  const [loadingTransactions, setLoadingTransactions] = useState(false)

  const loadTransactions = async () => {
    setLoadingTransactions(true)
    const rows = await window.api.transactions.list({ limit: 200, offset: 0 })
    setTransactions(rows)
    setLoadingTransactions(false)
  }

  useEffect(() => {
    loadTransactions()
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

  return (
    <div className="app">
      <h1>Horus CSV Import (DKB)</h1>
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
          <button onClick={loadTransactions} disabled={loadingTransactions}>
            {loadingTransactions ? 'Loading...' : 'Refresh'}
          </button>
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
              <div>{tx.payee ?? '—'}</div>
              <div className="purpose">{tx.purpose ?? '—'}</div>
              <div className="amount">
                {tx.amount.toFixed(2)} {tx.currency}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default App
