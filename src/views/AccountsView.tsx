import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../components/DataTable'
import type { AccountRow } from '../types'

export type AccountEditDraft = {
  name: string
  type: string
  anchorBalance: string
  anchorDate: string
}

export type AccountTableMeta = {
  accountEdits: Record<number, AccountEditDraft>
  setAccountEdits: React.Dispatch<React.SetStateAction<Record<number, AccountEditDraft>>>
  saveAccount: (id: number) => void
  deleteAccountRow: (id: number) => void
}

type Props = {
  accounts: AccountRow[]
  accountEdits: AccountTableMeta['accountEdits']
  setAccountEdits: AccountTableMeta['setAccountEdits']
  saveAccount: (id: number) => void
  deleteAccountRow: (id: number) => void
  loadAccounts: () => void
  accountColumns: ColumnDef<AccountRow>[]
}

export function AccountsView({
  accounts,
  accountEdits,
  setAccountEdits,
  saveAccount,
  deleteAccountRow,
  loadAccounts,
  accountColumns,
}: Props) {
  return (
    <div className="card">
      <div className="card-header">
        <h2>Accounts</h2>
        <div className="actions">
          <button onClick={loadAccounts}>Refresh</button>
        </div>
      </div>
      <p className="muted">
        Accounts are created automatically when you import a CSV. Balances are derived from the
        anchor balance plus all transactions after that date.
      </p>
      <DataTable
        data={accounts}
        columns={accountColumns}
        getRowId={(row) => String(row.id)}
        totalCount={accounts.length}
        meta={{
          accountEdits,
          setAccountEdits,
          saveAccount,
          deleteAccountRow,
        }}
        emptyMessage="No accounts yet — import a CSV to create one."
      />
    </div>
  )
}
