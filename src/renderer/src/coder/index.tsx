import { useCallback, useEffect } from 'react'
import {
  createTranscriptionConfig,
  getTranscriptionConfigError,
  useSettingsStore
} from '@/lib/store/settings'
import { useAppStore } from '@/lib/store/app'
import { useTranscriptionStore } from '@/lib/store/transcription'
import { useSolutionStore } from '@/lib/store/solution'
import { useChatStore } from '@/lib/store/chat'
import { startAudioCapture, stopAudioCapture } from '@/lib/audio-capture'

import { AppHeader } from './AppHeader'
import { AppContent } from './AppContent'
import { AppStatusBar } from './AppStatusBar'
import { PrerequisitesChecker } from './PrerequisitesChecker'
import { TranscriptionBar } from './TranscriptionBar'
import { ChatWorkspace } from './ChatWorkspace'

export default function CoderPage() {
  const { opacity, apiKey, chatApiKey, chatModel } = useSettingsStore()
  const { assistantMode, syncAppState, setAssistantMode } = useAppStore()
  const { isTranscribing, setIsTranscribing, setTranscriptionText, clearText } =
    useTranscriptionStore()
  const { setErrorMessage } = useSolutionStore()
  const { handleEvent: handleChatEvent } = useChatStore()

  const showModeError = useCallback(
    (message: string | null) => {
      if (useAppStore.getState().assistantMode === 'chat') {
        useChatStore.getState().setErrorMessage(message)
      } else {
        setErrorMessage(message)
      }
    },
    [setErrorMessage]
  )

  const handleToggleTranscription = useCallback(async () => {
    if (isTranscribing) {
      stopAudioCapture()
      await window.api.stopTranscription()
      setIsTranscribing(false)
      return
    }

    const transcriptionConfig = createTranscriptionConfig(useSettingsStore.getState())
    const configError = getTranscriptionConfigError(transcriptionConfig)
    if (configError) {
      showModeError(configError)
      return
    }

    try {
      await startAudioCapture()
      await window.api.startTranscription(transcriptionConfig)
      setIsTranscribing(true)
      showModeError(null)
    } catch (error) {
      console.error('Failed to start transcription:', error)
      stopAudioCapture()
      const detail = error instanceof Error ? error.message : String(error)
      showModeError(`启动语音转录失败：${detail}`)
    }
  }, [isTranscribing, setIsTranscribing, showModeError])

  useEffect(() => {
    document.body.style.opacity = opacity.toString()
    return () => {
      document.body.style.opacity = ''
    }
  }, [opacity])

  useEffect(() => {
    window.api.onAdjustOpacity((delta) => {
      useSettingsStore.getState().adjustOpacity(delta)
    })
    return () => {
      window.api.removeAdjustOpacityListener()
    }
  }, [])

  useEffect(() => {
    const initialMode =
      !apiKey.trim() && chatApiKey.trim() && chatModel.trim() ? 'chat' : assistantMode
    setAssistantMode(initialMode)
    window.api.updateAppState({ inCoderPage: true, assistantMode: initialMode })
    return () => {
      window.api.updateAppState({ inCoderPage: false })
    }
    // Only derive the initial mode when entering this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    window.api.onSyncAppState((state) => {
      syncAppState(state)
    })
    return () => {
      window.api.removeSyncAppStateListener()
    }
  }, [syncAppState])

  useEffect(() => {
    window.api.onToggleTranscription(handleToggleTranscription)
    return () => {
      window.api.removeToggleTranscriptionListener()
    }
  }, [handleToggleTranscription])

  useEffect(() => {
    window.api.onChatEvent(handleChatEvent)
    return () => {
      window.api.removeChatEventListener()
    }
  }, [handleChatEvent])

  useEffect(() => {
    window.api.onTranscriptionText((data) => {
      setTranscriptionText(data.text)
    })
    window.api.onTranscriptionError((message) => {
      showModeError(message)
      setIsTranscribing(false)
      stopAudioCapture()
    })
    window.api.onTranscriptionStopped(() => {
      setIsTranscribing(false)
      stopAudioCapture()
    })
    window.api.onTranscriptionCleared(() => {
      clearText()
    })

    return () => {
      window.api.removeTranscriptionTextListener()
      window.api.removeTranscriptionErrorListener()
      window.api.removeTranscriptionStoppedListener()
      window.api.removeTranscriptionClearedListener()
    }
  }, [setTranscriptionText, showModeError, setIsTranscribing, clearText])

  useEffect(() => {
    return () => {
      if (useTranscriptionStore.getState().isTranscribing) {
        stopAudioCapture()
        window.api.stopTranscription()
      }
    }
  }, [])

  return (
    <div className="relative h-screen">
      <AppHeader />
      <div className={assistantMode === 'screenshot' ? 'contents' : 'hidden'}>
        <AppContent />
        <TranscriptionBar />
        <AppStatusBar />
      </div>
      <div className={assistantMode === 'chat' ? 'contents' : 'hidden'}>
        <ChatWorkspace onToggleTranscription={() => void handleToggleTranscription()} />
      </div>
      <PrerequisitesChecker />
    </div>
  )
}
