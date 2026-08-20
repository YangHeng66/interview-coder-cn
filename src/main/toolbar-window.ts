import { join } from 'node:path'
import { BrowserWindow, screen } from 'electron'
import { is } from '@electron-toolkit/utils'

const TOOLBAR_WIDTH = 520
const TOOLBAR_HEIGHT = 52
const TOOLBAR_INSET = 4
/** Mirrors the renderer's default opacity setting, until the renderer syncs the real one */
const DEFAULT_OPACITY = 0.8

let toolbarWindow: BrowserWindow | null = null
let ownerWindow: BrowserWindow | null = null
/** Whether the renderer wants the toolbar on screen (main page + enabled in settings) */
let isToolbarWanted = false
let toolbarOpacity = DEFAULT_OPACITY

/**
 * Click-through alternative to the global shortcuts: a small always-on-top
 * window of buttons, glued above the main window and hidden along with it.
 */
export function createToolbarWindow(parent: BrowserWindow): void {
  toolbarWindow = new BrowserWindow({
    width: TOOLBAR_WIDTH,
    height: TOOLBAR_HEIGHT,
    frame: false,
    transparent: true,
    hasShadow: false,
    // Clicking a button must never pull focus away from what the user is doing
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    show: false,
    parent,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })
  ownerWindow = parent

  toolbarWindow.setMenuBarVisibility(false)
  toolbarWindow.setOpacity(toolbarOpacity)
  toolbarWindow.setAlwaysOnTop(true, 'screen-saver', 2)
  toolbarWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  toolbarWindow.setContentProtection(true)

  parent.on('move', syncToolbarBounds)
  parent.on('resize', syncToolbarBounds)
  parent.on('show', showToolbar)
  parent.on('hide', hideToolbar)
  parent.on('closed', () => {
    if (toolbarWindow && !toolbarWindow.isDestroyed()) toolbarWindow.close()
    toolbarWindow = null
    ownerWindow = null
  })

  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    toolbarWindow.loadURL(`${process.env['ELECTRON_RENDERER_URL']}#/toolbar`)
  } else {
    toolbarWindow.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'toolbar' })
  }
}

/** Park the toolbar right above the main window, kept inside the current display */
function syncToolbarBounds(): void {
  if (!toolbarWindow || toolbarWindow.isDestroyed()) return
  if (!ownerWindow || ownerWindow.isDestroyed()) return

  const mainBounds = ownerWindow.getBounds()
  const workArea = screen.getDisplayMatching(mainBounds).workArea
  toolbarWindow.setBounds({
    x: Math.min(Math.max(mainBounds.x, workArea.x), workArea.x + workArea.width - TOOLBAR_WIDTH),
    y: Math.max(workArea.y, mainBounds.y - TOOLBAR_HEIGHT - TOOLBAR_INSET),
    width: TOOLBAR_WIDTH,
    height: TOOLBAR_HEIGHT
  })
}

/** Show the toolbar only if the renderer asked for it and the main window is on screen */
export function showToolbar(): void {
  if (!isToolbarWanted) return
  if (!toolbarWindow || toolbarWindow.isDestroyed()) return
  if (!ownerWindow || ownerWindow.isDestroyed() || !ownerWindow.isVisible()) return

  syncToolbarBounds()
  toolbarWindow.showInactive()
}

export function hideToolbar(): void {
  if (!toolbarWindow || toolbarWindow.isDestroyed()) return
  toolbarWindow.hide()
}

/**
 * The renderer owns whether the toolbar belongs on screen (main page + the
 * `showOverlayToolbar` setting); main only decides when it can actually show.
 */
export function setToolbarWanted(wanted: boolean): void {
  isToolbarWanted = wanted
  if (wanted) {
    showToolbar()
  } else {
    hideToolbar()
  }
}

/**
 * Keep the toolbar as translucent as the main window. The main window applies
 * opacity to its body via CSS; the toolbar is nothing but that bar, so the same
 * value is applied to the whole window (no-op on Linux).
 */
export function setToolbarOpacity(opacity: number): void {
  toolbarOpacity = opacity
  if (!toolbarWindow || toolbarWindow.isDestroyed()) return
  toolbarWindow.setOpacity(opacity)
}

/**
 * The toolbar lives in its own renderer, so it never sees the settings store
 * updates made in the main window; push the ones it needs over IPC instead.
 */
export function syncToolbarSettings(hoverDelay: number): void {
  if (!toolbarWindow || toolbarWindow.isDestroyed()) return
  toolbarWindow.webContents.send('sync-toolbar-settings', { hoverDelay })
}

/** Reclaim the top spot alongside the main window, without ever revealing a hidden toolbar */
export function reassertToolbarTopMost(level: number, aggressive: boolean): void {
  if (!toolbarWindow || toolbarWindow.isDestroyed() || !toolbarWindow.isVisible()) return
  toolbarWindow.setAlwaysOnTop(true, 'screen-saver', level)
  if (aggressive) toolbarWindow.moveTop()
}
