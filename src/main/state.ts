import { ipcMain } from 'electron'
import type { AssistantMode } from '../preload/contracts'

const stateListeners = new Set<(state: AppState) => void>()

ipcMain.handle('updateAppState', (_event, _state) => {
  Object.assign(state, _state)
  stateListeners.forEach((listener) => listener(state))
})

export const state = {
  inCoderPage: false,
  ignoreMouse: false,
  assistantMode: 'screenshot' as AssistantMode,
  transcriptionPaused: false
}

export type AppState = typeof state

export function subscribeAppState(listener: (state: AppState) => void): () => void {
  stateListeners.add(listener)
  return () => stateListeners.delete(listener)
}
