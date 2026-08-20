// DSH 小鲸鱼余额挂件 —— 独立常驻版（Electron 主进程）
// 无需 DSH：透明无边框置顶小窗，托盘菜单，余额/当日消耗切换。
'use strict'

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, screen } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const BASE = 196 // 窗口基准尺寸（scale=1 时）
const MIN_SCALE = 0.6
const MAX_SCALE = 1.4
const BALANCE_URL = 'https://api.deepseek.com/user/balance'
const BALANCE_TTL_MS = 25000
const FETCH_TIMEOUT_MS = 20000
const SNAP_MS = 260 // 吸附滑动动画时长

let win = null
let tray = null
let config = {}
let balanceCache = null
let balanceInFlight = null
let dragState = null
let snapTimer = null

const configPath = () => path.join(app.getPath('userData'), 'config.json')
const usagePath = () => path.join(app.getPath('userData'), 'usage.json')

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v) }

function loadConfig() {
  try { config = JSON.parse(fs.readFileSync(configPath(), 'utf8')) } catch { config = {} }
  if (typeof config.scale !== 'number') config.scale = 1
  config.scale = clamp(config.scale, MIN_SCALE, MAX_SCALE)
}
function saveConfig() {
  try {
    fs.mkdirSync(path.dirname(configPath()), { recursive: true })
    fs.writeFileSync(configPath(), JSON.stringify(config, null, 2), 'utf8')
  } catch (err) { console.error('[whale] save config failed:', err.message) }
}

// ---- 当日消耗跟踪（当日首次成功读余额时记录基线）----
function todayStr() {
  const d = new Date()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return d.getFullYear() + '-' + m + '-' + day
}
function readUsageRecord() {
  try {
    const parsed = JSON.parse(fs.readFileSync(usagePath(), 'utf8'))
    if (parsed && typeof parsed.startBalance === 'number' && typeof parsed.date === 'string') return parsed
  } catch (err) {}
  return null
}
function writeUsageRecord(date, startBalance, currency) {
  try {
    fs.mkdirSync(path.dirname(usagePath()), { recursive: true })
    fs.writeFileSync(usagePath(), JSON.stringify({ date, startBalance, currency, updatedAt: new Date().toISOString() }), 'utf8')
  } catch (err) {}
}
function computeTodayUsage(balance, currency) {
  const today = todayStr()
  const rec = readUsageRecord()
  if (!rec || rec.date !== today) {
    writeUsageRecord(today, balance, currency)
    return { amount: 0, currency, startBalance: balance }
  }
  const start = Number(rec.startBalance)
  return { amount: Math.max(0, start - balance), currency, startBalance: start }
}

// ---- 余额拉取（与 DSH 插件版同款健壮性）----
async function fetchBalanceRaw() {
  const key = config.apiKey
  if (!key) return { ok: false, code: 'NO_KEY', error: '未配置 DEEPSEEK_API_KEY' }
  let lastErr = null
  for (let attempt = 0; attempt < 2; attempt++) {
    let res
    try {
      res = await fetch(BALANCE_URL, {
        headers: { Authorization: 'Bearer ' + key },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      })
    } catch (err) {
      lastErr = err
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
      continue
    }
    if (!res.ok) {
      lastErr = new Error('HTTP ' + res.status)
      if (res.status < 500) break
      if (attempt === 0) await new Promise((r) => setTimeout(r, 500))
      continue
    }
    let data
    try { data = await res.json() } catch { return { ok: false, code: 'PARSE', error: '余额接口返回不是合法 JSON' } }
    const info = data && Array.isArray(data.balance_infos) ? data.balance_infos[0] : null
    if (!info || info.total_balance === undefined) return { ok: false, code: 'SHAPE', error: '余额接口返回结构异常' }
    const total = Number(info.total_balance)
    const currency = String(info.currency || 'CNY')
    return { ok: true, totalBalance: total, currency, todayUsage: computeTodayUsage(total, currency), updatedAt: new Date().toISOString() }
  }
  const transient = !(lastErr && /^HTTP 4\d\d/.test(lastErr.message))
  return { ok: false, code: 'HTTP', transient, error: '余额接口请求失败: ' + String((lastErr && lastErr.message) || lastErr).slice(0, 200) }
}
function getBalance(force) {
  const now = Date.now()
  if (!force && balanceCache && now - balanceCache.at < BALANCE_TTL_MS) return Promise.resolve(balanceCache.payload)
  if (balanceInFlight) return balanceInFlight
  balanceInFlight = fetchBalanceRaw()
    .then((payload) => {
      if (payload.ok) balanceCache = { at: Date.now(), payload }
      else if (payload.transient && balanceCache) return { ...balanceCache.payload, stale: true, error: payload.error }
      else if (!payload.transient) console.error('[whale]', payload.code, payload.error)
      return payload
    })
    .finally(() => { balanceInFlight = null })
  return balanceInFlight
}

// ---- 窗口位置 / 吸附 ----
function workAreaOf(x, y) {
  try { return screen.getDisplayNearestPoint({ x: Math.round(x), y: Math.round(y) }).workArea } catch { return screen.getPrimaryDisplay().workArea }
}
function windowRect() {
  if (!win) return null
  const [x, y] = win.getPosition()
  const [w, h] = win.getSize()
  return { x, y, w, h }
}
function clampToArea(rect, area) {
  return {
    x: clamp(rect.x, area.x, Math.max(area.x, area.x + area.width - rect.w)),
    y: clamp(rect.y, area.y, Math.max(area.y, area.y + area.height - rect.h)),
  }
}
function snapOf(rect, area) {
  const cx = rect.x + rect.w / 2
  const cy = rect.y + rect.h / 2
  const h = cx < area.x + area.width / 4 ? 'left' : (cx > area.x + area.width * 3 / 4 ? 'right' : null)
  const v = cy < area.y + area.height / 4 ? 'top' : (cy > area.y + area.height * 3 / 4 ? 'bottom' : null)
  return { h, v }
}
function animateWindowTo(x, y) {
  if (!win) return
  if (snapTimer) { clearInterval(snapTimer); snapTimer = null }
  const from = win.getPosition()
  const t0 = Date.now()
  snapTimer = setInterval(() => {
    if (!win) { clearInterval(snapTimer); snapTimer = null; return }
    const t = Math.min(1, (Date.now() - t0) / SNAP_MS)
    const eased = 1 - Math.pow(1 - t, 3)
    win.setPosition(Math.round(from[0] + (x - from[0]) * eased), Math.round(from[1] + (y - from[1]) * eased))
    if (t >= 1) { clearInterval(snapTimer); snapTimer = null }
  }, 16)
}
function pushSnap(h, v) {
  if (win && !win.isDestroyed()) win.webContents.send('whale:snap', { h, v })
}
function settleWindow() {
  const rect = windowRect()
  if (!rect) return
  const area = workAreaOf(rect.x + rect.w / 2, rect.y + rect.h / 2)
  const snap = snapOf(rect, area)
  let tx = rect.x
  let ty = rect.y
  if (snap.h === 'left') tx = area.x
  else if (snap.h === 'right') tx = area.x + area.width - rect.w
  if (snap.v === 'top') ty = area.y
  else if (snap.v === 'bottom') ty = area.y + area.height - rect.h
  const clamped = clampToArea({ ...rect, x: tx, y: ty }, area)
  animateWindowTo(clamped.x, clamped.y)
  config.x = clamped.x
  config.y = clamped.y
  saveConfig()
  pushSnap(snap.h, snap.v)
}

// ---- 窗口 ----
function createWindow() {
  loadConfig()
  const size = Math.round(BASE * config.scale)
  const area = screen.getPrimaryDisplay().workArea
  let x = config.x
  let y = config.y
  if (typeof x !== 'number' || typeof y !== 'number' || x < area.x - 2000 || x > area.x + area.width + 2000) {
    x = area.x + area.width - size
    y = area.y + area.height - size
  }
  win = new BrowserWindow({
    width: size,
    height: size,
    x: Math.round(x),
    y: Math.round(y),
    transparent: true,
    frame: false,
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    fullscreenable: false,
    maximizable: false,
    minimizable: false,
    backgroundColor: '#00000000',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.setAlwaysOnTop(true, 'floating')
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'))
  win.on('closed', () => { win = null })
}

// ---- 托盘 ----
function createTray() {
  try {
    const imgPath = path.join(__dirname, 'renderer', 'assets', 'DSniang02.png')
    const icon = nativeImage.createFromPath(imgPath).resize({ width: 16, height: 16 })
    tray = new Tray(icon)
    tray.setToolTip('DSH 小鲸鱼余额挂件')
    const menu = Menu.buildFromTemplate([
      {
        label: '开机自启',
        type: 'checkbox',
        checked: app.getLoginItemSettings().openAtLogin,
        click: (item) => { app.setLoginItemSettings({ openAtLogin: item.checked }) },
      },
      { type: 'separator' },
      { label: '退出', click: () => app.quit() },
    ])
    tray.setContextMenu(menu)
  } catch (err) {
    console.error('[whale] tray failed:', err.message)
  }
}

// ---- IPC ----
ipcMain.handle('whale:getStatus', () => getBalance(false).then((p) => ({ ...p, keyConfigured: !!config.apiKey })))
ipcMain.handle('whale:refresh', () => getBalance(true).then((p) => ({ ...p, keyConfigured: !!config.apiKey })))
ipcMain.handle('whale:setKey', (_e, key) => {
  if (typeof key !== 'string' || !key.trim()) return { ok: false, error: 'key 不能为空' }
  config.apiKey = key.trim()
  balanceCache = null
  saveConfig()
  return { ok: true }
})
ipcMain.handle('whale:setScale', (_e, arg) => {
  const scale = clamp(Number(arg && arg.scale) || 1, MIN_SCALE, MAX_SCALE)
  const h = arg && arg.h
  const v = arg && arg.v
  const rect = windowRect()
  config.scale = scale
  saveConfig()
  if (win && rect) {
    const size = Math.round(BASE * scale)
    const area = workAreaOf(rect.x + rect.w / 2, rect.y + rect.h / 2)
    let nx = rect.x
    let ny = rect.y
    if (h === 'right') nx = rect.x + rect.w - size
    else if (h !== 'left') nx = rect.x + (rect.w - size) / 2
    if (v === 'bottom') ny = rect.y + rect.h - size
    else if (v !== 'top') ny = rect.y + (rect.h - size) / 2
    const clamped = clampToArea({ x: nx, y: ny, w: size, h: size }, area)
    win.setBounds({ x: Math.round(clamped.x), y: Math.round(clamped.y), width: size, height: size })
    config.x = clamped.x
    config.y = clamped.y
    saveConfig()
    pushSnap(h, v)
  }
  return { ok: true, scale }
})
ipcMain.handle('whale:dragStart', () => {
  if (!win) return { ok: false }
  if (snapTimer) { clearInterval(snapTimer); snapTimer = null }
  dragState = { startCursor: screen.getCursorScreenPoint(), startPos: win.getPosition() }
  return { ok: true }
})
ipcMain.handle('whale:dragMove', () => {
  if (!win || !dragState) return { ok: false }
  const cursor = screen.getCursorScreenPoint()
  const rect = windowRect()
  const area = workAreaOf(cursor.x, cursor.y)
  const nx = dragState.startPos[0] + (cursor.x - dragState.startCursor.x)
  const ny = dragState.startPos[1] + (cursor.y - dragState.startCursor.y)
  const clamped = clampToArea({ x: nx, y: ny, w: rect.w, h: rect.h }, area)
  win.setPosition(Math.round(clamped.x), Math.round(clamped.y))
  return { ok: true }
})
ipcMain.handle('whale:dragEnd', () => {
  dragState = null
  settleWindow()
  return { ok: true }
})
ipcMain.handle('whale:quit', () => { app.quit() })

// ---- 生命周期 ----
const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (win) { if (win.isMinimized()) win.restore(); win.focus() }
  })
  app.whenReady().then(() => {
    createWindow()
    createTray()
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
  })
  app.on('window-all-closed', () => { app.quit() })
}
