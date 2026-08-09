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
  getEffectiveOpenAiKey,
  listAiRequests,
  getAiSuggestionsForTransactions,
  getAiTagSuggestionsForTransactions,
  getDashboardSummary,
  getDashboardSummaryRange,
  insertImport,
  insertTransactions,
  hasImportHash,
  listDashboardCategorySpend,
  listDashboardCategorySpendRange,
  listDashboardTagSpend,
  listDashboardTagSpendRange,
  listTransactionsByTag,
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
  listBudgets,
  upsertBudget,
  deleteBudget,
  getBudgetActuals,
  copyBudgetsFromYear,
  updateCategoryGroup,
  createManualTransaction,
  updateManualTransaction,
  clearAndResetData,
  clearTransactions,
  createChatSession,
  updateChatSession,
  listChatSessions,
  getChatSession,
  deleteChatSession,
  getOrCreateAccount,
  maybeUpdateAccountAnchor,
  listAccounts,
  updateAccount,
  deleteAccount,
  listTags,
  listTagsForTransactions,
  getOrCreateTag,
  addTransactionTag,
  removeTransactionTag,
  renameTag,
  deleteTag,
  listBankConnectionsWithAccounts,
  updateBankConnection,
  updateBankAccount,
  deleteBankConnection,
} from './db'
import { storeCredentials, loadCredentials } from './connectors/enablebanking/secrets'
import { getApplication, listAspsps } from './connectors/enablebanking/client'
import { connectBank, completeAuthManually, cancelConnect, disconnect } from './connectors/enablebanking/auth'
import { syncConnection } from './connectors/enablebanking/sync'
import { parseDkbCsv } from './importers/dkb'
import { parseIngCsv } from './importers/ing'
import { parseSparkasseCsv } from './importers/sparkasse'
import { parseVolksbankCsv } from './importers/volksbank'
import type { ImportProvider } from './importers/types'
import { suggestCategories } from './ai'
import { runChat } from './ai-chat'
import type { ChatMessage } from './ai-chat'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Global account filter (sidebar multi-select) — payload carries accountIds
// on every list/dashboard/budget request; an empty/missing array means "all".
function parseAccountIds(payload: unknown): number[] | undefined {
  const ids = (payload as { accountIds?: unknown })?.accountIds
  return Array.isArray(ids) ? ids.filter((id): id is number => Number.isInteger(id)) : undefined
}

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

// Electron's default userData path is derived from package.json's "name"
// ("horus") regardless of how the app was launched — so `npm run dev`, this
// project's driver scripts, AND the real packaged/installed app all resolve
// to the same directory unless separated explicitly. Must be set before
// `app` is ready. Only a genuinely packaged build (electron-builder output)
// has `app.isPackaged === true`, so this never affects your real installed app.
if (!app.isPackaged) {
  app.setPath('userData', path.join(app.getPath('userData'), '..', 'horus-dev'))
}

let win: BrowserWindow | null

function createWindow() {
  // BrowserWindow's `icon` option only affects Windows/Linux (taskbar); on
  // macOS the Dock icon has to be set separately, and only via app.dock,
  // otherwise dev builds show the generic Electron icon instead of Horus.
  if (process.platform === 'darwin') {
    app.dock?.setIcon(path.join(process.env.VITE_PUBLIC, 'horus-icon-256.png'))
  }

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
      tagIds: Array.isArray(payload?.tagIds) ? payload.tagIds : undefined,
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
      tagIds: Array.isArray(payload?.tagIds) ? payload.tagIds : undefined,
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
      webSearch: payload?.webSearch,
      apiKey: payload?.apiKey,
    })
  )
  ipcMain.handle('ai:key:status', () => {
    const { key, source } = getEffectiveOpenAiKey()
    return { present: Boolean(key), source }
  })
  ipcMain.handle('ai:requests:list', (_event, payload) =>
    listAiRequests({ limit: payload?.limit, offset: payload?.offset })
  )
  ipcMain.handle('dashboard:months', () => listDashboardMonths())
  ipcMain.handle('dashboard:summary', (_event, payload) => {
    const month = typeof payload?.month === 'string' ? payload.month : ''
    if (!month) {
      return null
    }
    return getDashboardSummary(month, parseAccountIds(payload))
  })
  ipcMain.handle('dashboard:categories', (_event, payload) => {
    const month = typeof payload?.month === 'string' ? payload.month : ''
    if (!month) {
      return []
    }
    return listDashboardCategorySpend(month, parseAccountIds(payload))
  })
  ipcMain.handle('dashboard:summary:range', (_event, payload) => {
    const startMonth =
      typeof payload?.startMonth === 'string' ? payload.startMonth : ''
    const endMonth =
      typeof payload?.endMonth === 'string' ? payload.endMonth : ''
    if (!startMonth || !endMonth) {
      return null
    }
    return getDashboardSummaryRange(startMonth, endMonth, parseAccountIds(payload))
  })
  ipcMain.handle('dashboard:categories:range', (_event, payload) => {
    const startMonth =
      typeof payload?.startMonth === 'string' ? payload.startMonth : ''
    const endMonth =
      typeof payload?.endMonth === 'string' ? payload.endMonth : ''
    if (!startMonth || !endMonth) {
      return []
    }
    return listDashboardCategorySpendRange(startMonth, endMonth, parseAccountIds(payload))
  })
  ipcMain.handle('dashboard:trend', (_event, payload) => {
    const months = Number(payload?.months) || 6
    return listDashboardTrend(months, parseAccountIds(payload))
  })
  ipcMain.handle('dashboard:tags', (_event, payload) => {
    const month = typeof payload?.month === 'string' ? payload.month : ''
    if (!month) {
      return []
    }
    return listDashboardTagSpend(month, parseAccountIds(payload))
  })
  ipcMain.handle('dashboard:tags:range', (_event, payload) => {
    const startMonth =
      typeof payload?.startMonth === 'string' ? payload.startMonth : ''
    const endMonth =
      typeof payload?.endMonth === 'string' ? payload.endMonth : ''
    if (!startMonth || !endMonth) {
      return []
    }
    return listDashboardTagSpendRange(startMonth, endMonth, parseAccountIds(payload))
  })
  ipcMain.handle('transactions:by-tag', (_event, payload) => {
    const tagId = Number(payload?.tagId)
    if (!tagId) {
      return { rows: [], total: 0 }
    }
    return listTransactionsByTag(tagId, {
      limit: payload?.limit,
      offset: payload?.offset,
      accountIds: parseAccountIds(payload),
    })
  })
  ipcMain.handle('ai:suggestions', (_event, payload) => {
    const ids = Array.isArray(payload?.transactionIds)
      ? payload.transactionIds
      : []
    return getAiSuggestionsForTransactions(ids)
  })
  ipcMain.handle('ai:tag-suggestions', (_event, payload) => {
    const ids = Array.isArray(payload?.transactionIds)
      ? payload.transactionIds
      : []
    return getAiTagSuggestionsForTransactions(ids)
  })
  ipcMain.handle('ai:suggest', async (event, payload) => {
    const transactions = Array.isArray(payload?.transactions)
      ? payload.transactions
      : []
    const categories = Array.isArray(payload?.categories)
      ? payload.categories
      : []

    if (transactions.length === 0) {
      return { applied: 0, error: 'No uncategorized transactions on this page — nothing to suggest.' }
    }
    if (categories.length === 0) {
      return { applied: 0, error: 'No active categories exist — create categories first.' }
    }

    return suggestCategories(transactions, categories, (status) => {
      event.sender.send('ai:suggest:progress', status)
    })
  })
  ipcMain.handle('ai:suggest-all', async (event) => {
    const { rows } = listUncategorizedTransactions({ limit: 10000 })
    if (rows.length === 0) {
      return { applied: 0, batches: 0, error: 'No uncategorized transactions — nothing to suggest.' }
    }
    const categories = listCategories({ limit: 500 })
      .rows.filter((cat) => cat.isActive === 1)
      .map((cat) => ({ id: cat.id, name: cat.name }))
    if (categories.length === 0) {
      return { applied: 0, batches: 0, error: 'No active categories exist — create categories first.' }
    }

    const chunkSize = 30
    const chunks: typeof rows[] = []
    for (let i = 0; i < rows.length; i += chunkSize) {
      chunks.push(rows.slice(i, i + chunkSize))
    }

    let applied = 0
    let autoApplied = 0
    let autoAppliedTags = 0
    const errors: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      const prefix = chunks.length > 1 ? `Batch ${i + 1}/${chunks.length} — ` : ''
      const result = await suggestCategories(
        chunks[i].map((tx) => ({
          id: tx.id,
          bookingDate: tx.bookingDate,
          amount: tx.amount,
          currency: tx.currency,
          payee: tx.payee,
          purpose: tx.purpose,
          iban: tx.iban ?? null,
          method: tx.method ?? null,
        })),
        categories,
        (status) => event.sender.send('ai:suggest:progress', prefix + status)
      )
      if (result.error) {
        errors.push(`Batch ${i + 1}: ${result.error}`)
      } else {
        applied += result.applied
        autoApplied += result.autoApplied ?? 0
        autoAppliedTags += result.autoAppliedTags ?? 0
      }
    }

    return {
      applied,
      autoApplied,
      autoAppliedTags,
      batches: chunks.length,
      error: errors.length === chunks.length ? errors.join(' | ') : undefined,
      warnings: errors.length > 0 && errors.length < chunks.length ? errors : undefined,
    }
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
        : provider === 'sparkasse'
        ? 'Select Sparkasse CSV file'
        : provider === 'volksbank'
        ? 'Select Volksbank CSV file'
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
    const { transactions, warnings, ownAccount } = parseDkbCsv(contents)

    if (transactions.length === 0) {
      return { success: false, error: 'No transactions found.', warnings }
    }

    let accountId: number | null = null
    if (ownAccount) {
      const defaultName =
        ownAccount.kind === 'credit' ? 'DKB Credit Card'
        : ownAccount.kind === 'savings' ? 'DKB Savings'
        : 'DKB Giro'
      accountId = getOrCreateAccount({
        bank: 'dkb',
        identifier: ownAccount.identifier,
        type: ownAccount.kind,
        defaultName,
      })
      if (ownAccount.balance != null && ownAccount.balanceDate) {
        maybeUpdateAccountAnchor(accountId, ownAccount.balance, ownAccount.balanceDate)
      }
    } else {
      warnings.push('Own account not found in file header — transactions imported without an account.')
    }

    insertImport('dkb', path.basename(filePath), fileHash)
    const { inserted, skipped } = insertTransactions(transactions, accountId)

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
    const { transactions, warnings, ownAccount } = parseIngCsv(contents)

    if (transactions.length === 0) {
      return { success: false, error: 'No transactions found.', warnings }
    }

    let accountId: number | null = null
    if (ownAccount) {
      accountId = getOrCreateAccount({
        bank: 'ing',
        identifier: ownAccount.identifier,
        type: ownAccount.kind,
        defaultName: 'ING Checking',
      })
      if (ownAccount.balance != null && ownAccount.balanceDate) {
        maybeUpdateAccountAnchor(accountId, ownAccount.balance, ownAccount.balanceDate)
      }
    } else {
      warnings.push('Own account not found in file — transactions imported without an account.')
    }

    insertImport('ing', path.basename(filePath), fileHash)
    const { inserted, skipped } = insertTransactions(transactions, accountId)

    return {
      success: true,
      inserted,
      skipped,
      warnings,
    }
  })
  ipcMain.handle('import:sparkasse', async (_event, filePath: string) => {
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
    const { transactions, warnings, ownAccount } = parseSparkasseCsv(contents)

    if (transactions.length === 0) {
      return { success: false, error: 'No transactions found.', warnings }
    }

    let accountId: number | null = null
    if (ownAccount) {
      accountId = getOrCreateAccount({
        bank: 'sparkasse',
        identifier: ownAccount.identifier,
        type: ownAccount.kind,
        defaultName: 'Sparkasse Giro',
      })
      if (ownAccount.balance != null && ownAccount.balanceDate) {
        maybeUpdateAccountAnchor(accountId, ownAccount.balance, ownAccount.balanceDate)
      }
    } else {
      warnings.push('Own account not found in file — transactions imported without an account.')
    }

    insertImport('sparkasse', path.basename(filePath), fileHash)
    const { inserted, skipped } = insertTransactions(transactions, accountId)

    return {
      success: true,
      inserted,
      skipped,
      warnings,
    }
  })
  ipcMain.handle('import:volksbank', async (_event, filePath: string) => {
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
    const { transactions, warnings, ownAccount, bankName } = parseVolksbankCsv(contents)

    if (transactions.length === 0) {
      return { success: false, error: 'No transactions found.', warnings }
    }

    let accountId: number | null = null
    if (ownAccount) {
      accountId = getOrCreateAccount({
        bank: 'volksbank',
        identifier: ownAccount.identifier,
        type: ownAccount.kind,
        defaultName: bankName ? `${bankName} Giro` : 'Volksbank Giro',
      })
      if (ownAccount.balance != null && ownAccount.balanceDate) {
        maybeUpdateAccountAnchor(accountId, ownAccount.balance, ownAccount.balanceDate)
      }
    } else {
      warnings.push('Own account not found in file — transactions imported without an account.')
    }

    insertImport('volksbank', path.basename(filePath), fileHash)
    const { inserted, skipped } = insertTransactions(transactions, accountId)

    return {
      success: true,
      inserted,
      skipped,
      warnings,
    }
  })
  ipcMain.handle('budgets:list', (_event, payload) => {
    const period = typeof payload?.period === 'string' ? payload.period : (typeof payload?.year === 'string' ? payload.year : '')
    if (!period) return []
    return listBudgets(period)
  })
  ipcMain.handle('budgets:upsert', (_event, payload) => {
    const period = payload?.period ?? payload?.year
    if (!payload?.categoryId || !period || !payload?.cadence || payload?.amount == null) return null
    return upsertBudget({
      categoryId: payload.categoryId,
      period,
      cadence: payload.cadence,
      amount: payload.amount,
      notes: payload?.notes,
    })
  })
  ipcMain.handle('budgets:delete', (_event, payload) => {
    if (!payload?.id) return false
    return deleteBudget(payload.id)
  })
  ipcMain.handle('budgets:actuals', (_event, payload) => {
    const year = typeof payload?.year === 'string' ? payload.year : ''
    if (!year) return []
    return getBudgetActuals(year, payload?.month, parseAccountIds(payload))
  })
  ipcMain.handle('budgets:copy-from-year', (_event, payload) => {
    const fromYear = typeof payload?.fromYear === 'string' ? payload.fromYear : ''
    const toYear = typeof payload?.toYear === 'string' ? payload.toYear : ''
    if (!fromYear || !toYear) return { copied: 0 }
    return copyBudgetsFromYear(fromYear, toYear)
  })
  ipcMain.handle('categories:update-group', (_event, payload) => {
    if (!payload?.id || !payload?.groupType) return false
    return updateCategoryGroup(payload.id, payload.groupType, payload?.displayOrder)
  })
  ipcMain.handle('transactions:create-manual', (_event, payload) => {
    if (!payload?.bookingDate || payload?.amount == null || !payload?.currency) return null
    return createManualTransaction({
      bookingDate: payload.bookingDate,
      amount: payload.amount,
      currency: payload.currency,
      payee: payload?.payee,
      purpose: payload?.purpose,
      account: payload?.account,
      categoryIds: Array.isArray(payload?.categoryIds) ? payload.categoryIds : [],
    })
  })
  ipcMain.handle('ai:chat', async (event, payload) => {
    const messages = Array.isArray(payload?.messages) ? payload.messages as ChatMessage[] : []
    const view = typeof payload?.view === 'string' ? payload.view : undefined
    return runChat(messages, (toolName) => {
      event.sender.send('ai:chat:tool-call', toolName)
    }, view)
  })
  ipcMain.handle('tags:list', (_event, filters) => listTags(filters))
  ipcMain.handle('tags:create', (_event, payload) => {
    const name = typeof payload?.name === 'string' ? payload.name : ''
    return getOrCreateTag(name)
  })
  ipcMain.handle('tags:rename', (_event, payload) => {
    if (!payload?.id || typeof payload?.name !== 'string') return false
    return renameTag(payload.id, payload.name)
  })
  ipcMain.handle('tags:delete', (_event, payload) => {
    if (!payload?.id) return false
    return deleteTag(payload.id)
  })
  ipcMain.handle('transactions:tags:list', (_event, payload) => {
    const ids = Array.isArray(payload?.transactionIds) ? payload.transactionIds : []
    return listTagsForTransactions(ids)
  })
  ipcMain.handle('transactions:tags:add', (_event, payload) => {
    if (!payload?.transactionId || typeof payload?.name !== 'string') return false
    return addTransactionTag(payload.transactionId, payload.name)
  })
  ipcMain.handle('transactions:tags:remove', (_event, payload) => {
    if (!payload?.transactionId || !payload?.tagId) return false
    return removeTransactionTag(payload.transactionId, payload.tagId)
  })

  ipcMain.handle('accounts:list', () => listAccounts())
  ipcMain.handle('accounts:update', (_event, payload) => {
    if (!payload?.id) return false
    return updateAccount(payload.id, {
      name: payload?.name,
      type: payload?.type,
      anchorBalance: payload?.anchorBalance,
      anchorDate: payload?.anchorDate,
    })
  })
  ipcMain.handle('accounts:delete', (_event, payload) => {
    if (!payload?.id) return false
    return deleteAccount(payload.id)
  })

  ipcMain.handle('chat:sessions:list', () => listChatSessions())
  ipcMain.handle('chat:sessions:get', (_event, payload) => getChatSession(payload?.id))
  ipcMain.handle('chat:sessions:create', (_event, payload) => createChatSession(payload.title, payload.messages))
  ipcMain.handle('chat:sessions:update', (_event, payload) => updateChatSession(payload.id, payload.messages))
  ipcMain.handle('chat:sessions:delete', (_event, payload) => deleteChatSession(payload?.id))

  ipcMain.handle('db:clear-and-reset', () => {
    clearAndResetData()
    return { success: true }
  })
  ipcMain.handle('db:clear-transactions', () => {
    clearTransactions()
    return { success: true }
  })
  ipcMain.handle('transactions:update', (_event, payload) => {
    if (!payload?.id) return false
    return updateManualTransaction(payload.id, {
      bookingDate: payload?.bookingDate,
      amount: payload?.amount,
      currency: payload?.currency,
      payee: payload?.payee,
      purpose: payload?.purpose,
      account: payload?.account,
    })
  })
  ipcMain.handle('banks:credentials:status', () => {
    // appId is not secret (it's a public client identifier) so it's safe to
    // show in the UI; the private key itself is never sent to the renderer.
    const credentials = loadCredentials()
    return { present: credentials !== null, appId: credentials?.appId ?? null }
  })
  ipcMain.handle('banks:pick-key-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Select Enable Banking private key (.pem)',
      properties: ['openFile'],
      filters: [{ name: 'PEM key', extensions: ['pem'] }],
    })
    if (result.canceled || result.filePaths.length === 0) return null
    return result.filePaths[0]
  })
  ipcMain.handle('banks:credentials:set', async (_event, payload) => {
    try {
      if (!payload?.keyPath) {
        return { success: false, error: 'No key file selected.' }
      }
      const privateKeyPem = await readFile(payload.keyPath, 'utf-8')
      storeCredentials(payload?.appId ?? '', privateKeyPem)
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not save credentials.' }
    }
  })
  ipcMain.handle('banks:credentials:test', async () => {
    try {
      const credentials = loadCredentials()
      if (!credentials) {
        return { success: false, error: 'No credentials saved yet.' }
      }
      const application = await getApplication(credentials)
      return {
        success: true,
        name: application.name,
        environment: application.environment,
        active: application.active,
        countries: application.countries ?? [],
      }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Test connection failed.' }
    }
  })
  ipcMain.handle('banks:list-aspsps', async (_event, country?: string) => {
    const credentials = loadCredentials()
    if (!credentials) {
      throw new Error('No credentials saved yet.')
    }
    return listAspsps(credentials, country)
  })
  ipcMain.handle('banks:connect', async (_event, payload) => {
    try {
      const credentials = loadCredentials()
      if (!credentials) {
        return { success: false, error: 'No credentials saved yet.' }
      }
      const result = await connectBank(
        {
          aspspName: payload.aspspName,
          aspspCountry: payload.aspspCountry,
          maximumConsentValidity: payload.maximumConsentValidity,
          connectionId: payload.connectionId,
        },
        credentials,
        (status) => win?.webContents.send('banks:connect-status', status)
      )
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connect failed.' }
    }
  })
  ipcMain.handle('banks:connect-cancel', () => {
    cancelConnect()
    return { success: true }
  })
  ipcMain.handle('banks:complete-auth', (_event, payload) => {
    try {
      completeAuthManually(payload?.redirectUrl ?? '')
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Could not complete authorization.' }
    }
  })
  ipcMain.handle('banks:list-connections', () => listBankConnectionsWithAccounts())
  ipcMain.handle('banks:accounts:update', (_event, payload) => {
    if (!payload?.id) return false
    return updateBankAccount(payload.id, {
      syncFromDate: payload?.syncFromDate,
      isEnabled: payload?.isEnabled,
    })
  })
  ipcMain.handle('banks:sync', async (_event, payload) => {
    try {
      const credentials = loadCredentials()
      if (!credentials) {
        return { success: false, error: 'No credentials saved yet.' }
      }
      const result = await syncConnection(payload?.connectionId, credentials)
      return { success: true, ...result }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Sync failed.' }
    }
  })
  ipcMain.handle('banks:delete-connection', (_event, payload) => {
    if (!payload?.connectionId) return false
    return deleteBankConnection(payload.connectionId)
  })
  ipcMain.handle('banks:disconnect', async (_event, payload) => {
    try {
      const credentials = loadCredentials()
      if (credentials) {
        await disconnect(payload?.connectionId, credentials)
      } else {
        updateBankConnection(payload?.connectionId, { status: 'revoked' })
      }
      return { success: true }
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Disconnect failed.' }
    }
  })

  createWindow()
})
