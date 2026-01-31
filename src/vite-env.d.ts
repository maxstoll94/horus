/// <reference types="vite/client" />

interface Window {
  api: {
    db: {
      getInfo: () => Promise<{ path: string; schemaVersion: number }>
    }
    import: {
      pickFile: () => Promise<string | null>
      dkb: (filePath: string) => Promise<{
        success: boolean
        inserted?: number
        skipped?: number
        warnings?: string[]
        error?: string
      }>
    }
    transactions: {
      list: (filters?: { limit?: number; offset?: number }) => Promise<Array<{
        id: number
        bookingDate: string
        amount: number
        currency: string
        payee: string | null
        purpose: string | null
        categoryCount: number
      }>>
      listUncategorized: (filters?: { limit?: number; offset?: number }) => Promise<Array<{
        id: number
        bookingDate: string
        amount: number
        currency: string
        payee: string | null
        purpose: string | null
        categoryCount: number
      }>>
      listCategorized: (filters?: { limit?: number; offset?: number }) => Promise<Array<{
        id: number
        bookingDate: string
        amount: number
        currency: string
        payee: string | null
        purpose: string | null
        categoryCount: number
        categoryId: number
        categoryName: string
      }>>
      addCategory: (payload: { transactionId: number; categoryId: number }) => Promise<boolean>
      removeCategory: (payload: { transactionId: number; categoryId: number }) => Promise<boolean>
    }
    categories: {
      list: () => Promise<Array<{
        id: number
        name: string
        color: string | null
        isActive: number
      }>>
      create: (payload: { name: string; color?: string | null }) => Promise<number | null>
      update: (payload: {
        id: number
        name?: string
        color?: string | null
        isActive?: number
      }) => Promise<boolean>
    }
    rules: {
      list: () => Promise<Array<{
        id: number
        matcherType: string
        matcherValue: string
        categoryId: number
        priority: number
        isActive: number
      }>>
      create: (payload: {
        matcherType: string
        matcherValue: string
        categoryId: number
        priority?: number
        isActive?: number
      }) => Promise<number | null>
      update: (payload: {
        id: number
        matcherType?: string
        matcherValue?: string
        categoryId?: number
        priority?: number
        isActive?: number
      }) => Promise<boolean>
      delete: (payload: { id: number }) => Promise<boolean>
      apply: () => Promise<{ applied: number; transactionsMatched: number }>
    }
    ai: {
      getSettings: () => Promise<{
        id: number
        model: string
        enabled: number
        confidenceThreshold: number
        inputCostPer1M: number | null
        outputCostPer1M: number | null
      }>
      updateSettings: (payload: {
        model?: string
        enabled?: number
        confidenceThreshold?: number
        inputCostPer1M?: number | null
        outputCostPer1M?: number | null
      }) => Promise<{
        id: number
        model: string
        enabled: number
        confidenceThreshold: number
        inputCostPer1M: number | null
        outputCostPer1M: number | null
      }>
      keyStatus: () => Promise<{ present: boolean }>
      suggest: (payload: {
        transactions: Array<{
          id: number
          bookingDate: string
          amount: number
          currency: string
          payee: string | null
          purpose: string | null
        }>
        categories: Array<{ id: number; name: string }>
      }) => Promise<{ applied: number; error?: string }>
      suggestions: (payload: { transactionIds: number[] }) => Promise<Array<{
        transactionId: number
        categoryId: number
        confidence: number
        reason: string | null
        model: string | null
      }>>
      listRequests: (payload?: { limit?: number }) => Promise<Array<{
        id: number
        model: string | null
        requestPayload: string | null
        responsePayload: string | null
        status: string
        error: string | null
        inputTokens: number | null
        outputTokens: number | null
        totalTokens: number | null
        costUsd: number | null
        createdAt: string
      }>>
    }
  }
}
