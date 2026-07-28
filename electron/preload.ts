import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },

  // You can expose other APTs you need here.
  // ...
})

contextBridge.exposeInMainWorld('api', {
  db: {
    getInfo: () => ipcRenderer.invoke('db:get-info'),
    clearAndReset: () => ipcRenderer.invoke('db:clear-and-reset'),
    clearTransactions: () => ipcRenderer.invoke('db:clear-transactions'),
  },
  chat: {
    send: (messages: Array<{ role: 'user' | 'assistant'; content: string }>, view?: string) =>
      ipcRenderer.invoke('ai:chat', { messages, view }),
    onToolCall: (callback: (toolName: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, toolName: string) => callback(toolName)
      ipcRenderer.on('ai:chat:tool-call', handler)
      return () => ipcRenderer.off('ai:chat:tool-call', handler)
    },
    sessions: {
      list: () => ipcRenderer.invoke('chat:sessions:list'),
      get: (id: number) => ipcRenderer.invoke('chat:sessions:get', { id }),
      create: (title: string, messages: Array<{ role: string; content: string }>) =>
        ipcRenderer.invoke('chat:sessions:create', { title, messages }),
      update: (id: number, messages: Array<{ role: string; content: string }>) =>
        ipcRenderer.invoke('chat:sessions:update', { id, messages }),
      delete: (id: number) => ipcRenderer.invoke('chat:sessions:delete', { id }),
    },
  },
  import: {
    pickFile: (provider?: 'dkb' | 'ing' | 'sparkasse' | 'volksbank') =>
      ipcRenderer.invoke('import:pick-file', provider),
    dkb: (filePath: string) => ipcRenderer.invoke('import:dkb', filePath),
    ing: (filePath: string) => ipcRenderer.invoke('import:ing', filePath),
    sparkasse: (filePath: string) => ipcRenderer.invoke('import:sparkasse', filePath),
    volksbank: (filePath: string) => ipcRenderer.invoke('import:volksbank', filePath),
  },
  transactions: {
    list: (filters?: { limit?: number; offset?: number; search?: string; accountIds?: number[] }) =>
      ipcRenderer.invoke('transactions:list', filters),
    listUncategorized: (filters?: { limit?: number; offset?: number; accountIds?: number[] }) =>
      ipcRenderer.invoke('transactions:uncategorized', filters),
    listCategorized: (filters?: {
      limit?: number
      offset?: number
      categoryIds?: number[]
      accountIds?: number[]
    }) =>
      ipcRenderer.invoke('transactions:categorized', filters),
    listByTag: (payload: { tagId: number; limit?: number; offset?: number; accountIds?: number[] }) =>
      ipcRenderer.invoke('transactions:by-tag', payload),
    addCategory: (payload: { transactionId: number; categoryId: number }) =>
      ipcRenderer.invoke('transactions:add-category', payload),
    removeCategory: (payload: { transactionId: number; categoryId: number }) =>
      ipcRenderer.invoke('transactions:remove-category', payload),
    delete: (payload: { id: number }) =>
      ipcRenderer.invoke('transactions:delete', payload),
    createManual: (payload: {
      bookingDate: string; amount: number; currency: string;
      payee?: string | null; purpose?: string | null; account?: string | null; categoryIds?: number[]
    }) => ipcRenderer.invoke('transactions:create-manual', payload),
    update: (payload: {
      id: number; bookingDate?: string; amount?: number; currency?: string;
      payee?: string | null; purpose?: string | null; account?: string | null
    }) => ipcRenderer.invoke('transactions:update', payload),
  },
  categories: {
    list: (filters?: { limit?: number; offset?: number; search?: string }) =>
      ipcRenderer.invoke('categories:list', filters),
    create: (payload: { name: string; color?: string | null }) =>
      ipcRenderer.invoke('categories:create', payload),
    update: (payload: {
      id: number
      name?: string
      color?: string | null
      isActive?: number
    }) => ipcRenderer.invoke('categories:update', payload),
    delete: (payload: { id: number }) =>
      ipcRenderer.invoke('categories:delete', payload),
    updateGroup: (payload: { id: number; groupType: string; displayOrder?: number }) =>
      ipcRenderer.invoke('categories:update-group', payload),
  },
  rules: {
    list: (filters?: { limit?: number; offset?: number; search?: string }) =>
      ipcRenderer.invoke('rules:list', filters),
    create: (payload: {
      matcherType: string
      matcherValue: string
      categoryId: number
      priority?: number
      isActive?: number
      tagIds?: number[]
    }) => ipcRenderer.invoke('rules:create', payload),
    update: (payload: {
      id: number
      matcherType?: string
      matcherValue?: string
      categoryId?: number
      priority?: number
      isActive?: number
      tagIds?: number[]
    }) => ipcRenderer.invoke('rules:update', payload),
    delete: (payload: { id: number }) => ipcRenderer.invoke('rules:delete', payload),
    apply: () => ipcRenderer.invoke('rules:apply'),
  },
  ai: {
    getSettings: () => ipcRenderer.invoke('ai:settings:get'),
    updateSettings: (payload: {
      model?: string
      enabled?: number
      confidenceThreshold?: number
      inputCostPer1M?: number | null
      outputCostPer1M?: number | null
      webSearch?: number
      apiKey?: string | null
    }) => ipcRenderer.invoke('ai:settings:update', payload),
    keyStatus: () => ipcRenderer.invoke('ai:key:status'),
    onSuggestProgress: (callback: (status: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: string) => callback(status)
      ipcRenderer.on('ai:suggest:progress', handler)
      return () => ipcRenderer.off('ai:suggest:progress', handler)
    },
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
    }) => ipcRenderer.invoke('ai:suggest', payload),
    suggestAll: () => ipcRenderer.invoke('ai:suggest-all'),
    suggestions: (payload: { transactionIds: number[] }) =>
      ipcRenderer.invoke('ai:suggestions', payload),
    tagSuggestions: (payload: { transactionIds: number[] }) =>
      ipcRenderer.invoke('ai:tag-suggestions', payload),
    listRequests: (payload?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('ai:requests:list', payload ?? {}),
  },
  dashboard: {
    months: () => ipcRenderer.invoke('dashboard:months'),
    summary: (payload: { month: string; accountIds?: number[] }) =>
      ipcRenderer.invoke('dashboard:summary', payload),
    categories: (payload: { month: string; accountIds?: number[] }) =>
      ipcRenderer.invoke('dashboard:categories', payload),
    summaryRange: (payload: { startMonth: string; endMonth: string; accountIds?: number[] }) =>
      ipcRenderer.invoke('dashboard:summary:range', payload),
    categoriesRange: (payload: { startMonth: string; endMonth: string; accountIds?: number[] }) =>
      ipcRenderer.invoke('dashboard:categories:range', payload),
    trend: (payload?: { months?: number; accountIds?: number[] }) =>
      ipcRenderer.invoke('dashboard:trend', payload ?? {}),
    tags: (payload: { month: string; accountIds?: number[] }) =>
      ipcRenderer.invoke('dashboard:tags', payload),
    tagsRange: (payload: { startMonth: string; endMonth: string; accountIds?: number[] }) =>
      ipcRenderer.invoke('dashboard:tags:range', payload),
  },
  tags: {
    list: (filters?: { limit?: number; offset?: number; search?: string }) =>
      ipcRenderer.invoke('tags:list', filters),
    create: (payload: { name: string }) => ipcRenderer.invoke('tags:create', payload),
    rename: (payload: { id: number; name: string }) => ipcRenderer.invoke('tags:rename', payload),
    delete: (payload: { id: number }) => ipcRenderer.invoke('tags:delete', payload),
    forTransactions: (payload: { transactionIds: number[] }) =>
      ipcRenderer.invoke('transactions:tags:list', payload),
    addToTransaction: (payload: { transactionId: number; name: string }) =>
      ipcRenderer.invoke('transactions:tags:add', payload),
    removeFromTransaction: (payload: { transactionId: number; tagId: number }) =>
      ipcRenderer.invoke('transactions:tags:remove', payload),
  },
  accounts: {
    list: () => ipcRenderer.invoke('accounts:list'),
    update: (payload: {
      id: number
      name?: string
      type?: string
      anchorBalance?: number | null
      anchorDate?: string | null
    }) => ipcRenderer.invoke('accounts:update', payload),
    delete: (payload: { id: number }) => ipcRenderer.invoke('accounts:delete', payload),
  },
  budgets: {
    list: (payload: { period: string }) => ipcRenderer.invoke('budgets:list', payload),
    upsert: (payload: { categoryId: number; period: string; cadence: string; amount: number; notes?: string | null }) =>
      ipcRenderer.invoke('budgets:upsert', payload),
    delete: (payload: { id: number }) => ipcRenderer.invoke('budgets:delete', payload),
    actuals: (payload: { year: string; month?: string; accountIds?: number[] }) => ipcRenderer.invoke('budgets:actuals', payload),
    copyFromYear: (payload: { fromYear: string; toYear: string }) => ipcRenderer.invoke('budgets:copy-from-year', payload),
  },
})
