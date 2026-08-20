import { ipcMain } from 'electron'
import type { AssistantMode } from '../preload/contracts'

ipcMain.handle('updateAppState', (_event, _state) => {
  Object.assign(state, _state)
})

export const state = {
  inCoderPage: false,
  ignoreMouse: false,
  assistantMode: 'screenshot' as AssistantMode
}

export type AppState = typeof state
