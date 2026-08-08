import {
  Bar,
  BarChart,
  CartesianGrid,
  Customized,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

type DashboardSummary = {
  month: string
  totalIncome: number
  totalSpend: number
  net: number
  transactionCount: number
  categorizedCount: number
  uncategorizedCount: number
}

type DashboardBreakdown = {
  id: number
  name: string
  color: string | null
  totalSpend: number
  totalIncome: number
  transactionCount: number
  net: number
  netAbs: number
}

type DashboardTransaction = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
}

type Props = {
  dashboardMonths: string[]
  dashboardMonth: string
  setDashboardMonth: (month: string) => void
  dashboardRange: 'month' | 'last1' | 'last3' | 'last6'
  setDashboardRange: (range: 'month' | 'last1' | 'last3' | 'last6') => void
  dashboardGroupBy: 'category' | 'tag'
  setDashboardGroupBy: (groupBy: 'category' | 'tag') => void
  dashboardBreakdownMode: 'spending' | 'income'
  setDashboardBreakdownMode: (mode: 'spending' | 'income') => void
  dashboardSummary: DashboardSummary | null
  dashboardNetBreakdown: DashboardBreakdown[]
  dashboardCategorySelectionId: number | null
  setDashboardCategorySelectionId: (id: number | null) => void
  dashboardCategoryPage: number
  setDashboardCategoryPage: (page: number | ((p: number) => number)) => void
  pageSizeDashboardTransactions: number
  dashboardCategoryTransactions: DashboardTransaction[]
  dashboardCategoryTransactionsTotal: number
  selectedDashboardBreakdown: DashboardBreakdown | undefined
  loadDashboardData: () => void
  loadDashboardCategoryTransactions: () => void
  handleDashboardCategorySelect: (categoryId: number) => void
  setActiveView: (view: 'dashboard' | 'budget' | 'transactions' | 'categories' | 'categorization' | 'rules' | 'tags' | 'ai') => void
  formatCurrency: (value: number) => string
  formatCompactCurrency: (value: number) => string
  truncatePurpose: (value: string | null, limit?: number) => string
  formatNetTooltip: (value: number | string, name: string, item: { payload?: { net?: number } }) => string
  renderDashboardCategoryClickLayer: (props: any) => JSX.Element | null
}

export function DashboardView({
  dashboardMonths,
  dashboardMonth,
  setDashboardMonth,
  dashboardRange,
  setDashboardRange,
  dashboardGroupBy,
  setDashboardGroupBy,
  dashboardBreakdownMode,
  setDashboardBreakdownMode,
  dashboardSummary,
  dashboardNetBreakdown,
  dashboardCategorySelectionId,
  setDashboardCategorySelectionId,
  dashboardCategoryPage,
  setDashboardCategoryPage,
  pageSizeDashboardTransactions,
  dashboardCategoryTransactions,
  dashboardCategoryTransactionsTotal,
  selectedDashboardBreakdown,
  loadDashboardData,
  loadDashboardCategoryTransactions,
  handleDashboardCategorySelect,
  setActiveView,
  formatCurrency,
  formatCompactCurrency,
  truncatePurpose,
  formatNetTooltip,
  renderDashboardCategoryClickLayer,
}: Props) {
  const groupLabel = dashboardGroupBy === 'category' ? 'Category' : 'Tag'
  return (
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
          <label className="picker">
            Group by
            <select
              value={dashboardGroupBy}
              onChange={(event) =>
                setDashboardGroupBy(event.target.value as 'category' | 'tag')
              }
            >
              <option value="category">Category</option>
              <option value="tag">Tag</option>
            </select>
          </label>
          <label className="picker">
            Show
            <select
              value={dashboardBreakdownMode}
              onChange={(event) =>
                setDashboardBreakdownMode(
                  event.target.value as 'spending' | 'income'
                )
              }
            >
              <option value="spending">Net Spending</option>
              <option value="income">Net Income</option>
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
          <div className="chart-card">
            <div className="card-header">
              <h3>
                NET {dashboardBreakdownMode === 'spending' ? 'SPENDING' : 'INCOME'} BY{' '}
                {groupLabel.toUpperCase()}
              </h3>
            </div>
            {dashboardNetBreakdown.length === 0 ? (
              <div className="muted">
                {dashboardBreakdownMode === 'spending'
                  ? dashboardGroupBy === 'category'
                    ? 'No negative net categories.'
                    : 'No negative net tags — only tagged transactions are included here.'
                  : dashboardGroupBy === 'category'
                  ? 'No positive net categories.'
                  : 'No positive net tags — only tagged transactions are included here.'}
              </div>
            ) : (
              <div className="chart-scroll">
                <div
                  className="chart"
                  style={{
                    width: Math.max(
                      520,
                      dashboardNetBreakdown.length * 120
                    ),
                  }}
                >
                  <ResponsiveContainer width="100%" height={260}>
                    <BarChart
                      data={dashboardNetBreakdown}
                      onClick={(state) => {
                        const label = (state as { activeLabel?: string })?.activeLabel
                        if (!label) {
                          return
                        }
                        const match = dashboardNetBreakdown.find(
                          (row) => row.name === label
                        )
                        if (match) {
                          handleDashboardCategorySelect(match.id)
                        }
                      }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis
                        dataKey="name"
                        interval={0}
                        angle={0}
                        textAnchor="middle"
                        height={40}
                        tick={(props: any) => {
                          const value = String(props.payload?.value ?? '')
                          const label =
                            value.length > 12 ? `${value.slice(0, 12)}...` : value
                          const match = dashboardNetBreakdown.find(
                            (row) => row.name === value
                          )
                          return (
                            <g
                              transform={`translate(${props.x},${props.y})`}
                              onClick={() => {
                                if (match) {
                                  handleDashboardCategorySelect(match.id)
                                }
                              }}
                              style={{ cursor: match ? 'pointer' : 'default' }}
                            >
                              <text
                                x={0}
                                y={0}
                                dy={16}
                                textAnchor="middle"
                                fill="#6b7280"
                              >
                                {label}
                              </text>
                            </g>
                          )
                        }}
                      />
                      <YAxis
                        tickFormatter={(value: number) =>
                          formatCompactCurrency(value)
                        }
                      />
                      <Tooltip
                        formatter={(value, _name, item) => {
                          const normalized = Array.isArray(value)
                            ? value[0] ?? ''
                            : value ?? ''
                          return formatNetTooltip(
                            normalized,
                            String(_name ?? ''),
                            item as { payload?: { net?: number } }
                          )
                        }}
                      />
                      <Bar
                        dataKey="netAbs"
                        name={dashboardBreakdownMode === 'spending' ? 'Net spending' : 'Net income'}
                        fill={dashboardBreakdownMode === 'spending' ? '#f59e0b' : '#10b981'}
                        onClick={(data) => {
                          const payload = (data as { id?: number }) ?? {}
                          if (payload.id) {
                            handleDashboardCategorySelect(payload.id)
                          }
                        }}
                      >
                        {dashboardNetBreakdown.map((entry) => (
                          <Cell
                            key={`net-${entry.id}`}
                            fill={entry.color ?? (dashboardBreakdownMode === 'spending' ? '#f59e0b' : '#10b981')}
                          />
                        ))}
                      </Bar>
                      <Customized component={renderDashboardCategoryClickLayer} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>
          <div className="chart-card">
            <div className="card-header">
              <h3>
                TRANSACTIONS:
                {selectedDashboardBreakdown
                  ? ` ${selectedDashboardBreakdown.name}`
                  : ''}
              </h3>
              <div className="actions">
                <label className="picker">
                  {groupLabel}
                  <select
                    value={dashboardCategorySelectionId ?? ''}
                    onChange={(event) => {
                      const value = Number(event.target.value)
                      setDashboardCategorySelectionId(
                        Number.isNaN(value) ? null : value
                      )
                      setDashboardCategoryPage(0)
                    }}
                    disabled={dashboardNetBreakdown.length === 0}
                  >
                    {dashboardNetBreakdown.length === 0 && (
                      <option value="">No {dashboardGroupBy === 'category' ? 'categories' : 'tags'}</option>
                    )}
                    {dashboardNetBreakdown.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.name}
                      </option>
                    ))}
                  </select>
                </label>
                <button
                  onClick={() => loadDashboardCategoryTransactions()}
                  disabled={!dashboardCategorySelectionId}
                >
                  Refresh
                </button>
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
                  {dashboardCategoryTransactionsTotal === 0
                    ? 0
                    : dashboardCategoryPage + 1}
                </span>
                <button
                  onClick={() => setDashboardCategoryPage((p) => p + 1)}
                  disabled={
                    dashboardCategoryTransactionsTotal === 0 ||
                    (dashboardCategoryPage + 1) *
                      pageSizeDashboardTransactions >=
                      dashboardCategoryTransactionsTotal
                  }
                >
                  Next
                </button>
              </div>
            </div>
            {!dashboardCategorySelectionId ? (
              <div className="muted">
                Select a {dashboardGroupBy} in the chart to see transactions.
              </div>
            ) : dashboardCategoryTransactionsTotal === 0 ? (
              <div className="muted">No transactions for this {dashboardGroupBy}.</div>
            ) : (
              <div className="data-table dashboard-transactions">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Payee</th>
                      <th>Purpose</th>
                      <th>Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardCategoryTransactions.map((row) => (
                      <tr key={row.id}>
                        <td>{row.bookingDate}</td>
                        <td>{row.payee ?? '-'}</td>
                        <td className="purpose">{truncatePurpose(row.purpose, 100)}</td>
                        <td className="amount">
                          {row.amount.toFixed(2)} {row.currency}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="data-table-footer">
                  Total: {dashboardCategoryTransactionsTotal}
                </div>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="muted">No data yet.</div>
      )}
    </div>
  )
}
