import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../components/DataTable'
import type { TransactionRow } from '../types'

type Props = {
  transactions: TransactionRow[]
  transactionsTotal: number
  transactionSearch: string
  setTransactionSearch: (value: string) => void
  page: number
  setPage: (page: number | ((p: number) => number)) => void
  pageSizeTransactions: number
  loadingTransactions: boolean
  loadTransactions: () => void
  setImportModalOpen: (open: boolean) => void
  transactionColumns: ColumnDef<TransactionRow>[]
}

export function TransactionsView({
  transactions,
  transactionsTotal,
  transactionSearch,
  setTransactionSearch,
  page,
  setPage,
  pageSizeTransactions,
  loadingTransactions,
  loadTransactions,
  setImportModalOpen,
  transactionColumns,
}: Props) {
  return (
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
  )
}
