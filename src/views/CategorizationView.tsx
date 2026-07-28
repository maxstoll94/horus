import type { ColumnDef } from '@tanstack/react-table'
import Select from 'react-select'
import { DataTable } from '../components/DataTable'
import { multiSelectStyles } from '../lib/reactSelectStyles'
import type { TransactionRow, CategorizedViewRow, CategoryOption } from '../types'

type Props = {
  categorizationTab: 'uncategorized' | 'categorized'
  setCategorizationTab: (tab: 'uncategorized' | 'categorized') => void
  uncategorized: TransactionRow[]
  uncategorizedTotal: number
  uncategorizedPage: number
  setUncategorizedPage: (page: number | ((p: number) => number)) => void
  pageSizeUncategorized: number
  categorized: CategorizedViewRow[]
  categorizedTotal: number
  categorizedPage: number
  setCategorizedPage: (page: number | ((p: number) => number)) => void
  pageSizeCategorized: number
  categorizedFilter: number[]
  setCategorizedFilter: (filter: number[]) => void
  categoryFilterOptions: CategoryOption[]
  rulesStatus: string
  aiStatus: string
  aiSuggestLoading: boolean
  applyRules: () => void
  createQuickRulesForAll: () => void
  suggestWithAi: () => void
  loadUncategorized: () => void
  loadCategorized: () => void
  uncategorizedColumns: ColumnDef<TransactionRow>[]
  categorizedColumns: ColumnDef<CategorizedViewRow>[]
}

export function CategorizationView({
  categorizationTab,
  setCategorizationTab,
  uncategorized,
  uncategorizedTotal,
  uncategorizedPage,
  setUncategorizedPage,
  pageSizeUncategorized,
  categorized,
  categorizedTotal,
  categorizedPage,
  setCategorizedPage,
  pageSizeCategorized,
  categorizedFilter,
  setCategorizedFilter,
  categoryFilterOptions,
  rulesStatus,
  aiStatus,
  aiSuggestLoading,
  applyRules,
  createQuickRulesForAll,
  suggestWithAi,
  loadUncategorized,
  loadCategorized,
  uncategorizedColumns,
  categorizedColumns,
}: Props) {
  return (
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
              <button onClick={createQuickRulesForAll}>Save as Rules</button>
              <button onClick={applyRules}>Apply Rules</button>
              <button onClick={suggestWithAi} disabled={aiSuggestLoading}>
                {aiSuggestLoading
                  ? '⟳ Suggesting…'
                  : `Suggest with AI${uncategorizedTotal > 0 ? ` (all ${uncategorizedTotal})` : ''}`}
              </button>
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
          <div className="categorization-table-wrap">
            <DataTable
              data={uncategorized}
              columns={uncategorizedColumns}
              getRowId={(row) => String(row.id)}
              totalCount={uncategorizedTotal}
              emptyMessage="All transactions are categorized."
            />
          </div>
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
                styles={multiSelectStyles}
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
  )
}
