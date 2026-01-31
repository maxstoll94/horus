import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import {
  addTransactionCategory,
  closeDatabase,
  createCategory,
  getDatabaseInfo,
  initializeDatabase,
  insertImport,
  insertTransactions,
  listCategories,
  listCategorizedTransactions,
  listTransactions,
  listUncategorizedTransactions,
  removeTransactionCategory,
  updateCategory,
} from './db'
import { parseDkbCsv } from './importers/dkb'

const require = createRequire(import.meta.url)
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.mjs
// │
process.env.APP_ROOT = path.join(__dirname, '..')

// 🚧 Use ['ENV_NAME'] avoid vite:define plugin - Vite@2.x
export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null

function createWindow() {
  win = new BrowserWindow({
    icon: path.join(process.env.VITE_PUBLIC, 'electron-vite.svg'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
    },
    show: false,
  })

  win.maximize()
  win.show()

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
  } else {
    // win.loadFile('dist/index.html')
    win.loadFile(path.join(RENDERER_DIST, 'index.html'))
  }
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
    win = null
  }
})

app.on('before-quit', () => {
  closeDatabase()
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

app.whenReady().then(() => {
  initializeDatabase()
  ipcMain.handle('db:get-info', () => getDatabaseInfo())
  ipcMain.handle('categories:list', () => listCategories())
  ipcMain.handle('categories:create', (_event, payload) => {
    const name = typeof payload?.name === 'string' ? payload.name.trim() : ''
    if (!name) {
      return null
    }
    return createCategory(name, payload?.color)
  })
  ipcMain.handle('categories:update', (_event, payload) => {
    if (!payload?.id) {
      return false
    }
    return updateCategory(payload.id, {
      name: payload?.name,
      color: payload?.color,
      isActive: payload?.isActive,
    })
  })
  ipcMain.handle('transactions:list', (_event, filters) =>
    listTransactions(filters)
  )
  ipcMain.handle('transactions:uncategorized', (_event, filters) =>
    listUncategorizedTransactions(filters)
  )
  ipcMain.handle('transactions:categorized', (_event, filters) =>
    listCategorizedTransactions(filters)
  )
  ipcMain.handle('transactions:add-category', (_event, payload) => {
    if (!payload?.transactionId || !payload?.categoryId) {
      return false
    }
    return addTransactionCategory(payload.transactionId, payload.categoryId)
  })
  ipcMain.handle('transactions:remove-category', (_event, payload) => {
    if (!payload?.transactionId || !payload?.categoryId) {
      return false
    }
    return removeTransactionCategory(payload.transactionId, payload.categoryId)
  })
  ipcMain.handle('import:pick-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select DKB CSV file',
      properties: ['openFile'],
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    })

    if (result.canceled || result.filePaths.length === 0) {
      return null
    }

    return result.filePaths[0]
  })
  ipcMain.handle('import:dkb', async (_event, filePath: string) => {
    if (!filePath) {
      return { success: false, error: 'No file path provided.' }
    }

    const contents = await readFile(filePath, 'utf-8')
    const { transactions, warnings } = parseDkbCsv(contents)

    if (transactions.length === 0) {
      return { success: false, error: 'No transactions found.', warnings }
    }

    insertImport('dkb', path.basename(filePath))
    const { inserted, skipped } = insertTransactions(transactions)

    return {
      success: true,
      inserted,
      skipped,
      warnings,
    }
  })
  createWindow()
})
