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
  }
}
