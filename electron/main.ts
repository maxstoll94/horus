import 'dotenv/config'
import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron'
import { autoUpdater } from 'electron-updater'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { readFile } from 'node:fs/promises'
import crypto from 'node:crypto'
import {
  addTransactionCategory,
  closeDatabase,
  createRule,
  createCategory,
  deleteRule,
  getDatabaseInfo,
  initializeDatabase,
  applyRulesToUncategorized,
  getAiSettings,
  listAiRequests,
  getAiSuggestionsForTransactions,
  getDashboardSummary,
  getDashboardSummaryRange,
  insertImport,
  insertTransactions,
  hasImportHash,
  listDashboardCategorySpend,
  listDashboardCategorySpendRange,
  listDashboardMonths,
  listDashboardTrend,
  listCategories,
  listCategorizedTransactions,
  listRules,
  listTransactions,
  listUncategorizedTransactions,
  removeTransactionCategory,
  updateAiSettings,
  updateRule,
  updateCategory,
  deleteCategory,
  deleteTransaction,
} from './db'
import { parseDkbCsv } from './importers/dkb'
import { parseIngCsv } from './importers/ing'
import type { ImportProvider } from './importers/types'
import { suggestCategories } from './ai'

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
    icon: path.join(process.env.VITE_PUBLIC, 'horus-icon.ico'),
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

// electron-updater can install updates unattended on Windows, but refuses to
// on unsigned macOS builds — there it's used for detection only, linking out
// to the release page instead. Offline use is the norm for this app, so
// failures (e.g. no network, no GitHub release yet) are logged and ignored.
function setupAutoUpdater() {
  autoUpdater.autoDownload = false

  autoUpdater.on('update-available', (info) => {
    if (process.platform === 'win32') {
      autoUpdater.downloadUpdate()
      return
    }

    dialog
      .showMessageBox({
        type: 'info',
        message: `Horus ${info.version} is available`,
        detail: 'Download the latest version from GitHub to update.',
        buttons: ['Download', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          shell.openExternal('https://github.com/maxstoll94/horus/releases/latest')
        }
      })
  })

  autoUpdater.on('update-downloaded', () => {
    dialog
      .showMessageBox({
        type: 'info',
        message: 'Update ready to install',
        detail: 'Restart Horus now to finish updating?',
        buttons: ['Restart', 'Later'],
        defaultId: 0,
        cancelId: 1,
      })
      .then(({ response }) => {
        if (response === 0) {
          autoUpdater.quitAndInstall()
        }
      })
  })

  autoUpdater.on('error', (error) => {
    console.error('autoUpdater error', error)
  })

  autoUpdater.checkForUpdates().catch((error) => {
    console.error('autoUpdater checkForUpdates failed', error)
  })
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
  if (app.isPackaged) {
    setupAutoUpdater()
  }
  initializeDatabase()
  ipcMain.handle('db:get-info', () => getDatabaseInfo())
  ipcMain.handle('categories:list', (_event, filters) => listCategories(filters))
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
  ipcMain.handle('categories:delete', (_event, payload) => {
    if (!payload?.id) {
      return { deleted: false, archived: false }
    }
    return deleteCategory(payload.id)
  })
  ipcMain.handle('rules:list', (_event, filters) => listRules(filters))
  ipcMain.handle('rules:create', (_event, payload) => {
    if (!payload?.matcherType || !payload?.matcherValue || !payload?.categoryId) {
      return null
    }
    return createRule({
      matcherType: payload.matcherType,
      matcherValue: payload.matcherValue,
      categoryId: payload.categoryId,
      priority: payload?.priority,
      isActive: payload?.isActive,
    })
  })
  ipcMain.handle('rules:update', (_event, payload) => {
    if (!payload?.id) {
      return false
    }
    return updateRule(payload.id, {
      matcherType: payload?.matcherType,
      matcherValue: payload?.matcherValue,
      categoryId: payload?.categoryId,
      priority: payload?.priority,
      isActive: payload?.isActive,
    })
  })
  ipcMain.handle('rules:delete', (_event, payload) => {
    if (!payload?.id) {
      return false
    }
    return deleteRule(payload.id)
  })
  ipcMain.handle('rules:apply', () => applyRulesToUncategorized())
  ipcMain.handle('ai:settings:get', () => getAiSettings())
  ipcMain.handle('ai:settings:update', (_event, payload) =>
    updateAiSettings({
      model: payload?.model,
      enabled: payload?.enabled,
      confidenceThreshold: payload?.confidenceThreshold,
      inputCostPer1M: payload?.inputCostPer1M,
      outputCostPer1M: payload?.outputCostPer1M,
    })
  )
  ipcMain.handle('ai:key:status', () => ({
    present: Boolean(process.env.OPENAI_API_KEY),
  }))
  ipcMain.handle('ai:requests:list', (_event, payload) =>
    listAiRequests(payload?.limit ?? 100)
  )
  ipcMain.handle('dashboard:months', () => listDashboardMonths())
  ipcMain.handle('dashboard:summary', (_event, payload) => {
    const month = typeof payload?.month === 'string' ? payload.month : ''
    if (!month) {
      return null
    }
    return getDashboardSummary(month)
  })
  ipcMain.handle('dashboard:categories', (_event, payload) => {
    const month = typeof payload?.month === 'string' ? payload.month : ''
    if (!month) {
      return []
    }
    return listDashboardCategorySpend(month)
  })
  ipcMain.handle('dashboard:summary:range', (_event, payload) => {
    const startMonth =
      typeof payload?.startMonth === 'string' ? payload.startMonth : ''
    const endMonth =
      typeof payload?.endMonth === 'string' ? payload.endMonth : ''
    if (!startMonth || !endMonth) {
      return null
    }
    return getDashboardSummaryRange(startMonth, endMonth)
  })
  ipcMain.handle('dashboard:categories:range', (_event, payload) => {
    const startMonth =
      typeof payload?.startMonth === 'string' ? payload.startMonth : ''
    const endMonth =
      typeof payload?.endMonth === 'string' ? payload.endMonth : ''
    if (!startMonth || !endMonth) {
      return []
    }
    return listDashboardCategorySpendRange(startMonth, endMonth)
  })
  ipcMain.handle('dashboard:trend', (_event, payload) => {
    const months = Number(payload?.months) || 6
    return listDashboardTrend(months)
  })
  ipcMain.handle('ai:suggestions', (_event, payload) => {
    const ids = Array.isArray(payload?.transactionIds)
      ? payload.transactionIds
      : []
    return getAiSuggestionsForTransactions(ids)
  })
  ipcMain.handle('ai:suggest', async (_event, payload) => {
    const transactions = Array.isArray(payload?.transactions)
      ? payload.transactions
      : []
    const categories = Array.isArray(payload?.categories)
      ? payload.categories
      : []

    if (transactions.length === 0 || categories.length === 0) {
      return { applied: 0, error: 'No transactions or categories provided.' }
    }

    return suggestCategories(transactions, categories)
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
  ipcMain.handle('transactions:delete', (_event, payload) => {
    if (!payload?.id) {
      return false
    }
    return deleteTransaction(payload.id)
  })
  ipcMain.handle('import:pick-file', async (_event, provider?: ImportProvider) => {
    const title =
      provider === 'ing'
        ? 'Select ING CSV file'
        : provider === 'dkb'
        ? 'Select DKB CSV file'
        : 'Select CSV file'
    const result = await dialog.showOpenDialog({
      title,
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
    const fileHash = crypto.createHash('sha256').update(contents).digest('hex')
    if (hasImportHash(fileHash)) {
      return {
        success: true,
        inserted: 0,
        skipped: 0,
        warnings: ['This file has already been imported.'],
      }
    }
    const { transactions, warnings } = parseDkbCsv(contents)

    if (transactions.length === 0) {
      return { success: false, error: 'No transactions found.', warnings }
    }

    insertImport('dkb', path.basename(filePath), fileHash)
    const { inserted, skipped } = insertTransactions(transactions)

    return {
      success: true,
      inserted,
      skipped,
      warnings,
    }
  })
  ipcMain.handle('import:ing', async (_event, filePath: string) => {
    if (!filePath) {
      return { success: false, error: 'No file path provided.' }
    }

    const contents = await readFile(filePath, 'utf-8')
    const fileHash = crypto.createHash('sha256').update(contents).digest('hex')
    if (hasImportHash(fileHash)) {
      return {
        success: true,
        inserted: 0,
        skipped: 0,
        warnings: ['This file has already been imported.'],
      }
    }
    const { transactions, warnings } = parseIngCsv(contents)

    if (transactions.length === 0) {
      return { success: false, error: 'No transactions found.', warnings }
    }

    insertImport('ing', path.basename(filePath), fileHash)
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
