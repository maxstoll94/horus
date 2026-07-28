/// <reference types="vite/client" />

interface Window {
  api: {
    db: {
      getInfo: () => Promise<{ path: string; schemaVersion: number }>
      clearAndReset: () => Promise<{ success: boolean }>
      clearTransactions: () => Promise<{ success: boolean }>
    }
    chat: {
      send: (messages: Array<{ role: 'user' | 'assistant'; content: string }>, view?: string) => Promise<{
        reply: string
        toolsUsed: string[]
      }>
      onToolCall: (callback: (toolName: string) => void) => () => void
      sessions: {
        list: () => Promise<Array<{ id: number; title: string; messageCount: number; createdAt: string; updatedAt: string | null }>>
        get: (id: number) => Promise<{ id: number; title: string; messages: Array<{ role: 'user' | 'assistant'; content: string }>; createdAt: string; updatedAt: string | null } | null>
        create: (title: string, messages: Array<{ role: string; content: string }>) => Promise<number>
        update: (id: number, messages: Array<{ role: string; content: string }>) => Promise<void>
        delete: (id: number) => Promise<void>
      }
    }
    import: {
      pickFile: (provider?: 'dkb' | 'ing' | 'sparkasse' | 'volksbank') => Promise<string | null>
      dkb: (filePath: string) => Promise<{
        success: boolean
        inserted?: number
        skipped?: number
        warnings?: string[]
        error?: string
      }>
      ing: (filePath: string) => Promise<{
        success: boolean
        inserted?: number
        skipped?: number
        warnings?: string[]
        error?: string
      }>
      sparkasse: (filePath: string) => Promise<{
        success: boolean
        inserted?: number
        skipped?: number
        warnings?: string[]
        error?: string
      }>
      volksbank: (filePath: string) => Promise<{
        success: boolean
        inserted?: number
        skipped?: number
        warnings?: string[]
        error?: string
      }>
    }
    transactions: {
      list: (filters?: {
        limit?: number
        offset?: number
        search?: string
        accountIds?: number[]
      }) => Promise<{
        rows: Array<{
          id: number
          bookingDate: string
          amount: number
          currency: string
          payee: string | null
          purpose: string | null
          categoryCount: number
          source: string
          accountName?: string | null
        }>
        total: number
      }>
      listUncategorized: (filters?: { limit?: number; offset?: number; accountIds?: number[] }) => Promise<{
        rows: Array<{
          id: number
          bookingDate: string
          amount: number
          currency: string
          payee: string | null
          purpose: string | null
          categoryCount: number
          source: string
          iban?: string | null
          method?: string | null
        }>
        total: number
      }>
      listCategorized: (filters?: {
        limit?: number
        offset?: number
        categoryIds?: number[]
        accountIds?: number[]
      }) => Promise<{
        rows: Array<{
          id: number
          bookingDate: string
          amount: number
          currency: string
          payee: string | null
          purpose: string | null
          categoryCount: number
          source: string
          categoryId: number
          categoryName: string
        }>
        total: number
      }>
      listByTag: (payload: { tagId: number; limit?: number; offset?: number; accountIds?: number[] }) => Promise<{
        rows: Array<{
          id: number
          bookingDate: string
          amount: number
          currency: string
          payee: string | null
          purpose: string | null
        }>
        total: number
      }>
      addCategory: (payload: { transactionId: number; categoryId: number }) => Promise<boolean>
      removeCategory: (payload: { transactionId: number; categoryId: number }) => Promise<boolean>
      delete: (payload: { id: number }) => Promise<boolean>
      createManual: (payload: {
        bookingDate: string
        amount: number
        currency: string
        payee?: string | null
        purpose?: string | null
        account?: string | null
        categoryIds?: number[]
      }) => Promise<number | null>
      update: (payload: {
        id: number
        bookingDate?: string
        amount?: number
        currency?: string
        payee?: string | null
        purpose?: string | null
        account?: string | null
      }) => Promise<boolean>
    }
    categories: {
      list: (filters?: {
        limit?: number
        offset?: number
        search?: string
      }) => Promise<{
        rows: Array<{
          id: number
          name: string
          color: string | null
          isActive: number
          groupType: string
          displayOrder: number
        }>
        total: number
      }>
      create: (payload: { name: string; color?: string | null }) => Promise<number | null>
      update: (payload: {
        id: number
        name?: string
        color?: string | null
        isActive?: number
      }) => Promise<boolean>
      delete: (payload: { id: number }) => Promise<{
        deleted: boolean
        archived: boolean
      }>
      updateGroup: (payload: { id: number; groupType: string; displayOrder?: number }) => Promise<boolean>
    }
    rules: {
      list: (filters?: {
        limit?: number
        offset?: number
        search?: string
      }) => Promise<{
        rows: Array<{
          id: number
          matcherType: string
          matcherOperator: string
          matcherValue: string
          categoryId: number
          priority: number
          isActive: number
          tagIds: number[]
        }>
        total: number
      }>
      create: (payload: {
        matcherType: string
        matcherOperator?: string
        matcherValue: string
        categoryId: number
        priority?: number
        isActive?: number
        tagIds?: number[]
      }) => Promise<number | null>
      update: (payload: {
        id: number
        matcherType?: string
        matcherOperator?: string
        matcherValue?: string
        categoryId?: number
        priority?: number
        isActive?: number
        tagIds?: number[]
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
        webSearch: number
        apiKey: string | null
      }>
      updateSettings: (payload: {
        model?: string
        enabled?: number
        confidenceThreshold?: number
        inputCostPer1M?: number | null
        outputCostPer1M?: number | null
        webSearch?: number
        apiKey?: string | null
      }) => Promise<{
        id: number
        model: string
        enabled: number
        confidenceThreshold: number
        inputCostPer1M: number | null
        outputCostPer1M: number | null
        webSearch: number
        apiKey: string | null
      }>
      keyStatus: () => Promise<{ present: boolean; source: 'settings' | 'env' | null }>
      onSuggestProgress: (callback: (status: string) => void) => () => void
      suggest: (payload: {
        transactions: Array<{
          id: number
          bookingDate: string
          amount: number
          currency: string
          payee: string | null
          purpose: string | null
          iban?: string | null
          method?: string | null
        }>
        categories: Array<{ id: number; name: string }>
      }) => Promise<{ applied: number; error?: string }>
      suggestAll: () => Promise<{
        applied: number
        autoApplied: number
        autoAppliedTags: number
        batches: number
        error?: string
        warnings?: string[]
      }>
      suggestions: (payload: { transactionIds: number[] }) => Promise<Array<{
        transactionId: number
        categoryId: number
        confidence: number
        reason: string | null
        model: string | null
      }>>
      tagSuggestions: (payload: { transactionIds: number[] }) => Promise<Array<{
        transactionId: number
        tagName: string
        confidence: number
        model: string | null
      }>>
      listRequests: (payload?: { limit?: number; offset?: number }) => Promise<{
        rows: Array<{
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
        }>
        total: number
      }>
    }
    dashboard: {
      months: () => Promise<string[]>
      summary: (payload: { month: string; accountIds?: number[] }) => Promise<{
        month: string
        totalIncome: number
        totalSpend: number
        net: number
        transactionCount: number
        categorizedCount: number
        uncategorizedCount: number
      } | null>
      categories: (payload: { month: string; accountIds?: number[] }) => Promise<Array<{
        categoryId: number
        categoryName: string
        categoryColor: string | null
        totalSpend: number
        totalIncome: number
        transactionCount: number
      }>>
      summaryRange: (payload: {
        startMonth: string
        endMonth: string
        accountIds?: number[]
      }) => Promise<{
        month: string
        totalIncome: number
        totalSpend: number
        net: number
        transactionCount: number
        categorizedCount: number
        uncategorizedCount: number
      } | null>
      categoriesRange: (payload: {
        startMonth: string
        endMonth: string
        accountIds?: number[]
      }) => Promise<Array<{
        categoryId: number
        categoryName: string
        categoryColor: string | null
        totalSpend: number
        totalIncome: number
        transactionCount: number
      }>>
      trend: (payload?: { months?: number; accountIds?: number[] }) => Promise<Array<{
        month: string
        totalSpend: number
        totalIncome: number
        net: number
      }>>
      tags: (payload: { month: string; accountIds?: number[] }) => Promise<Array<{
        tagId: number
        tagName: string
        totalSpend: number
        totalIncome: number
        transactionCount: number
      }>>
      tagsRange: (payload: {
        startMonth: string
        endMonth: string
        accountIds?: number[]
      }) => Promise<Array<{
        tagId: number
        tagName: string
        totalSpend: number
        totalIncome: number
        transactionCount: number
      }>>
    }
    tags: {
      list: (filters?: {
        limit?: number
        offset?: number
        search?: string
      }) => Promise<{ rows: Array<{ id: number; name: string; usageCount: number }>; total: number }>
      create: (payload: { name: string }) => Promise<number | null>
      rename: (payload: { id: number; name: string }) => Promise<boolean>
      delete: (payload: { id: number }) => Promise<boolean>
      forTransactions: (payload: { transactionIds: number[] }) => Promise<Array<{
        transactionId: number
        tagId: number
        name: string
      }>>
      addToTransaction: (payload: { transactionId: number; name: string }) => Promise<boolean>
      removeFromTransaction: (payload: { transactionId: number; tagId: number }) => Promise<boolean>
    }
    accounts: {
      list: () => Promise<Array<{
        id: number
        name: string
        bank: string | null
        type: string
        identifier: string | null
        anchorBalance: number | null
        anchorDate: string | null
        currentBalance: number | null
        transactionCount: number
        lastBookingDate: string | null
      }>>
      update: (payload: {
        id: number
        name?: string
        type?: string
        anchorBalance?: number | null
        anchorDate?: string | null
      }) => Promise<boolean>
      delete: (payload: { id: number }) => Promise<boolean>
    }
    budgets: {
      list: (payload: { period: string }) => Promise<Array<{
        id: number
        categoryId: number
        categoryName: string
        categoryColor: string | null
        groupType: string
        period: string
        cadence: string
        amount: number
        notes: string | null
        createdAt: string
        updatedAt: string | null
      }>>
      upsert: (payload: {
        categoryId: number
        period: string
        cadence: string
        amount: number
        notes?: string | null
      }) => Promise<number | null>
      delete: (payload: { id: number }) => Promise<boolean>
      actuals: (payload: { year: string; month?: string; accountIds?: number[] }) => Promise<Array<{
        categoryId: number
        categoryName: string
        groupType: string
        actual: number
      }>>
      copyFromYear: (payload: { fromYear: string; toYear: string }) => Promise<{ copied: number }>
    }
  }
}
