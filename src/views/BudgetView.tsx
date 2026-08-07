import { useEffect, useMemo, useState } from 'react'
import type { BudgetRow, BudgetActualRow, CategoryRow } from '../types'

type Props = {
  categoriesAll: CategoryRow[]
  pushToast: (message: string, tone?: 'success' | 'error' | 'info') => void
  categorizationVersion: number
  accountIds: number[]
  loadTransactions: () => void
  loadDashboardData: () => void
  loadUncategorized: () => void
  loadCategorized: () => void
}

const GROUP_LABELS: Record<string, string> = {
  income: 'Income',
  fixed_expense: 'Fixed Expenses',
  variable_expense: 'Variable Expenses',
  savings: 'Savings & Investments',
  transfer: 'Internal Transfers',
}

const GROUP_ORDER = ['income', 'fixed_expense', 'variable_expense', 'savings', 'transfer']

export function BudgetView({ categoriesAll, pushToast, categorizationVersion, accountIds, loadTransactions, loadDashboardData, loadUncategorized, loadCategorized }: Props) {
  const now = new Date()
  const currentYear = String(now.getFullYear())
  const currentMonth = `${currentYear}-${String(now.getMonth() + 1).padStart(2, '0')}`

  const [tab, setTab] = useState<'monthly' | 'yearly'>('monthly')
  const [selectedYear, setSelectedYear] = useState(currentYear)
  const [selectedMonth, setSelectedMonth] = useState(currentMonth)
  const [budgetsYear, setBudgetsYear] = useState<BudgetRow[]>([])
  const [budgetsMonth, setBudgetsMonth] = useState<BudgetRow[]>([])
  const [actuals, setActuals] = useState<BudgetActualRow[]>([])
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const [manualTxOpen, setManualTxOpen] = useState(false)
  const [manualTx, setManualTx] = useState({
    bookingDate: currentMonth + '-01',
    amount: '',
    currency: 'EUR',
    payee: '',
    purpose: '',
    account: '',
    categoryIds: [] as number[],
  })

  const [editingBudget, setEditingBudget] = useState<Record<number, { amount: string; cadence: string; scope: 'month' | 'year' }>>({})

  useEffect(() => {
    window.api.dashboard.months().then((months) => {
      if (months.length > 0) {
        const latest = months[0]
        setSelectedMonth(latest)
        setSelectedYear(latest.split('-')[0])
      }
    })
  }, [])

  const loadBudgets = async () => {
    const [yearRows, monthRows] = await Promise.all([
      window.api.budgets.list({ period: selectedYear }),
      tab === 'monthly' ? window.api.budgets.list({ period: selectedMonth }) : Promise.resolve([]),
    ])
    setBudgetsYear(yearRows)
    setBudgetsMonth(monthRows)
  }

  const loadActuals = async () => {
    const ids = accountIds.length > 0 ? accountIds : undefined
    const rows = tab === 'monthly'
      ? await window.api.budgets.actuals({ year: selectedYear, month: selectedMonth, accountIds: ids })
      : await window.api.budgets.actuals({ year: selectedYear, accountIds: ids })
    setActuals(rows)
  }

  useEffect(() => { loadBudgets() }, [selectedYear, selectedMonth, tab])
  useEffect(() => { loadActuals() }, [selectedYear, selectedMonth, tab, categorizationVersion, accountIds])

  const actualsMap = useMemo(() => {
    const map: Record<number, number> = {}
    for (const row of actuals) map[row.categoryId] = row.actual
    return map
  }, [actuals])

  const categoriesByGroup = useMemo(() => {
    const map: Record<string, CategoryRow[]> = {}
    for (const cat of categoriesAll) {
      if (!map[cat.groupType]) map[cat.groupType] = []
      map[cat.groupType].push(cat)
    }
    return map
  }, [categoriesAll])

  // Year-level budget map
  const budgetYearMap = useMemo(() => {
    const map: Record<number, BudgetRow> = {}
    for (const b of budgetsYear) map[b.categoryId] = b
    return map
  }, [budgetsYear])

  // Month-specific budget map (overrides year-level)
  const budgetMonthMap = useMemo(() => {
    const map: Record<number, BudgetRow> = {}
    for (const b of budgetsMonth) map[b.categoryId] = b
    return map
  }, [budgetsMonth])

  // Effective budget for a category: month-specific if available, otherwise year-level
  const getEffectiveBudget = (categoryId: number): { budget: BudgetRow | undefined; isMonthSpecific: boolean } => {
    if (tab === 'monthly' && budgetMonthMap[categoryId]) {
      return { budget: budgetMonthMap[categoryId], isMonthSpecific: true }
    }
    return { budget: budgetYearMap[categoryId], isMonthSpecific: false }
  }

  const getBudgetAmount = (budget: BudgetRow | undefined, forDisplay: 'monthly' | 'yearly') => {
    if (!budget) return 0
    if (budget.cadence === 'monthly') {
      return forDisplay === 'monthly' ? budget.amount : budget.amount * 12
    } else {
      return forDisplay === 'monthly' ? budget.amount / 12 : budget.amount
    }
  }

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)

  const saveBudget = async (categoryId: number) => {
    const edit = editingBudget[categoryId]
    if (!edit) return
    const amount = parseFloat(edit.amount.replace(',', '.'))
    if (isNaN(amount) || amount < 0) { pushToast('Invalid amount', 'error'); return }

    const period = edit.scope === 'month' ? selectedMonth : selectedYear
    const cadence = edit.scope === 'month' ? 'monthly' : edit.cadence
    await window.api.budgets.upsert({ categoryId, period, cadence, amount })
    await loadBudgets()
    setEditingBudget((cur) => { const next = { ...cur }; delete next[categoryId]; return next })
    pushToast('Budget saved.', 'success')
  }

  const deleteBudget = async (id: number) => {
    await window.api.budgets.delete({ id })
    await loadBudgets()
    pushToast('Budget removed.', 'info')
  }

  const clearMonthOverride = async (categoryId: number) => {
    const monthBudget = budgetMonthMap[categoryId]
    if (monthBudget) {
      await window.api.budgets.delete({ id: monthBudget.id })
      await loadBudgets()
      pushToast('Month override cleared — using year-level budget.', 'info')
    }
  }

  const submitManualTx = async () => {
    const amount = parseFloat(manualTx.amount.replace(',', '.'))
    if (isNaN(amount)) { pushToast('Invalid amount', 'error'); return }
    if (!manualTx.bookingDate) { pushToast('Date required', 'error'); return }
    await window.api.transactions.createManual({
      bookingDate: manualTx.bookingDate,
      amount,
      currency: manualTx.currency,
      payee: manualTx.payee || null,
      purpose: manualTx.purpose || null,
      account: manualTx.account || null,
      categoryIds: manualTx.categoryIds,
    })
    setManualTxOpen(false)
    setManualTx({ bookingDate: currentMonth + '-01', amount: '', currency: 'EUR', payee: '', purpose: '', account: '', categoryIds: [] })
    loadActuals()
    loadTransactions()
    loadDashboardData()
    loadUncategorized()
    loadCategorized()
    pushToast('Transaction added.', 'success')
  }

  const activeCategories = useMemo(() => categoriesAll.filter((c) => c.isActive === 1), [categoriesAll])

  const getSectionTotals = (groupType: string) => {
    const cats = categoriesByGroup[groupType] ?? []
    let budgetTotal = 0
    let actualTotal = 0
    for (const cat of cats) {
      const { budget } = getEffectiveBudget(cat.id)
      budgetTotal += getBudgetAmount(budget, tab)
      actualTotal += Math.abs(actualsMap[cat.id] ?? 0)
    }
    return { budgetTotal, actualTotal, variance: budgetTotal - actualTotal }
  }

  const totalIncome = (() => {
    const cats = categoriesByGroup['income'] ?? []
    return cats.reduce((sum, cat) => sum + Math.abs(actualsMap[cat.id] ?? 0), 0)
  })()

  const totalExpenses = (['fixed_expense', 'variable_expense'] as const).reduce((sum, g) => {
    const cats = categoriesByGroup[g] ?? []
    return sum + cats.reduce((s, cat) => s + Math.abs(actualsMap[cat.id] ?? 0), 0)
  }, 0)

  const totalSavings = (() => {
    const cats = categoriesByGroup['savings'] ?? []
    return cats.reduce((sum, cat) => sum + Math.abs(actualsMap[cat.id] ?? 0), 0)
  })()

  const net = totalIncome - totalExpenses - totalSavings
  const savingsRate = totalIncome > 0 ? (totalSavings / totalIncome) * 100 : 0

  const budgetedIncome = (() => {
    const cats = categoriesByGroup['income'] ?? []
    return cats.reduce((sum, cat) => sum + getBudgetAmount(getEffectiveBudget(cat.id).budget, tab), 0)
  })()
  const budgetedExpenses = (['fixed_expense', 'variable_expense'] as const).reduce((sum, g) => {
    const cats = categoriesByGroup[g] ?? []
    return sum + cats.reduce((s, cat) => s + getBudgetAmount(getEffectiveBudget(cat.id).budget, tab), 0)
  }, 0)
  const budgetedSavings = (() => {
    const cats = categoriesByGroup['savings'] ?? []
    return cats.reduce((sum, cat) => sum + getBudgetAmount(getEffectiveBudget(cat.id).budget, tab), 0)
  })()
  const budgetedNet = budgetedIncome - budgetedExpenses - budgetedSavings
  const budgetedSavingsRate = budgetedIncome > 0 ? (budgetedSavings / budgetedIncome) * 100 : 0

  const renderSection = (groupType: string) => {
    const cats = categoriesByGroup[groupType] ?? []
    const isTransfer = groupType === 'transfer'
    const { budgetTotal, actualTotal, variance } = getSectionTotals(groupType)
    const isCollapsed = collapsed[groupType]

    return (
      <div key={groupType} className={`budget-section budget-section-${groupType}`}>
        <div
          className="budget-section-header"
          onClick={() => setCollapsed((c) => ({ ...c, [groupType]: !c[groupType] }))}
        >
          <span className="budget-section-toggle">{isCollapsed ? '▶' : '▼'}</span>
          <span className="budget-section-title">{GROUP_LABELS[groupType] ?? groupType}</span>
          {isTransfer && <span className="budget-badge">not counted</span>}
          <div className="budget-section-totals">
            <span>Budget: {formatCurrency(budgetTotal)}</span>
            <span>Actual: {formatCurrency(actualTotal)}</span>
            <span className={variance >= 0 ? 'positive' : 'negative'}>
              Variance: {formatCurrency(variance)}
            </span>
          </div>
        </div>
        {!isCollapsed && (
          <div className="budget-rows">
            <div className="budget-row-header">
              <span>Category</span>
              <span>{tab === 'monthly' ? 'Monthly Budget' : 'Annual Budget'}</span>
              <span>Actual</span>
              <span>Variance</span>
              <span>% budget</span>
              <span>% income</span>
              <span></span>
            </div>
            {cats.map((cat) => {
              const { budget, isMonthSpecific } = getEffectiveBudget(cat.id)
              const budgetAmt = getBudgetAmount(budget, tab)
              const actualAmt = Math.abs(actualsMap[cat.id] ?? 0)
              const varAmt = budgetAmt - actualAmt
              const pct = budgetAmt > 0 ? Math.min(100, (actualAmt / budgetAmt) * 100) : 0
              const incomePct = totalIncome > 0 ? (actualAmt / totalIncome) * 100 : 0
              const isEditing = cat.id in editingBudget
              const hasYearFallback = !isMonthSpecific && !!budget && tab === 'monthly'

              return (
                <div key={cat.id} className="budget-row">
                  <span className="budget-cat-name">
                    {cat.color && <span className="cat-dot" style={{ background: cat.color }} />}
                    {cat.name}
                  </span>
                  <span className="budget-amount">
                    {isEditing ? (
                      <span className="budget-amount-edit">
                        <input
                          type="text"
                          value={editingBudget[cat.id].amount}
                          onChange={(e) => setEditingBudget((cur) => ({ ...cur, [cat.id]: { ...cur[cat.id], amount: e.target.value } }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveBudget(cat.id)
                            if (e.key === 'Escape') setEditingBudget((cur) => { const next = { ...cur }; delete next[cat.id]; return next })
                          }}
                          autoFocus
                          className="budget-amount-input"
                        />
                        {tab === 'yearly' && (
                          <select
                            value={editingBudget[cat.id].cadence}
                            onChange={(e) => setEditingBudget((cur) => ({ ...cur, [cat.id]: { ...cur[cat.id], cadence: e.target.value } }))}
                            className="budget-cadence-select"
                          >
                            <option value="monthly">/mo</option>
                            <option value="annual">/yr</option>
                          </select>
                        )}
                        {tab === 'monthly' && (
                          <select
                            value={editingBudget[cat.id].scope}
                            onChange={(e) => setEditingBudget((cur) => ({ ...cur, [cat.id]: { ...cur[cat.id], scope: e.target.value as 'month' | 'year' } }))}
                            className="budget-cadence-select"
                          >
                            <option value="month">this month</option>
                            <option value="year">all of {selectedYear}</option>
                          </select>
                        )}
                        <button onClick={() => saveBudget(cat.id)} className="budget-save-btn">✓</button>
                        <button onClick={() => setEditingBudget((cur) => { const next = { ...cur }; delete next[cat.id]; return next })} className="budget-cancel-btn">✕</button>
                      </span>
                    ) : (
                      <span
                        className="budget-amount-value"
                        onClick={() => setEditingBudget((cur) => ({
                          ...cur,
                          [cat.id]: {
                            amount: budget ? String(budget.amount) : '',
                            cadence: budget?.cadence ?? 'monthly',
                            scope: 'month',
                          }
                        }))}
                        title="Click to edit"
                      >
                        {budget ? formatCurrency(budgetAmt) : <span className="muted">—</span>}
                        {budget && (
                          <span className="cadence-tag">
                            {isMonthSpecific
                              ? 'this month'
                              : budget.cadence === 'annual' && tab === 'monthly'
                              ? '/yr ÷12'
                              : budget.cadence === 'monthly' && tab === 'yearly'
                              ? '/mo ×12'
                              : budget.cadence === 'annual'
                              ? '/yr'
                              : '/mo'}
                          </span>
                        )}
                      </span>
                    )}
                  </span>
                  <span className="budget-actual">{formatCurrency(actualAmt)}</span>
                  <span className={`budget-variance ${varAmt >= 0 ? 'positive' : 'negative'}`}>
                    {formatCurrency(varAmt)}
                  </span>
                  <span className="budget-pct">
                    <div className="progress-bar">
                      <div
                        className={`progress-fill ${pct > 100 ? 'over' : ''}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                    <span>{pct.toFixed(0)}%</span>
                  </span>
                  <span className="budget-income-pct">
                    {totalIncome > 0 ? `${incomePct.toFixed(1)}%` : <span className="muted">—</span>}
                  </span>
                  <span className="budget-actions">
                    {isMonthSpecific && (
                      <button className="budget-delete-btn" onClick={() => clearMonthOverride(cat.id)} title="Clear month override">↩</button>
                    )}
                    {!isMonthSpecific && budget && (
                      <button className="budget-delete-btn" onClick={() => deleteBudget(budget.id)} title="Remove budget">x</button>
                    )}
                    {hasYearFallback && (
                      <span className="budget-inherited" title={`From ${selectedYear} budget`}>↑</span>
                    )}
                  </span>
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="card budget-view">
      <div className="card-header">
        <h2>Budget</h2>
        <div className="actions">
          <button className={tab === 'monthly' ? 'active' : ''} onClick={() => setTab('monthly')}>Monthly</button>
          <button className={tab === 'yearly' ? 'active' : ''} onClick={() => setTab('yearly')}>Yearly</button>
          {tab === 'monthly' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => { setSelectedMonth(e.target.value); setSelectedYear(e.target.value.split('-')[0]) }}
            />
          )}
          {tab === 'yearly' && (
            <input type="number" value={selectedYear} min={2000} max={2099}
              onChange={(e) => setSelectedYear(e.target.value)} style={{ width: 80 }} />
          )}
          <button onClick={() => setManualTxOpen(true)}>+ Add transaction</button>
          <button onClick={() => { loadBudgets(); loadActuals() }}>Refresh</button>
        </div>
      </div>

      <div className="budget-summary-bar">
        <div className="summary-card">
          <span className="label">Income</span>
          <strong>{formatCurrency(totalIncome)}</strong>
          {budgetedIncome > 0 && <span className="summary-budget">of {formatCurrency(budgetedIncome)}</span>}
        </div>
        <div className="summary-card">
          <span className="label">Expenses</span>
          <strong>{formatCurrency(totalExpenses)}</strong>
          {budgetedExpenses > 0 && <span className="summary-budget">of {formatCurrency(budgetedExpenses)}</span>}
        </div>
        <div className="summary-card">
          <span className="label">Savings</span>
          <strong>{formatCurrency(totalSavings)}</strong>
          {budgetedSavings > 0 && <span className="summary-budget">of {formatCurrency(budgetedSavings)}</span>}
        </div>
        <div className="summary-card">
          <span className="label">Net</span>
          <strong className={net >= 0 ? 'positive' : 'negative'}>{formatCurrency(net)}</strong>
          {budgetedNet !== 0 && <span className="summary-budget">budgeted {formatCurrency(budgetedNet)}</span>}
        </div>
        <div className="summary-card">
          <span className="label">Savings Rate</span>
          <strong>{savingsRate.toFixed(1)}%</strong>
          {budgetedSavingsRate > 0 && <span className="summary-budget">budgeted {budgetedSavingsRate.toFixed(1)}%</span>}
        </div>
      </div>

      <div className="budget-sections">
        {GROUP_ORDER.map((g) => renderSection(g))}
      </div>

      {manualTxOpen && (
        <div className="modal-backdrop">
          <div className="modal">
            <div className="modal-header">
              <h3>Add Manual Transaction</h3>
              <button onClick={() => setManualTxOpen(false)}>Close</button>
            </div>
            <div className="modal-body">
              <label>Date<input type="date" value={manualTx.bookingDate} onChange={(e) => setManualTx({ ...manualTx, bookingDate: e.target.value })} /></label>
              <label>Amount (use - for expenses)<input type="text" value={manualTx.amount} placeholder="-25.00" onChange={(e) => setManualTx({ ...manualTx, amount: e.target.value })} /></label>
              <label>Currency<input type="text" value={manualTx.currency} onChange={(e) => setManualTx({ ...manualTx, currency: e.target.value })} /></label>
              <label>Payee<input type="text" value={manualTx.payee} onChange={(e) => setManualTx({ ...manualTx, payee: e.target.value })} /></label>
              <label>Purpose<input type="text" value={manualTx.purpose} onChange={(e) => setManualTx({ ...manualTx, purpose: e.target.value })} /></label>
              <label>Account (optional)<input type="text" value={manualTx.account} onChange={(e) => setManualTx({ ...manualTx, account: e.target.value })} /></label>
              <label>
                Categories
                <select multiple value={manualTx.categoryIds.map(String)}
                  onChange={(e) => setManualTx({ ...manualTx, categoryIds: Array.from(e.target.selectedOptions).map((o) => Number(o.value)) })}
                  size={5}>
                  {activeCategories.map((cat) => <option key={cat.id} value={cat.id}>{cat.name}</option>)}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button onClick={() => setManualTxOpen(false)}>Cancel</button>
              <button onClick={submitManualTx}>Add Transaction</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
