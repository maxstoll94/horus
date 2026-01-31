/// <reference types="vite/client" />

interface Window {
  api: {
    db: {
      getInfo: () => Promise<{ path: string; schemaVersion: number }>
    }
  }
}
