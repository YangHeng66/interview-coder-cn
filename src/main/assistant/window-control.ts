import type { BrowserWindow } from 'electron'
import appConfig from '../../../app.config.json'
import { applyContentProtection } from '../content-protection'
import { showToolbar, reassertToolbarTopMost } from '../toolbar-window'
import { state } from '../state'

const MOVE_STEP = appConfig.interface.moveStep
/** Opacity delta per shortcut press, matching the settings slider step */
const OPACITY_STEP = appConfig.interface.opacityStep
const FRONT_REASSERT_DURATION = 8000
const FRONT_REASSERT_INTERVAL = 100
const FRONT_RELATIVE_LEVEL = 100
const BACKGROUND_GUARD_INTERVAL = 2000
let frontReassertTimer: NodeJS.Timeout | null = null
let backgroundGuardTimer: NodeJS.Timeout | null = null

/**
 * Reassert always-on-top. `aggressive` also calls moveTop() which
 * brings the window above everything — only use on explicit user actions
 * (show, screenshot, etc.) to avoid disturbing interaction with other apps.
 */
function applyTopMost(win: BrowserWindow, aggressive = true) {
  if (!win || win.isDestroyed()) return
  win.setAlwaysOnTop(true, 'screen-saver', FRONT_RELATIVE_LEVEL)
  if (aggressive) win.moveTop()

  if (state.ignoreMouse) {
    reassertToolbarTopMost(FRONT_RELATIVE_LEVEL + 1, aggressive)
  }
}

/**
 * Start a persistent low-frequency background guard that continuously
 * re-asserts always-on-top while the window is visible.
 * Uses the non-aggressive variant so it won't steal focus or
 * interfere with the user's interaction with other windows.
 */
function startBackgroundGuard(window: BrowserWindow) {
  if (backgroundGuardTimer) return // already running
  backgroundGuardTimer = setInterval(() => {
    if (!window || window.isDestroyed() || !window.isVisible()) {
      stopBackgroundGuard()
      return
    }
    applyTopMost(window, false)
  }, BACKGROUND_GUARD_INTERVAL)
}

function stopBackgroundGuard() {
  if (backgroundGuardTimer) {
    clearInterval(backgroundGuardTimer)
    backgroundGuardTimer = null
  }
}

function stopFrontReassert() {
  if (frontReassertTimer) {
    clearInterval(frontReassertTimer)
    frontReassertTimer = null
  }
}

function showMainWindow(window: BrowserWindow) {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    window.showInactive()
  } else {
    window.show()
  }

  applyContentProtection(window)
  showToolbar()
  keepWindowInFront(window)
}

function keepWindowInFront(window: BrowserWindow) {
  if (!window || window.isDestroyed()) return
  if (frontReassertTimer) {
    clearInterval(frontReassertTimer)
    frontReassertTimer = null
  }

  const start = Date.now()
  const reassert = () => {
    if (!window.isVisible() || window.isDestroyed()) return false
    applyTopMost(window)
    return true
  }

  if (!reassert()) return

  // Aggressive burst: rapid reasserts for a short period
  frontReassertTimer = setInterval(() => {
    const shouldStop = Date.now() - start > FRONT_REASSERT_DURATION
    if (shouldStop || !reassert()) {
      if (frontReassertTimer) {
        clearInterval(frontReassertTimer)
        frontReassertTimer = null
      }
    }
  }, FRONT_REASSERT_INTERVAL)

  // Ensure background guard is running for persistent protection
  startBackgroundGuard(window)
}

/**
 * Opacity is owned by the renderer settings store (persisted + synced back to
 * main), so the shortcut only asks the renderer to step it.
 */
function adjustOpacity(delta: number) {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
  mainWindow.webContents.send('adjust-opacity', delta)
}

export function toggleMainWindow() {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return

  // A real hide (not moving off-screen): on Windows Chromium marks an off-screen
  // window as occluded and keeps it blank after it is moved back
  if (mainWindow.isVisible()) {
    stopFrontReassert()
    stopBackgroundGuard()
    mainWindow.hide()
  } else {
    // 重新显示时不断重申置顶属性，抵消其他前台软件持续抢占
    showMainWindow(mainWindow)
  }
}

export function toggleIgnoreMouse() {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
  state.ignoreMouse = !state.ignoreMouse
  mainWindow.setIgnoreMouseEvents(state.ignoreMouse)
  showToolbar()
  mainWindow.webContents.send('sync-app-state', state)
}

export function stepOpacity(direction: 1 | -1) {
  adjustOpacity(direction * OPACITY_STEP)
}

export function moveMainWindow(dx: number, dy: number) {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  const [x, y] = mainWindow.getPosition()
  mainWindow.setPosition(x + dx * MOVE_STEP, y + dy * MOVE_STEP)
}
