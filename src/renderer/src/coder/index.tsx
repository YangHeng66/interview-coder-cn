import { useCallback, useEffect } from 'react'
import { toast } from 'sonner'
import {
  createTranscriptionConfig,
  getTranscriptionConfigError,
  useSettingsStore
} from '@/lib/store/settings'
import { useAppStore } from '@/lib/store/app'
import { useTranscriptionStore } from '@/lib/store/transcription'
import { useSolutionStore } from '@/lib/store/solution'
import { useChatStore } from '@/lib/store/chat'
import { useKnowledgeStore } from '@/lib/store/knowledge'
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
  const {
    isTranscribing,
    isPaused,
    setIsTranscribing,
    setIsPaused,
    setTranscriptionText,
    clearText
  } = useTranscriptionStore()
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
      setIsPaused(false)
      await window.api.updateAppState({ transcriptionPaused: false })
      await window.api.stopTranscription()
      stopAudioCapture()
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
      const captureResult = await startAudioCapture()
      await window.api.updateAppState({ transcriptionPaused: false })
      await window.api.startTranscription(transcriptionConfig)
      setIsTranscribing(true)
      setIsPaused(false)
      showModeError(null)
      captureResult.warnings.forEach((warning) => toast.warning(warning))
    } catch (error) {
      console.error('Failed to start transcription:', error)
      stopAudioCapture()
      setIsPaused(false)
      void window.api.updateAppState({ transcriptionPaused: false })
      const detail = error instanceof Error ? error.message : String(error)
      showModeError(`启动语音转录失败：${detail}`)
    }
  }, [isTranscribing, setIsPaused, setIsTranscribing, showModeError])

  const handlePauseTranscription = useCallback(async () => {
    if (!isTranscribing) return

    setIsPaused(true)
    try {
      await window.api.updateAppState({ transcriptionPaused: true })
      await window.api.stopTranscription()
    } catch (error) {
      setIsPaused(false)
      void window.api.updateAppState({ transcriptionPaused: false })
      const detail = error instanceof Error ? error.message : String(error)
      showModeError(`暂停语音识别失败：${detail}`)
    } finally {
      stopAudioCapture()
      setIsTranscribing(false)
    }
  }, [isTranscribing, setIsPaused, setIsTranscribing, showModeError])

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
    window.api.updateAppState({
      inCoderPage: true,
      assistantMode: initialMode,
      transcriptionPaused: false
    })
    return () => {
      window.api.updateAppState({ inCoderPage: false, transcriptionPaused: false })
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
    window.api.onChatEvent((event) => {
      if (event.type === 'conversation-cleared') {
        useKnowledgeStore.getState().clearChatContexts()
      }
      handleChatEvent(event)
    })
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
      setIsPaused(false)
      void window.api.updateAppState({ transcriptionPaused: false })
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
  }, [setTranscriptionText, showModeError, setIsPaused, setIsTranscribing, clearText])

  useEffect(() => {
    return () => {
      const transcriptionState = useTranscriptionStore.getState()
      if (transcriptionState.isTranscribing) {
        void window.api.stopTranscription().finally(() => stopAudioCapture())
      }
      transcriptionState.setIsPaused(false)
    }
  }, [])

  return (
    <div className="relative h-screen">
      <AppHeader />
      <div className={assistantMode === 'screenshot' ? 'contents' : 'hidden'}>
        <AppContent />
        <TranscriptionBar
          isPaused={isPaused}
          onPause={handlePauseTranscription}
          onResume={() => void handleToggleTranscription()}
        />
        <AppStatusBar />
      </div>
      <div className={assistantMode === 'chat' ? 'contents' : 'hidden'}>
        <ChatWorkspace
          isPaused={isPaused}
          onPauseTranscription={() => void handlePauseTranscription()}
          onToggleTranscription={() => void handleToggleTranscription()}
        />
      </div>
      <PrerequisitesChecker />
    </div>
  )
}
