import {
  addTransactionCategory,
  addTransactionTag,
  getAiSettings,
  getEffectiveOpenAiKey,
  getPayeeCategoryHints,
  insertAiRequest,
  listCategories,
  listTags,
  upsertAiSuggestions,
  upsertAiTagSuggestions,
} from './db'

type AiTransactionInput = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
  iban?: string | null
  method?: string | null
}

type AiCategoryInput = {
  id: number
  name: string
}

type AiTagSuggestion = {
  name: string
  confidence: number
}

type AiSuggestion = {
  transaction_id: number
  category_id: number
  confidence: number
  reason: string
  tags: AiTagSuggestion[]
}

type AiResponse = {
  items: AiSuggestion[]
}

const RESPONSE_SCHEMA = {
  type: 'json_schema',
  name: 'categorization_suggestions',
  strict: true,
  schema: {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            transaction_id: { type: 'integer' },
            category_id: { type: 'integer' },
            confidence: { type: 'number', minimum: 0, maximum: 1 },
            reason: { type: 'string' },
            tags: {
              type: 'array',
              maxItems: 2,
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  confidence: { type: 'number', minimum: 0, maximum: 1 },
                },
                required: ['name', 'confidence'],
                additionalProperties: false,
              },
            },
          },
          required: ['transaction_id', 'category_id', 'confidence', 'reason', 'tags'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  },
} as const

function calculateCostUsd(
  inputCostPer1M: number | null | undefined,
  outputCostPer1M: number | null | undefined,
  inputTokens: number | null | undefined,
  outputTokens: number | null | undefined
) {
  if (
    inputCostPer1M == null ||
    outputCostPer1M == null ||
    inputTokens == null ||
    outputTokens == null
  ) {
    return null
  }
  const inputCost = (inputTokens * inputCostPer1M) / 1_000_000
  const outputCost = (outputTokens * outputCostPer1M) / 1_000_000
  return inputCost + outputCost
}

function buildPrompt(
  transactions: AiTransactionInput[],
  categories: AiCategoryInput[],
  webSearch: boolean,
  knownMappings: Array<{ payee: string; category: string; timesUsed: number }>,
  existingTags: string[]
) {
  return {
    system:
      'You are a precise categorization assistant for bank transactions. ' +
      'Choose the best category_id from the provided list. ' +
      'If unsure, still choose the closest category and set a low confidence. ' +
      'Use every signal available: payee, purpose text, amount, counterparty IBAN ' +
      '(the same IBAN is always the same counterparty even when names differ), and ' +
      'method ("direct debit" = recurring bill/subscription/insurance, "card terminal" = in-person purchase, "credit card" = card purchase). ' +
      'knownMappings lists how the user categorized payees in the past — follow them for identical or clearly similar payees; they take precedence over your own judgment.' +
      (webSearch
        ? ' If a payee is still cryptic or unknown after checking knownMappings, use web search to identify what business it is. Search at most once per unknown payee.'
        : '') +
      ' Also suggest up to 2 tags per transaction — cross-cutting labels (a trip, a person, a project, "reimbursable"), never a category duplicate or merchant name. ' +
      'Unlike categories, prefer creating a new, specific tag when nothing in existingTags fits well — only reuse an existing tag when it is a genuinely good match. ' +
      'Give each tag its own confidence, independent of the category confidence. If no tag fits, return an empty tags array.',
    user: JSON.stringify({ transactions, categories, knownMappings, existingTags }),
  }
}

function extractJsonText(response: any) {
  if (typeof response?.output_text === 'string') {
    return response.output_text
  }

  const output = response?.output
  if (Array.isArray(output)) {
    for (const item of output) {
      const content = item?.content
      if (!Array.isArray(content)) continue
      for (const part of content) {
        if (part?.type === 'output_text' && typeof part?.text === 'string') {
          return part.text
        }
      }
    }
  }

  return null
}

export async function suggestCategories(
  transactions: AiTransactionInput[],
  categories: AiCategoryInput[],
  onProgress?: (status: string) => void
) {
  const settings = getAiSettings()
  if (!settings.enabled) {
    insertAiRequest({
      model: settings.model,
      status: 'skipped',
      error: 'AI is disabled in settings.',
    })
    return { applied: 0, autoApplied: 0, error: 'AI is disabled in settings.' }
  }

  const { key: apiKey } = getEffectiveOpenAiKey()
  if (!apiKey) {
    insertAiRequest({
      model: settings.model,
      status: 'error',
      error: 'No OpenAI API key configured. Set one in Settings.',
    })
    return { applied: 0, autoApplied: 0, error: 'No OpenAI API key configured. Set one in Settings.' }
  }

  const useWebSearch = settings.webSearch === 1
  const knownMappings = getPayeeCategoryHints()
  const existingTags = listTags({ limit: 10000 }).rows.map((tag) => tag.name)
  const { system, user } = buildPrompt(transactions, categories, useWebSearch, knownMappings, existingTags)

  const requestPayload = JSON.stringify({
    model: settings.model,
    stream: true,
    input: [
      {
        role: 'system',
        content: [{ type: 'input_text', text: system }],
      },
      {
        role: 'user',
        content: [{ type: 'input_text', text: user }],
      },
    ],
    ...(useWebSearch ? { tools: [{ type: 'web_search_preview' }] } : {}),
    text: {
      format: RESPONSE_SCHEMA,
    },
  })

  onProgress?.(`Sending ${transactions.length} transactions to ${settings.model}…`)

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: requestPayload,
  })

  if (!response.ok || !response.body) {
    const errorText = await response.text()
    insertAiRequest({
      model: settings.model,
      requestPayload,
      responsePayload: errorText,
      status: 'error',
      error: errorText || 'OpenAI request failed.',
    })
    return { applied: 0, autoApplied: 0, error: errorText || 'OpenAI request failed.' }
  }

  // Stream SSE events so the UI can narrate what the model is doing.
  let payload: any = null
  let streamedText = ''
  let searchCount = 0
  try {
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    const handleEvent = (event: any) => {
      switch (event?.type) {
        case 'response.output_item.added': {
          const itemType = event.item?.type
          if (itemType === 'reasoning') {
            onProgress?.('Thinking…')
          } else if (itemType === 'web_search_call') {
            searchCount += 1
            onProgress?.(`Searching the web (${searchCount})…`)
          } else if (itemType === 'message') {
            onProgress?.('Writing suggestions…')
          }
          break
        }
        case 'response.output_item.done': {
          const item = event.item
          if (item?.type === 'web_search_call' && item?.action?.query) {
            onProgress?.(`Searched: "${item.action.query}"`)
          }
          break
        }
        case 'response.output_text.delta': {
          streamedText += event.delta ?? ''
          const done = (streamedText.match(/"transaction_id"/g) ?? []).length
          if (done > 0) {
            onProgress?.(`Categorizing… ${Math.min(done, transactions.length)}/${transactions.length}`)
          }
          break
        }
        case 'response.completed': {
          payload = event.response
          break
        }
        case 'response.failed': {
          payload = event.response
          break
        }
      }
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const chunks = buffer.split('\n\n')
      buffer = chunks.pop() ?? ''
      for (const chunk of chunks) {
        for (const line of chunk.split('\n')) {
          if (line.startsWith('data: ')) {
            try {
              handleEvent(JSON.parse(line.slice(6)))
            } catch {
              // ignore malformed SSE fragments
            }
          }
        }
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stream read failed.'
    insertAiRequest({
      model: settings.model,
      requestPayload,
      status: 'error',
      error: message,
    })
    return { applied: 0, autoApplied: 0, error: message }
  }

  if (!payload) {
    insertAiRequest({
      model: settings.model,
      requestPayload,
      status: 'error',
      error: 'Stream ended without a completed response.',
    })
    return { applied: 0, autoApplied: 0, error: 'Stream ended without a completed response.' }
  }

  if (payload.status === 'failed') {
    const message = payload.error?.message ?? 'OpenAI request failed.'
    insertAiRequest({
      model: settings.model,
      requestPayload,
      responsePayload: JSON.stringify(payload),
      status: 'error',
      error: message,
    })
    return { applied: 0, autoApplied: 0, error: message }
  }
  const inputTokens =
    typeof payload?.usage?.input_tokens === 'number'
      ? payload.usage.input_tokens
      : null
  const outputTokens =
    typeof payload?.usage?.output_tokens === 'number'
      ? payload.usage.output_tokens
      : null
  const totalTokens =
    typeof payload?.usage?.total_tokens === 'number'
      ? payload.usage.total_tokens
      : inputTokens != null && outputTokens != null
      ? inputTokens + outputTokens
      : null
  const costUsd = calculateCostUsd(
    settings.inputCostPer1M,
    settings.outputCostPer1M,
    inputTokens,
    outputTokens
  )
  insertAiRequest({
    model: settings.model,
    requestPayload,
    responsePayload: JSON.stringify(payload),
    status: 'success',
    inputTokens,
    outputTokens,
    totalTokens,
    costUsd,
  })
  const jsonText = extractJsonText(payload) || (streamedText || null)
  if (!jsonText) {
    return { applied: 0, autoApplied: 0, error: 'No JSON response from OpenAI.' }
  }

  let parsed: AiResponse
  try {
    parsed = JSON.parse(jsonText) as AiResponse
  } catch {
    return { applied: 0, autoApplied: 0, error: 'Failed to parse OpenAI response.' }
  }

  if (!parsed.items || parsed.items.length === 0) {
    return { applied: 0, autoApplied: 0, error: 'OpenAI returned no suggestions.' }
  }

  const mapped = parsed.items.map((item) => ({
    transactionId: item.transaction_id,
    categoryId: item.category_id,
    confidence: item.confidence,
    reason: item.reason,
    model: settings.model,
  }))

  upsertAiSuggestions(mapped)

  const tagRows = parsed.items.flatMap((item) =>
    (item.tags ?? []).map((tag) => ({
      transactionId: item.transaction_id,
      tagName: tag.name,
      confidence: tag.confidence,
      model: settings.model,
    }))
  )
  upsertAiTagSuggestions(tagRows)

  // Auto-apply high-confidence suggestions; the rest stay for manual review.
  // Transfer categories get a stricter bar: a wrongly-applied transfer hides
  // real income/expenses from all totals, so it must clear 0.95.
  const threshold = settings.confidenceThreshold ?? 0.9
  const transferCategoryIds = new Set(
    listCategories({ limit: 1000 }).rows
      .filter((cat) => cat.groupType === 'transfer')
      .map((cat) => cat.id)
  )
  let autoApplied = 0
  for (const item of mapped) {
    const required = transferCategoryIds.has(item.categoryId)
      ? Math.max(threshold, 0.95)
      : threshold
    if (item.confidence >= required) {
      if (addTransactionCategory(item.transactionId, item.categoryId)) {
        autoApplied += 1
      }
    }
  }
  if (autoApplied > 0) {
    onProgress?.(`Auto-applied ${autoApplied} categories at ≥${Math.round(threshold * 100)}% confidence`)
  }

  // Tags auto-apply independently of category confidence — no interaction
  // with the stricter transfer-category floor above, which is category-only.
  let autoAppliedTags = 0
  for (const tagRow of tagRows) {
    if (tagRow.confidence >= threshold) {
      if (addTransactionTag(tagRow.transactionId, tagRow.tagName)) {
        autoAppliedTags += 1
      }
    }
  }
  if (autoAppliedTags > 0) {
    onProgress?.(`Auto-applied ${autoAppliedTags} tags at ≥${Math.round(threshold * 100)}% confidence`)
  }

  return { applied: mapped.length, autoApplied, autoAppliedTags }
}
