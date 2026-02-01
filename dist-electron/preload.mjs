"use strict";
const electron = require("electron");
electron.contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return electron.ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return electron.ipcRenderer.invoke(channel, ...omit);
  }
  // You can expose other APTs you need here.
  // ...
});
electron.contextBridge.exposeInMainWorld("api", {
  db: {
    getInfo: () => electron.ipcRenderer.invoke("db:get-info")
  },
  import: {
    pickFile: () => electron.ipcRenderer.invoke("import:pick-file"),
    dkb: (filePath) => electron.ipcRenderer.invoke("import:dkb", filePath)
  },
  transactions: {
    list: (filters) => electron.ipcRenderer.invoke("transactions:list", filters),
    listUncategorized: (filters) => electron.ipcRenderer.invoke("transactions:uncategorized", filters),
    listCategorized: (filters) => electron.ipcRenderer.invoke("transactions:categorized", filters),
    addCategory: (payload) => electron.ipcRenderer.invoke("transactions:add-category", payload),
    removeCategory: (payload) => electron.ipcRenderer.invoke("transactions:remove-category", payload)
  },
  categories: {
    list: () => electron.ipcRenderer.invoke("categories:list"),
    create: (payload) => electron.ipcRenderer.invoke("categories:create", payload),
    update: (payload) => electron.ipcRenderer.invoke("categories:update", payload),
    delete: (payload) => electron.ipcRenderer.invoke("categories:delete", payload)
  },
  rules: {
    list: () => electron.ipcRenderer.invoke("rules:list"),
    create: (payload) => electron.ipcRenderer.invoke("rules:create", payload),
    update: (payload) => electron.ipcRenderer.invoke("rules:update", payload),
    delete: (payload) => electron.ipcRenderer.invoke("rules:delete", payload),
    apply: () => electron.ipcRenderer.invoke("rules:apply")
  },
  ai: {
    getSettings: () => electron.ipcRenderer.invoke("ai:settings:get"),
    updateSettings: (payload) => electron.ipcRenderer.invoke("ai:settings:update", payload),
    keyStatus: () => electron.ipcRenderer.invoke("ai:key:status"),
    suggest: (payload) => electron.ipcRenderer.invoke("ai:suggest", payload),
    suggestions: (payload) => electron.ipcRenderer.invoke("ai:suggestions", payload),
    listRequests: (payload) => electron.ipcRenderer.invoke("ai:requests:list", payload ?? {})
  },
  dashboard: {
    months: () => electron.ipcRenderer.invoke("dashboard:months"),
    summary: (payload) => electron.ipcRenderer.invoke("dashboard:summary", payload),
    categories: (payload) => electron.ipcRenderer.invoke("dashboard:categories", payload),
    summaryRange: (payload) => electron.ipcRenderer.invoke("dashboard:summary:range", payload),
    categoriesRange: (payload) => electron.ipcRenderer.invoke("dashboard:categories:range", payload),
    trend: (payload) => electron.ipcRenderer.invoke("dashboard:trend", payload ?? {})
  }
});
