import { useEffect, useState } from 'react'
import { HashRouter, Routes, Route, useLocation } from 'react-router'
import { Toaster } from 'sonner'
import CoderPage from '@/coder'
import SettingsPage from '@/settings'
import HelpPage from '@/help'
import KnowledgePage from '@/knowledge'
import { OverlayToolbar } from '@/coder/OverlayToolbar'
import { useSettingsStore } from '@/lib/store/settings'
import { useShortcutsStore } from '@/lib/store/shortcuts'
import { getCloneableFields } from '@/lib/utils'
import { useKnowledgeStore } from '@/lib/store/knowledge'
import { ProtectedHints } from '@/components/ProtectedHints'
import { LocalFilePicker } from '@/components/LocalFilePicker'
import { UpdateNotice } from '@/components/UpdateNotice'

export default function App() {
  const isToolbar = /^#\/?toolbar(?:$|\?)/.test(window.location.hash)
  const [initialized, setInitialized] = useState(false)
  const settingsStore = useSettingsStore()
  const { shortcuts } = useShortcutsStore()

  useEffect(() => {
    if (isToolbar) return
    window.api.getAppSettings().then((settings) => {
      const blankFields = Object.keys(settings).filter(
        (key) => settings[key] && !settingsStore[key]
      )
      settingsStore.syncSettings(
        blankFields.reduce(
          (acc, key) => {
            acc[key] = settings[key]
            return acc
          },
          {} as Partial<typeof settingsStore>
        )
      )
      setInitialized(true)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (initialized && !isToolbar) {
      window.api.updateAppSettings(getCloneableFields(settingsStore))
    }
  }, [initialized, settingsStore, isToolbar])

  useEffect(() => {
    if (isToolbar) return
    void window.api
      .initShortcuts(shortcuts)
      .then(() => window.api.getShortcuts())
      .then(useShortcutsStore.getState().setRegistrations)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <>
      <HashRouter>
        <ToolbarVisibilityController />
        <KnowledgeSyncController />
        <Routes>
          <Route index element={<CoderPage />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route path="help" element={<HelpPage />} />
          <Route path="knowledge" element={<KnowledgePage />} />
          <Route path="toolbar" element={<OverlayToolbar />} />
        </Routes>
      </HashRouter>

      <Toaster />
      {!isToolbar && <ProtectedHints />}
      {!isToolbar && <LocalFilePicker />}
      {!isToolbar && <UpdateNotice />}
    </>
  )
}

function KnowledgeSyncController() {
  const location = useLocation()

  useEffect(() => {
    if (location.pathname === '/toolbar') return
    const store = useKnowledgeStore.getState()
    void store.initialize()
    window.api.onKnowledgeSnapshotChanged((snapshot) => {
      useKnowledgeStore.getState().setSnapshot(snapshot)
    })
    window.api.onKnowledgeImportProgress((progress) => {
      useKnowledgeStore.getState().handleImportProgress(progress)
    })
    window.api.onKnowledgeContextUsed((context) => {
      useKnowledgeStore.getState().handleContextUsed(context)
    })
    return () => {
      window.api.removeKnowledgeSnapshotChangedListener()
      window.api.removeKnowledgeImportProgressListener()
      window.api.removeKnowledgeContextUsedListener()
    }
  }, [location.pathname])

  return null
}

function ToolbarVisibilityController() {
  const location = useLocation()
  const showOverlayToolbar = useSettingsStore((state) => state.showOverlayToolbar)

  useEffect(() => {
    // The toolbar window renders this app too, but must not drive its own visibility
    if (location.pathname === '/toolbar') return
    void window.api.setToolbarVisible(location.pathname === '/' && showOverlayToolbar)
  }, [location.pathname, showOverlayToolbar])

  return null
}
