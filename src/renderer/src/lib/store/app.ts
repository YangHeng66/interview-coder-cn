import { create } from 'zustand'
import type { AssistantMode } from '../../../../preload/contracts'

interface AppState {
  ignoreMouse: boolean
  assistantMode: AssistantMode
  transcriptionPaused: boolean
}

interface AppStore extends AppState {
  setIgnoreMouse: (ignore: boolean) => void
  toggleIgnoreMouse: () => void
  setAssistantMode: (mode: AssistantMode) => void
  syncAppState: (state: AppState) => void
}

const defaultState: AppState = {
  ignoreMouse: false,
  assistantMode: 'screenshot',
  transcriptionPaused: false
}

export const useAppStore = create<AppStore>()((set) => ({
  ...defaultState,
  setIgnoreMouse: (ignore) => {
    set({ ignoreMouse: ignore })
  },
  toggleIgnoreMouse: () => {
    set((state) => ({ ignoreMouse: !state.ignoreMouse }))
  },
  setAssistantMode: (mode) => {
    set({ assistantMode: mode })
  },
  syncAppState: (state) => {
    set(state)
  }
}))
