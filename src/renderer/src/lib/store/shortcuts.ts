import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { isMac, platformAlt } from '../utils/env'
import definitions from '../../../../../shortcuts.config.json'
import type { ShortcutRegistration } from '../../../../preload/contracts'

export type Shortcut = {
  action: string
  key: string
  defaultKey: string
  category: string
}

export const shortcutDefinitions = definitions

const defaults = () =>
  Object.fromEntries(
    Object.entries(definitions).map(([action, definition]) => {
      const key = definition.key.replace('Primary', platformAlt)
      return [action, { action, key, defaultKey: key, category: definition.category }]
    })
  )

interface ShortcutsStore {
  shortcuts: Record<string, Shortcut>
  registrations: Record<string, ShortcutRegistration>
  recording: boolean
  updateShortcut: (action: string, shortcut: Shortcut) => void
  updateShortcuts: (shortcuts: Record<string, Shortcut>) => void
  setRegistrations: (registrations: Record<string, ShortcutRegistration>) => void
  setRecording: (recording: boolean) => void
  resetShortcuts: () => void
}

export const useShortcutsStore = create<ShortcutsStore>()(
  persist(
    (set) => ({
      shortcuts: defaults(),
      registrations: {},
      recording: false,
      updateShortcut: (action, shortcut) =>
        set((state) => ({ shortcuts: { ...state.shortcuts, [action]: shortcut } })),
      updateShortcuts: (shortcuts) => set({ shortcuts }),
      setRegistrations: (registrations) => set({ registrations }),
      setRecording: (recording) => set({ recording }),
      resetShortcuts: () => set({ shortcuts: defaults() })
    }),
    {
      name: 'interview-coder-shortcuts',
      version: 5,
      partialize: (state) => ({ shortcuts: state.shortcuts }),
      migrate: (persisted, version) => {
        const saved = persisted as { shortcuts?: Record<string, Shortcut> }
        if (version < 3 && !isMac) {
          for (const shortcut of Object.values(saved.shortcuts ?? {})) {
            shortcut.key = shortcut.key.replace(/\bAlt\b/g, 'CommandOrControl')
          }
        }
        return saved as ShortcutsStore
      },
      merge: (persisted, current) => {
        const saved = persisted as { shortcuts?: Record<string, Shortcut> } | undefined
        const shortcuts = defaults()
        for (const [action, shortcut] of Object.entries(saved?.shortcuts ?? {})) {
          if (action in shortcuts) shortcuts[action] = { ...shortcuts[action], key: shortcut.key }
        }
        return { ...current, shortcuts }
      }
    }
  )
)
