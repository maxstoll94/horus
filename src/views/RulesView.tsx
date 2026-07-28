import type { ColumnDef } from '@tanstack/react-table'
import { DataTable } from '../components/DataTable'
import type { RuleRow, CategoryRow, TagOption } from '../types'

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

type Props = {
  rules: RuleRow[]
  rulesTotal: number
  ruleSearch: string
  setRuleSearch: (value: string) => void
  rulesPage: number
  setRulesPage: (page: number | ((p: number) => number)) => void
  pageSizeRules: number
  ruleEdits: RuleTableMeta['ruleEdits']
  setRuleEdits: RuleTableMeta['setRuleEdits']
  activeCategories: CategoryRow[]
  tagOptions: TagOption[]
  updateRule: (id: number) => void
  removeRule: (id: number) => void
  loadRules: () => void
  setNewRuleModalOpen: (open: boolean) => void
  rulesColumns: ColumnDef<RuleRow>[]
}

export function RulesView({
  rules,
  rulesTotal,
  ruleSearch,
  setRuleSearch,
  rulesPage,
  setRulesPage,
  pageSizeRules,
  ruleEdits,
  setRuleEdits,
  activeCategories,
  tagOptions,
  updateRule,
  removeRule,
  loadRules,
  setNewRuleModalOpen,
  rulesColumns,
}: Props) {
  return (
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
      <div className="rules-table-wrap">
        <DataTable
          data={rules}
          columns={rulesColumns}
          getRowId={(row) => String(row.id)}
          totalCount={rulesTotal}
          meta={{
            ruleEdits,
            setRuleEdits,
            activeCategories,
            tagOptions,
            saveRule: updateRule,
            deleteRule: removeRule,
          }}
          emptyMessage="No rules yet."
        />
      </div>
    </div>
  )
}
