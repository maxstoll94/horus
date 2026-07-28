import {
  listTransactions,
  listUncategorizedTransactions,
  addTransactionCategory,
  listCategories,
  getBudgetActuals,
  listBudgets,
  upsertBudget,
  createCategory,
  createManualTransaction,
  createRule,
  getDashboardSummary,
  listDashboardCategorySpend,
  listDashboardMonths,
  listDashboardTrend,
  getAiSettings,
  getEffectiveOpenAiKey,
  insertAiRequest,
  listAccounts,
  listTags,
  addTransactionTag,
} from './db'

const SYSTEM_PROMPT = `You are a personal finance assistant with direct access to the user's financial data. You can read transactions, budgets, and spending summaries, and you can create/update budgets, add categories, add manual transactions, categorize transactions, and create categorization rules.

When the user asks you to categorize their transactions: call list_uncategorized_transactions, then assign categories with categorize_transaction. For payees that recur, ALSO create a rule (create_rule) so future imports categorize automatically — rules beat one-off assignments.

Guidelines:
- Be concise and data-driven. Reference actual numbers when giving advice.
- Use the 50/30/20 rule as a framework (50% needs, 30% wants, 20% savings) but adapt to the user's situation.
- Before giving budget advice, fetch the relevant data first.
- When the user asks you to make a change (set a budget, add a transaction, etc.), do it directly — don't ask for confirmation unless something is ambiguous.
- Currency is EUR. Months are YYYY-MM format (e.g. "2026-05"), dates are YYYY-MM-DD. Years are "YYYY" (e.g. "2026").
- Group types: income, fixed_expense, variable_expense, savings, transfer.

Category discipline (important):
- The category list is intentionally small (~20). Always prefer assigning an EXISTING category — call list_categories first.
- NEVER create merchant- or person-named categories (e.g. "Netflix", "Amazon"). Merchants belong in categorization rules (create_rule), not categories. Netflix → Subscriptions, a supermarket → Groceries.
- Only create a new category if the user explicitly asks for one and no existing category fits the KIND of spending.

IMPORTANT — tool usage:
- For monthly income/expense totals, always use get_spending_summary with a specific month. Do NOT use get_budget_actuals without a month to get monthly figures — it returns the full year's cumulative totals.
- get_budget_actuals without a month returns year-to-date sums across ALL months, not a single month's values. Only use it this way for annual budget comparisons.
- get_budget_actuals with a month returns that single month's actuals — use this when comparing budget vs actual for a specific month.
- Always call get_available_months first to know which months have data before querying a specific month.`

const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'get_available_months',
      description: 'Get the list of months that have transaction data',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_accounts',
      description: 'Get the user\'s bank accounts with current balances (checking, savings, credit card), how many transactions each holds, and how recent each account\'s data is',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spending_summary',
      description: 'Get total income, expenses, and net for a specific month',
      parameters: {
        type: 'object',
        required: ['month'],
        properties: {
          month: { type: 'string', description: 'Month in YYYY-MM format, e.g. "2026-05"' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_category_spending',
      description: 'Get spending broken down by category for a specific month',
      parameters: {
        type: 'object',
        required: ['month'],
        properties: {
          month: { type: 'string', description: 'Month in YYYY-MM format' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_spending_trend',
      description: 'Get income and expense trend over the last N months',
      parameters: {
        type: 'object',
        properties: {
          months: { type: 'number', description: 'Number of months to look back (default 6)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_transactions',
      description: 'Search or list recent transactions',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 20, max 100)' },
          search: { type: 'string', description: 'Search term for payee or purpose' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_uncategorized_transactions',
      description: 'List transactions that have no category yet — use this when helping the user categorize',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'Max results (default 50, max 200)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'categorize_transaction',
      description: 'Assign a category to an existing transaction (get transaction IDs from list_uncategorized_transactions or list_transactions, category IDs from list_categories)',
      parameters: {
        type: 'object',
        required: ['transactionId', 'categoryId'],
        properties: {
          transactionId: { type: 'number', description: 'Transaction ID' },
          categoryId: { type: 'number', description: 'Category ID to assign' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: 'Get all categories with their IDs, names, colors, and group types',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tags',
      description: 'Get all existing tags with usage counts. ALWAYS call this before tagging so you reuse existing tags instead of inventing near-duplicates.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'tag_transaction',
      description: 'Attach tags to a transaction. Tags are cross-cutting labels (a trip, a person, a project, "reimbursable", a one-off like "car-purchase") — never a category duplicate. Reuse existing tags when one fits; names are normalized to lowercase-kebab. Max 2 tags per transaction.',
      parameters: {
        type: 'object',
        required: ['transactionId', 'tags'],
        properties: {
          transactionId: { type: 'number', description: 'Transaction ID' },
          tags: { type: 'array', items: { type: 'string' }, description: 'Tag names, e.g. ["italy-2026"]' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budgets',
      description: 'Get budget targets for a period. Use YYYY for year-level budgets, or YYYY-MM for a specific month.',
      parameters: {
        type: 'object',
        required: ['period'],
        properties: {
          period: { type: 'string', description: 'YYYY for year-level (e.g. "2026") or YYYY-MM for month-specific (e.g. "2026-05")' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_budget_actuals',
      description: 'Get actual spending per category for a year or a specific month. Without a month this returns year-to-date cumulative totals (all months summed). Pass a month to get a single month\'s actuals.',
      parameters: {
        type: 'object',
        required: ['year'],
        properties: {
          year: { type: 'string', description: 'Year, e.g. "2026"' },
          month: { type: 'string', description: 'Optional — YYYY-MM format, e.g. "2026-05". If omitted, returns the full year cumulative total, NOT a monthly figure.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_budget',
      description: 'Create or update a budget target for a category. Use period=YYYY-MM to set a month-specific budget, or period=YYYY for a year-level default.',
      parameters: {
        type: 'object',
        required: ['categoryId', 'period', 'cadence', 'amount'],
        properties: {
          categoryId: { type: 'number', description: 'Category ID (get IDs from list_categories)' },
          period: { type: 'string', description: 'YYYY for year-level default (e.g. "2026") or YYYY-MM for a specific month (e.g. "2026-05")' },
          cadence: { type: 'string', enum: ['monthly', 'annual'], description: 'monthly or annual — use monthly for month-specific periods' },
          amount: { type: 'number', description: 'Budget amount in EUR (positive number)' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_category',
      description: 'Create a new spending category. Use sparingly — prefer existing categories. Never create merchant-named categories (use create_rule to map a merchant to an existing category instead).',
      parameters: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', description: 'Category name describing a KIND of spending (e.g. "Childcare"), never a merchant or person' },
          color: { type: 'string', description: 'Hex color, e.g. "#ff7a7a"' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_transaction',
      description: 'Add a manual transaction',
      parameters: {
        type: 'object',
        required: ['bookingDate', 'amount', 'currency'],
        properties: {
          bookingDate: { type: 'string', description: 'Date in YYYY-MM-DD format' },
          amount: { type: 'number', description: 'Amount — negative for expenses, positive for income' },
          currency: { type: 'string', description: 'Currency code, e.g. "EUR"' },
          payee: { type: 'string', description: 'Payee name' },
          purpose: { type: 'string', description: 'Description or purpose' },
          categoryIds: { type: 'array', items: { type: 'number' }, description: 'Category IDs to assign' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'create_rule',
      description: 'Create a rule that automatically categorizes transactions matching a pattern',
      parameters: {
        type: 'object',
        required: ['matcherType', 'matcherValue', 'categoryId'],
        properties: {
          matcherType: { type: 'string', enum: ['payee', 'purpose', 'iban'], description: 'Field to match on' },
          matcherValue: { type: 'string', description: 'Value to match (contains matching)' },
          categoryId: { type: 'number', description: 'Category ID to assign when rule matches' },
        },
      },
    },
  },
]

async function executeTool(name: string, args: Record<string, unknown>): Promise<unknown> {
  switch (name) {
    case 'get_available_months':
      return listDashboardMonths()

    case 'get_accounts':
      return listAccounts()

    case 'get_spending_summary': {
      const summary = getDashboardSummary(args.month as string)
      if (!summary) return { error: 'No data for that month' }
      return { ...summary, periodType: 'single_month', period: args.month }
    }

    case 'get_category_spending': {
      const rows = listDashboardCategorySpend(args.month as string)
      return { period: args.month, periodType: 'single_month', categories: rows }
    }

    case 'get_spending_trend':
      return listDashboardTrend((args.months as number) ?? 6)

    case 'list_transactions': {
      const limit = Math.min((args.limit as number) ?? 20, 100)
      const result = listTransactions({ limit, search: args.search as string | undefined })
      return result.rows
    }

    case 'list_uncategorized_transactions': {
      const limit = Math.min((args.limit as number) ?? 50, 200)
      const result = listUncategorizedTransactions({ limit })
      return { total: result.total, rows: result.rows }
    }

    case 'categorize_transaction': {
      const ok = addTransactionCategory(args.transactionId as number, args.categoryId as number)
      return { success: ok }
    }

    case 'list_categories':
      return listCategories().rows

    case 'list_tags':
      return listTags().rows

    case 'tag_transaction': {
      const tags = Array.isArray(args.tags) ? (args.tags as string[]) : []
      const added = tags.filter((name) => addTransactionTag(args.transactionId as number, name))
      return { success: true, added }
    }

    case 'get_budgets':
      return listBudgets(args.period as string)

    case 'get_budget_actuals': {
      const actuals = getBudgetActuals(args.year as string, args.month as string | undefined)
      const isMonthly = !!args.month
      return {
        period: isMonthly ? args.month : args.year,
        periodType: isMonthly ? 'single_month' : 'full_year_cumulative',
        warning: isMonthly
          ? undefined
          : `These are YEAR-TO-DATE cumulative totals for all of ${args.year}, not a single month's figures. Do not present these as monthly income or expenses.`,
        actuals,
      }
    }

    case 'set_budget':
      return {
        success: true,
        budgetId: upsertBudget({
          categoryId: args.categoryId as number,
          period: args.period as string,
          cadence: args.cadence as 'monthly' | 'annual',
          amount: args.amount as number,
        }),
      }

    case 'create_category':
      return {
        success: true,
        categoryId: createCategory(args.name as string, args.color as string | undefined),
      }

    case 'add_transaction':
      return {
        success: true,
        transactionId: createManualTransaction({
          bookingDate: args.bookingDate as string,
          amount: args.amount as number,
          currency: args.currency as string,
          payee: (args.payee as string) || null,
          purpose: (args.purpose as string) || null,
          categoryIds: (args.categoryIds as number[]) || [],
        }),
      }

    case 'create_rule':
      return {
        success: true,
        ruleId: createRule({
          matcherType: args.matcherType as string,
          matcherOperator: 'contains',
          matcherValue: args.matcherValue as string,
          categoryId: args.categoryId as number,
          priority: 100,
          isActive: 1,
        }),
      }

    default:
      return { error: `Unknown tool: ${name}` }
  }
}

type OAIMessage =
  | { role: 'system' | 'user' | 'assistant'; content: string }
  | { role: 'assistant'; content: null; tool_calls: OAIToolCall[] }
  | { role: 'tool'; tool_call_id: string; content: string }

type OAIToolCall = {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export type ChatMessage = { role: 'user' | 'assistant'; content: string }

const VIEW_CONTEXT: Record<string, string> = {
  dashboard: 'The user is currently viewing the Dashboard — monthly financial overview with income, spending, net, and category breakdown. Focus on spending trends, savings rate, and month-over-month comparisons.',
  budget: 'The user is currently viewing the Budget — category-level budget targets vs actual spending. Focus on whether they are over/under budget, which categories need adjustment, and recommended budget amounts based on their spending history.',
  transactions: 'The user is currently viewing their Transactions list. Focus on finding, explaining, or analyzing specific transactions. Help identify patterns, unusual charges, or uncategorized items.',
  categorization: 'The user is currently on the Categorization page — reviewing uncategorized transactions and assigning categories. Focus on suggesting categories, creating rules, and improving categorization coverage.',
  categories: 'The user is currently managing their Categories. Focus on category organization, group types (income/fixed_expense/variable_expense/savings/transfer), and whether their category structure makes sense.',
  rules: 'The user is currently managing Categorization Rules. Focus on creating, improving, or explaining rules that auto-categorize transactions by payee, purpose, or IBAN.',
  ai: 'The user is in the Settings view. Answer general questions about their finances.',
}

export async function runChat(
  messages: ChatMessage[],
  onToolCall?: (name: string) => void,
  view?: string,
): Promise<{ reply: string; toolsUsed: string[] }> {
  const settings = getAiSettings()
  if (!settings?.enabled) {
    return { reply: 'AI is not enabled. Please enable it in Settings.', toolsUsed: [] }
  }

  const { key: apiKey } = getEffectiveOpenAiKey()
  if (!apiKey) {
    return { reply: 'No OpenAI API key configured. Add one in Settings.', toolsUsed: [] }
  }

  const toolsUsed: string[] = []
  const viewNote = view && VIEW_CONTEXT[view] ? `\n\nCurrent view context: ${VIEW_CONTEXT[view]}` : ''
  const conversation: OAIMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT + viewNote },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ]

  let totalInputTokens = 0
  let totalOutputTokens = 0

  for (let i = 0; i < 10; i++) {
    const requestBody = {
      model: settings.model,
      messages: conversation,
      tools: TOOLS,
      tool_choice: 'auto',
    }

    let responseText: string
    let responseStatus = 'success'
    let responseError: string | null = null

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(requestBody),
      })

      responseText = await response.text()

      if (!response.ok) {
        responseStatus = 'error'
        responseError = responseText
        insertAiRequest({
          model: settings.model,
          requestPayload: JSON.stringify(requestBody),
          responsePayload: responseText,
          status: 'error',
          error: responseError,
        })
        return { reply: `OpenAI error: ${responseText}`, toolsUsed }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      insertAiRequest({
        model: settings.model,
        requestPayload: JSON.stringify(requestBody),
        status: 'error',
        error: msg,
      })
      return { reply: `Request failed: ${msg}`, toolsUsed }
    }

    const data = JSON.parse(responseText) as {
      choices: Array<{
        message: {
          role: 'assistant'
          content: string | null
          tool_calls?: OAIToolCall[]
        }
      }>
      usage?: { prompt_tokens: number; completion_tokens: number; total_tokens: number }
    }

    const usage = data.usage
    const inputTokens = usage?.prompt_tokens ?? null
    const outputTokens = usage?.completion_tokens ?? null
    const totalTokens = usage?.total_tokens ?? null
    if (inputTokens) totalInputTokens += inputTokens
    if (outputTokens) totalOutputTokens += outputTokens

    const inputCost = settings.inputCostPer1M != null && inputTokens != null
      ? (inputTokens / 1_000_000) * settings.inputCostPer1M
      : null
    const outputCost = settings.outputCostPer1M != null && outputTokens != null
      ? (outputTokens / 1_000_000) * settings.outputCostPer1M
      : null
    const costUsd = inputCost != null && outputCost != null ? inputCost + outputCost : null

    insertAiRequest({
      model: settings.model,
      requestPayload: JSON.stringify(requestBody),
      responsePayload: responseText,
      status: responseStatus,
      error: responseError,
      inputTokens,
      outputTokens,
      totalTokens,
      costUsd,
    })

    const message = data.choices[0].message
    conversation.push(message as OAIMessage)

    if (!message.tool_calls?.length) {
      return { reply: message.content ?? '', toolsUsed }
    }

    for (const toolCall of message.tool_calls) {
      const name = toolCall.function.name
      const args = JSON.parse(toolCall.function.arguments) as Record<string, unknown>
      onToolCall?.(name)
      toolsUsed.push(name)
      const result = await executeTool(name, args)
      conversation.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: JSON.stringify(result),
      })
    }
  }

  return { reply: 'Sorry, I was unable to complete the request.', toolsUsed }
}
