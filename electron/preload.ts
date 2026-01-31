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
  },
  import: {
    pickFile: () => ipcRenderer.invoke('import:pick-file'),
    dkb: (filePath: string) => ipcRenderer.invoke('import:dkb', filePath),
  },
  transactions: {
    list: (filters?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('transactions:list', filters),
    listUncategorized: (filters?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('transactions:uncategorized', filters),
    listCategorized: (filters?: { limit?: number; offset?: number }) =>
      ipcRenderer.invoke('transactions:categorized', filters),
    addCategory: (payload: { transactionId: number; categoryId: number }) =>
      ipcRenderer.invoke('transactions:add-category', payload),
    removeCategory: (payload: { transactionId: number; categoryId: number }) =>
      ipcRenderer.invoke('transactions:remove-category', payload),
  },
  categories: {
    list: () => ipcRenderer.invoke('categories:list'),
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
  },
  rules: {
    list: () => ipcRenderer.invoke('rules:list'),
    create: (payload: {
      matcherType: string
      matcherValue: string
      categoryId: number
      priority?: number
      isActive?: number
    }) => ipcRenderer.invoke('rules:create', payload),
    update: (payload: {
      id: number
      matcherType?: string
      matcherValue?: string
      categoryId?: number
      priority?: number
      isActive?: number
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
    }) => ipcRenderer.invoke('ai:settings:update', payload),
    keyStatus: () => ipcRenderer.invoke('ai:key:status'),
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
    }) => ipcRenderer.invoke('ai:suggest', payload),
    suggestions: (payload: { transactionIds: number[] }) =>
      ipcRenderer.invoke('ai:suggestions', payload),
    listRequests: (payload?: { limit?: number }) =>
      ipcRenderer.invoke('ai:requests:list', payload ?? {}),
  },
  dashboard: {
    months: () => ipcRenderer.invoke('dashboard:months'),
    summary: (payload: { month: string }) =>
      ipcRenderer.invoke('dashboard:summary', payload),
    categories: (payload: { month: string }) =>
      ipcRenderer.invoke('dashboard:categories', payload),
    trend: (payload?: { months?: number }) =>
      ipcRenderer.invoke('dashboard:trend', payload ?? {}),
  },
})
