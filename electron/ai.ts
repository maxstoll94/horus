import { getAiSettings, insertAiRequest, upsertAiSuggestions } from './db'

type AiTransactionInput = {
  id: number
  bookingDate: string
  amount: number
  currency: string
  payee: string | null
  purpose: string | null
}

type AiCategoryInput = {
  id: number
  name: string
}

type AiSuggestion = {
  transaction_id: number
  category_id: number
  confidence: number
  reason: string
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
          },
          required: ['transaction_id', 'category_id', 'confidence', 'reason'],
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

function buildPrompt(transactions: AiTransactionInput[], categories: AiCategoryInput[]) {
  return {
    system:
      'You are a precise categorization assistant for bank transactions. ' +
      'Choose the best category_id from the provided list. ' +
      'If unsure, still choose the closest category and set a low confidence.',
    user: JSON.stringify({ transactions, categories }),
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
  categories: AiCategoryInput[]
) {
  const settings = getAiSettings()
  if (!settings.enabled) {
    insertAiRequest({
      model: settings.model,
      status: 'skipped',
      error: 'AI is disabled in settings.',
    })
    return { applied: 0, error: 'AI is disabled in settings.' }
  }

  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    insertAiRequest({
      model: settings.model,
      status: 'error',
      error: 'OPENAI_API_KEY is not set.',
    })
    return { applied: 0, error: 'OPENAI_API_KEY is not set.' }
  }

  const { system, user } = buildPrompt(transactions, categories)

  const requestPayload = JSON.stringify({
    model: settings.model,
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
    text: {
      format: RESPONSE_SCHEMA,
    },
  })

  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: requestPayload,
  })

  if (!response.ok) {
    const errorText = await response.text()
    insertAiRequest({
      model: settings.model,
      requestPayload,
      responsePayload: errorText,
      status: 'error',
      error: errorText || 'OpenAI request failed.',
    })
    return { applied: 0, error: errorText || 'OpenAI request failed.' }
  }

  const payload = await response.json()
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
  const jsonText = extractJsonText(payload)
  if (!jsonText) {
    return { applied: 0, error: 'No JSON response from OpenAI.' }
  }

  let parsed: AiResponse
  try {
    parsed = JSON.parse(jsonText) as AiResponse
  } catch {
    return { applied: 0, error: 'Failed to parse OpenAI response.' }
  }

  if (!parsed.items || parsed.items.length === 0) {
    return { applied: 0, error: 'OpenAI returned no suggestions.' }
  }

  const mapped = parsed.items.map((item) => ({
    transactionId: item.transaction_id,
    categoryId: item.category_id,
    confidence: item.confidence,
    reason: item.reason,
    model: settings.model,
  }))

  upsertAiSuggestions(mapped)

  return { applied: mapped.length }
}
