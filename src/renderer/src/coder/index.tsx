import { useCallback, useEffect, useRef, type CSSProperties } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { createStreamBatch } from '@/lib/stream-batch'
import { ReaderBar } from './ReaderBar'
import { useShortcutsStore } from '@/lib/store/shortcuts'
import { getShortcutAccelerator } from '@/lib/utils/keyboard'
import { applyConversationViews } from '@/lib/conversations'
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
  const { opacity, apiKey, chatApiKey, chatModel, readerFontSize, readerLineHeight } =
    useSettingsStore()
  const { assistantMode, syncAppState, setAssistantMode } = useAppStore()
  const { isPaused, setIsTranscribing, setIsPaused, updateTranscript, clearText } =
    useTranscriptionStore(
      useShallow((s) => ({
        isPaused: s.isPaused,
        setIsTranscribing: s.setIsTranscribing,
        setIsPaused: s.setIsPaused,
        updateTranscript: s.updateTranscript,
        clearText: s.clearText
      }))
    )
  const speechAttempt = useRef(0)
  const speechSession = useRef<string | null>(null)
  const stoppingSpeech = useRef(false)
  const { setErrorMessage } = useSolutionStore()
  const { handleEvent: handleChatEvent } = useChatStore()

  useEffect(() => {
    void window.api.getConversationViews().then(applyConversationViews)
    return window.api.onConversationStorageError((message) =>
      toast.error(`会话保存失败：${message}`)
    )
  }, [])

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

  const stopSpeech = useCallback(
    async (paused: boolean) => {
      if (stoppingSpeech.current) return
      stoppingSpeech.current = true
      speechAttempt.current++
      setIsPaused(paused)
      useTranscriptionStore.getState().setStatus('finishing')
      try {
        await window.api.updateAppState({ transcriptionPaused: paused })
        await stopAudioCapture()
        await window.api.stopTranscription()
        if (useTranscriptionStore.getState().status !== 'error')
          useTranscriptionStore.getState().setStatus('stopped')
      } catch (error) {
        showModeError(`结束语音识别失败：${String(error)}`)
        useTranscriptionStore.getState().setStatus('error')
      } finally {
        setIsTranscribing(false)
        stoppingSpeech.current = false
      }
    },
    [setIsPaused, setIsTranscribing, showModeError]
  )

  const handleToggleTranscription = useCallback(async () => {
    if (stoppingSpeech.current) return
    if (useTranscriptionStore.getState().isTranscribing) {
      await stopSpeech(false)
      return
    }

    const transcriptionConfig = createTranscriptionConfig(useSettingsStore.getState())
    const configError = getTranscriptionConfigError(transcriptionConfig)
    if (configError) {
      showModeError(configError)
      return
    }

    const attempt = ++speechAttempt.current
    const sessionId = crypto.randomUUID()
    speechSession.current = sessionId
    setIsTranscribing(true)
    setIsPaused(false)
    useTranscriptionStore.getState().setStatus('connecting')
    useTranscriptionStore.getState().setError(null)
    try {
      await window.api.updateAppState({ transcriptionPaused: false })
      if (attempt !== speechAttempt.current) return
      await window.api.startTranscription(transcriptionConfig, sessionId)
      if (attempt !== speechAttempt.current) return
      const captureResult = await startAudioCapture(sessionId)
      if (attempt !== speechAttempt.current) return
      showModeError(null)
      captureResult.warnings.forEach((warning) => toast.warning(warning))
    } catch (error) {
      if (attempt !== speechAttempt.current) return
      console.error('Failed to start transcription:', error)
      await stopAudioCapture()
      await window.api.stopTranscription()
      setIsTranscribing(false)
      setIsPaused(false)
      useTranscriptionStore.getState().setStatus('error')
      void window.api.updateAppState({ transcriptionPaused: false })
      const detail = error instanceof Error ? error.message : String(error)
      showModeError(`启动语音转录失败：${detail}`)
    }
  }, [stopSpeech, setIsPaused, setIsTranscribing, showModeError])

  const handlePauseTranscription = useCallback(async () => {
    if (useTranscriptionStore.getState().isTranscribing) await stopSpeech(true)
  }, [stopSpeech])

  useEffect(
    () =>
      window.api.onPauseResumeTranscription(() => {
        if (useTranscriptionStore.getState().isPaused) void handleToggleTranscription()
        else void handlePauseTranscription()
      }),
    [handleToggleTranscription, handlePauseTranscription]
  )

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
    const batches = new Map<string, ReturnType<typeof createStreamBatch>>()
    const clearBatches = () => {
      batches.forEach((batch) => batch.clear())
      batches.clear()
    }
    window.addEventListener('conversation-restored', clearBatches)
    window.api.onChatEvent((event) => {
      if (event.type === 'assistant-delta') {
        if (!batches.has(event.messageId))
          batches.set(
            event.messageId,
            createStreamBatch((delta) => handleChatEvent({ ...event, delta }))
          )
        batches.get(event.messageId)!.push(event.delta)
        return
      }
      if ('messageId' in event) {
        batches.get(event.messageId)?.flush()
        batches.delete(event.messageId)
      }
      if (event.type === 'conversation-cleared') {
        batches.forEach((batch) => batch.clear())
        batches.clear()
        useKnowledgeStore.getState().clearChatContexts()
      }
      handleChatEvent(event)
    })
    return () => {
      batches.forEach((batch) => batch.clear())
      window.removeEventListener('conversation-restored', clearBatches)
      window.api.removeChatEventListener()
    }
  }, [handleChatEvent])

  useEffect(() => {
    const listener = (event: KeyboardEvent) => {
      const store = useShortcutsStore.getState()
      if (store.recording || event.repeat || event.isComposing) return
      const key = store.shortcuts.focusChatInput.key
      if (
        key &&
        getShortcutAccelerator(event) === key &&
        store.registrations.focusChatInput?.status === 'registered'
      ) {
        event.preventDefault()
        setAssistantMode('chat')
        void window.api.updateAppState({ assistantMode: 'chat' })
        requestAnimationFrame(() => document.getElementById('chat-input')?.focus())
      }
    }
    window.addEventListener('keydown', listener)
    return () => window.removeEventListener('keydown', listener)
  }, [setAssistantMode])

  useEffect(() => {
    const removeStatus = window.api.onTranscriptionStatus(({ sessionId, status }) => {
      if (sessionId === speechSession.current) useTranscriptionStore.getState().setStatus(status)
    })
    window.api.onTranscriptionText((data) => {
      updateTranscript(data)
    })
    window.api.onTranscriptionError((message) => {
      showModeError(message)
      speechAttempt.current++
      useTranscriptionStore.getState().setError(message)
      useTranscriptionStore.getState().setStatus('error')
      setIsTranscribing(false)
      setIsPaused(false)
      void window.api.updateAppState({ transcriptionPaused: false })
      void stopAudioCapture()
    })
    window.api.onTranscriptionStopped(() => {
      setIsTranscribing(false)
      void stopAudioCapture()
    })
    window.api.onTranscriptionCleared(() => {
      clearText()
    })

    return () => {
      removeStatus()
      window.api.removeTranscriptionTextListener()
      window.api.removeTranscriptionErrorListener()
      window.api.removeTranscriptionStoppedListener()
      window.api.removeTranscriptionClearedListener()
    }
  }, [updateTranscript, showModeError, setIsPaused, setIsTranscribing, clearText])

  useEffect(() => {
    return () => {
      speechAttempt.current++
      const transcriptionState = useTranscriptionStore.getState()
      void stopAudioCapture().then(() => window.api.stopTranscription())
      transcriptionState.setIsTranscribing(false)
      transcriptionState.setIsPaused(false)
    }
  }, [])

  return (
    <div
      className="coder-shell"
      style={
        {
          '--reader-font-size': `${readerFontSize}px`,
          '--reader-line-height': readerLineHeight
        } as CSSProperties
      }
    >
      <AppHeader />
      <ReaderBar />
      <div className={assistantMode === 'screenshot' ? 'screenshot-workspace' : 'hidden'}>
        <TranscriptionBar
          isPaused={isPaused}
          onPause={handlePauseTranscription}
          onResume={() => void handleToggleTranscription()}
        />
        <AppContent />
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
