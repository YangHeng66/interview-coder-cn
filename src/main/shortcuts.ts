import { globalShortcut, ipcMain } from 'electron'
import './model-diagnostics'
import shortcutConfig from '../../shortcuts.config.json'
import type { ShortcutRegistration } from '../preload/contracts'
import { setToolbarWanted } from './toolbar-window'
import { state } from './state'
import { clearTranscriptionText } from './transcription'
import { normalizeShortcutKey } from './shortcut-keys'
import { setAssistantMode, stopCurrentStream, submitTranscriptionToChat } from './assistant/chat'
import { appendScreenshot, takeScreenshotAndSolve } from './assistant/vision'
import {
  moveMainWindow,
  stepOpacity,
  toggleIgnoreMouse,
  toggleMainWindow
} from './assistant/window-control'
import './assistant/session'
import './assistant/review'
import './assistant/mock-interview'

type Shortcut = {
  action: string
  key: string
  status: ShortcutStatus
  registeredKeys: string[]
  conflictAction?: string
}

enum ShortcutStatus {
  Registered = 'registered',
  Failed = 'failed',
  /** Shortcut is available to register but not registered. */
  Available = 'available',
  Disabled = 'disabled',
  Conflict = 'conflict'
}

const shortcuts: Record<string, Shortcut> = {}
let shortcutRecording = false

function sendToCoderPage(channel: string, ...args: unknown[]) {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
  mainWindow.webContents.send(channel, ...args)
}

const callbacks: Record<string, () => void> = {
  switchAssistantMode: () => {
    if (state.inCoderPage) setAssistantMode(state.assistantMode === 'chat' ? 'screenshot' : 'chat')
  },
  increaseFontSize: () => global.mainWindow?.webContents.send('reader-action', 'increaseFontSize'),
  decreaseFontSize: () => global.mainWindow?.webContents.send('reader-action', 'decreaseFontSize'),
  toggleScreenshots: () =>
    global.mainWindow?.webContents.send('reader-action', 'toggleScreenshots'),
  hideOrShowMainWindow: toggleMainWindow,
  takeScreenshot: () => void takeScreenshotAndSolve(),
  appendScreenshot: () => void appendScreenshot(),
  stopSolutionStream: () => void stopCurrentStream(),
  ignoreOrEnableMouse: toggleIgnoreMouse,
  increaseOpacity: () => stepOpacity(1),
  decreaseOpacity: () => stepOpacity(-1),
  pageUp: () => sendToCoderPage('scroll-page-up'),
  pageDown: () => sendToCoderPage('scroll-page-down'),
  moveMainWindowUp: () => moveMainWindow(0, -1),
  moveMainWindowDown: () => moveMainWindow(0, 1),
  moveMainWindowLeft: () => moveMainWindow(-1, 0),
  moveMainWindowRight: () => moveMainWindow(1, 0),
  toggleTranscription: () => sendToCoderPage('toggle-transcription'),
  pauseResumeTranscription: () => {
    if (state.inCoderPage) global.mainWindow?.webContents.send('pause-resume-transcription')
  },
  clearTranscription: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    clearTranscriptionText('manual')
    mainWindow.webContents.send('transcription-cleared')
  },
  sendTranscriptionToChat: () => {
    submitTranscriptionToChat()
  }
}

const clickableActions = new Set([
  'takeScreenshot',
  'appendScreenshot',
  'stopSolutionStream',
  'ignoreOrEnableMouse',
  'increaseOpacity',
  'decreaseOpacity',
  'pageUp',
  'pageDown',
  'moveMainWindowUp',
  'moveMainWindowDown',
  'moveMainWindowLeft',
  'moveMainWindowRight',
  'toggleTranscription',
  'pauseResumeTranscription',
  'clearTranscription',
  'sendTranscriptionToChat'
])

function unregisterShortcut(action: string) {
  const shortcut = shortcuts[action]
  if (!shortcut) return
  if (shortcut.registeredKeys.length) {
    shortcut.registeredKeys.forEach((registeredKey) => {
      globalShortcut.unregister(registeredKey)
    })
  }
  shortcut.status = ShortcutStatus.Available
  shortcut.registeredKeys = []
}

function getShortcutRegistrationKeys(key: string) {
  return [key]
}

function registerShortcut(action: string, key: string) {
  if (!key || shortcutConfig[action as keyof typeof shortcutConfig].scope === 'local') {
    shortcuts[action] = {
      action,
      key,
      status: key ? ShortcutStatus.Registered : ShortcutStatus.Disabled,
      registeredKeys: []
    }
    return
  }
  const keysToRegister = getShortcutRegistrationKeys(key)
  const registeredKeys: string[] = []
  keysToRegister.forEach((shortcutKey) => {
    if (globalShortcut.register(shortcutKey, callbacks[action])) {
      registeredKeys.push(shortcutKey)
    }
  })

  shortcuts[action] = {
    action,
    key,
    status: registeredKeys.length ? ShortcutStatus.Registered : ShortcutStatus.Failed,
    registeredKeys
  }
}

ipcMain.handle('getShortcuts', () => shortcuts)

function registerShortcutSet(bindings: { action: string; key: string }[]) {
  Object.keys(shortcuts).forEach(unregisterShortcut)
  const owners = new Map<string, string>()
  for (const binding of bindings) {
    const definition = shortcutConfig[binding.action as keyof typeof shortcutConfig]
    const normalized = normalizeShortcutKey(binding.key, process.platform)
    const owner = owners.get(normalized)
    if (binding.key && owner) {
      shortcuts[binding.action] = {
        ...binding,
        status: ShortcutStatus.Conflict,
        conflictAction: owner,
        registeredKeys: []
      }
    } else {
      if (binding.key) owners.set(normalized, binding.action)
      if (shortcutRecording && definition.scope === 'global') {
        shortcuts[binding.action] = {
          ...binding,
          status: ShortcutStatus.Available,
          registeredKeys: []
        }
      } else registerShortcut(binding.action, binding.key)
    }
  }
  return shortcuts satisfies Record<string, ShortcutRegistration>
}

ipcMain.handle('setShortcutRecording', (_event, recording: boolean) => {
  shortcutRecording = recording
  return registerShortcutSet(Object.values(shortcuts).map(({ action, key }) => ({ action, key })))
})

ipcMain.handle(
  'initShortcuts',
  (_event, shortcuts: Record<string, { action: string; key: string }>) => {
    return registerShortcutSet(
      Object.entries(shortcuts).map(([action, { key }]) => ({ action, key }))
    )
  }
)

ipcMain.handle('updateShortcuts', (_event, _shortcuts: { action: string; key: string }[]) => {
  const merged = Object.fromEntries(
    Object.values(shortcuts).map(({ action, key }) => [action, { action, key }])
  )
  _shortcuts.forEach((binding) => {
    merged[binding.action] = binding
  })
  return registerShortcutSet(Object.values(merged))
})

ipcMain.handle('triggerAction', (_event, action: string) => {
  if (!clickableActions.has(action)) return false
  callbacks[action]?.()
  return true
})

ipcMain.handle('setToolbarVisible', (_event, visible: boolean) => {
  setToolbarWanted(visible)
})
