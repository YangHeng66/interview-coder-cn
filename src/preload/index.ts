import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { AppSettings } from '../main/settings'
import type { AppState } from '../main/state'
import type {
  ChatDocument,
  ChatEvent,
  ChatRequestResult,
  KnowledgeContextUsed,
  KnowledgeDiagnosticInput,
  KnowledgeDiagnostic,
  KnowledgePassage,
  KnowledgeImportProgress,
  KnowledgeImportResult,
  KnowledgeLinkPatch,
  KnowledgeProfile,
  KnowledgeProfileInput,
  KnowledgeProfilePatch,
  KnowledgeResult,
  KnowledgeSnapshot,
  TranscriptionConfig,
  TranscriptionTextEvent,
  TranscriptionStatusEvent
} from './contracts'
import type {
  LocalDirectory,
  AssistantMode,
  ConversationSummary,
  ConversationView,
  ModelDiagnosticInput,
  ModelDiagnosticResult,
  ShortcutRegistration
} from './contracts'

// Custom APIs for renderer
const api = {
  getUpdateStatus: () =>
    ipcRenderer.invoke('getUpdateStatus') as Promise<'available' | 'downloaded' | null>,
  downloadAppUpdate: () => ipcRenderer.invoke('downloadAppUpdate'),
  installAppUpdate: () => ipcRenderer.invoke('installAppUpdate'),
  onUpdateStatus: (callback: (status: 'available' | 'downloaded') => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: 'available' | 'downloaded') =>
      callback(status)
    ipcRenderer.on('update-status', listener)
    return () => {
      ipcRenderer.removeListener('update-status', listener)
    }
  },
  browseLocalDirectory: (path: string | null) =>
    ipcRenderer.invoke('browseLocalDirectory', path) as Promise<LocalDirectory>,
  readChatDocuments: (paths: string[]) =>
    ipcRenderer.invoke('readChatDocuments', paths) as Promise<ChatDocument[]>,
  getConversations: () =>
    ipcRenderer.invoke('getConversations') as Promise<{
      conversations: ConversationSummary[]
      active: Record<AssistantMode, string | null>
      error: string | null
    }>,
  getConversationViews: () =>
    ipcRenderer.invoke('getConversationViews') as Promise<Record<AssistantMode, ConversationView>>,
  openConversation: (id: string) =>
    ipcRenderer.invoke('openConversation', id) as Promise<Record<AssistantMode, ConversationView>>,
  newConversation: (mode: AssistantMode) =>
    ipcRenderer.invoke('newConversation', mode) as Promise<Record<AssistantMode, ConversationView>>,
  renameConversation: (id: string, title: string) =>
    ipcRenderer.invoke('renameConversation', id, title),
  deleteConversation: (id: string) =>
    ipcRenderer.invoke('deleteConversation', id) as Promise<
      Record<AssistantMode, ConversationView>
    >,
  exportConversation: (id: string) =>
    ipcRenderer.invoke('exportConversation', id) as Promise<string>,
  onConversationStorageError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message)
    ipcRenderer.on('conversation-storage-error', listener)
    return () => {
      ipcRenderer.removeListener('conversation-storage-error', listener)
    }
  },
  diagnoseModel: (input: ModelDiagnosticInput) =>
    ipcRenderer.invoke('diagnoseModel', input) as Promise<ModelDiagnosticResult>,
  setShortcutRecording: (recording: boolean) =>
    ipcRenderer.invoke('setShortcutRecording', recording) as Promise<
      Record<string, ShortcutRegistration>
    >,
  onReaderAction: (callback: (action: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: string) => callback(action)
    ipcRenderer.on('reader-action', listener)
    return () => {
      ipcRenderer.removeListener('reader-action', listener)
    }
  },
  // Get app settings
  getAppSettings: () => ipcRenderer.invoke('getAppSettings'),
  // Update app settings
  updateAppSettings: (settings: Partial<AppSettings>) =>
    ipcRenderer.invoke('updateAppSettings', settings),

  // Update app state
  updateAppState: (state: Partial<AppState>) => ipcRenderer.invoke('updateAppState', state),
  // Listen for app state
  onSyncAppState: (callback: (state: AppState) => void) => {
    ipcRenderer.on('sync-app-state', (_event, state) => {
      callback(state)
    })
  },
  // Remove app state listener
  removeSyncAppStateListener: () => {
    ipcRenderer.removeAllListeners('sync-app-state')
  },

  // Init shortcuts
  initShortcuts: (shortcuts: Record<string, { action: string; key: string }>) =>
    ipcRenderer.invoke('initShortcuts', shortcuts),
  // Get shortcuts
  getShortcuts: () =>
    ipcRenderer.invoke('getShortcuts') as Promise<Record<string, ShortcutRegistration>>,
  // Update shortcuts
  updateShortcuts: (shortcuts: { action: string; key: string }[]) =>
    ipcRenderer.invoke('updateShortcuts', shortcuts) as Promise<
      Record<string, ShortcutRegistration>
    >,

  // Trigger the small set of user-facing actions exposed by the overlay toolbar.
  triggerAction: (
    action:
      | 'takeScreenshot'
      | 'appendScreenshot'
      | 'stopSolutionStream'
      | 'ignoreOrEnableMouse'
      | 'increaseOpacity'
      | 'decreaseOpacity'
      | 'pageUp'
      | 'pageDown'
      | 'moveMainWindowUp'
      | 'moveMainWindowDown'
      | 'moveMainWindowLeft'
      | 'moveMainWindowRight'
      | 'toggleTranscription'
      | 'pauseResumeTranscription'
      | 'clearTranscription'
      | 'sendTranscriptionToChat'
  ) => ipcRenderer.invoke('triggerAction', action),
  setToolbarVisible: (visible: boolean) => ipcRenderer.invoke('setToolbarVisible', visible),

  // Settings the toolbar window needs, pushed from main (its own store is a separate copy)
  onSyncToolbarSettings: (callback: (settings: { hoverDelay: number }) => void) => {
    ipcRenderer.on('sync-toolbar-settings', (_event, settings) => {
      callback(settings)
    })
  },
  removeSyncToolbarSettingsListener: () => {
    ipcRenderer.removeAllListeners('sync-toolbar-settings')
  },

  // Listen for window opacity adjustments triggered by shortcuts
  onAdjustOpacity: (callback: (delta: number) => void) => {
    ipcRenderer.on('adjust-opacity', (_event, delta) => {
      callback(delta)
    })
  },
  removeAdjustOpacityListener: () => {
    ipcRenderer.removeAllListeners('adjust-opacity')
  },

  // Listen for screenshot events
  onScreenshotTaken: (callback: (screenshotData: string) => void) => {
    ipcRenderer.on('screenshot-taken', (_event, screenshotData) => {
      callback(screenshotData)
    })
  },
  // Remove screenshot listener
  removeScreenshotListener: () => {
    ipcRenderer.removeAllListeners('screenshot-taken')
  },

  // Listen for solution chunks
  onSolutionChunk: (callback: (chunk: string) => void) => {
    ipcRenderer.on('solution-chunk', (_event, chunk) => {
      callback(chunk)
    })
  },
  // Remove solution chunk listener
  removeSolutionChunkListener: () => {
    ipcRenderer.removeAllListeners('solution-chunk')
  },

  // Stop solution stream
  stopSolutionStream: () => ipcRenderer.invoke('stopSolutionStream'),

  // Send follow-up question
  sendFollowUpQuestion: (question: string) => ipcRenderer.invoke('sendFollowUpQuestion', question),

  // Pure-text chat
  sendChatMessage: (text: string, documents?: ChatDocument[]) =>
    ipcRenderer.invoke('sendChatMessage', text, documents) as Promise<ChatRequestResult>,
  sendTranscriptionToChat: () =>
    ipcRenderer.invoke('sendTranscriptionToChat') as Promise<ChatRequestResult>,
  clearAutoReplyQueue: () => ipcRenderer.invoke('clearAutoReplyQueue') as Promise<boolean>,
  clearChatConversation: () => ipcRenderer.invoke('clearChatConversation') as Promise<boolean>,
  onChatEvent: (callback: (event: ChatEvent) => void) => {
    ipcRenderer.on('chat-event', (_event, event) => callback(event))
  },
  removeChatEventListener: () => {
    ipcRenderer.removeAllListeners('chat-event')
  },

  // Local knowledge base
  diagnoseKnowledge: (input: KnowledgeDiagnosticInput) =>
    ipcRenderer.invoke('diagnoseKnowledge', input) as Promise<KnowledgeResult<KnowledgeDiagnostic>>,
  previewKnowledgeDocument: (documentId: string) =>
    ipcRenderer.invoke('previewKnowledgeDocument', documentId) as Promise<
      KnowledgeResult<KnowledgePassage[]>
    >,
  getKnowledgeSnapshot: () =>
    ipcRenderer.invoke('getKnowledgeSnapshot') as Promise<KnowledgeSnapshot>,
  createKnowledgeProfile: (input: KnowledgeProfileInput) =>
    ipcRenderer.invoke('createKnowledgeProfile', input) as Promise<
      KnowledgeResult<KnowledgeProfile>
    >,
  updateKnowledgeProfile: (profileId: string, patch: KnowledgeProfilePatch) =>
    ipcRenderer.invoke('updateKnowledgeProfile', profileId, patch) as Promise<
      KnowledgeResult<KnowledgeProfile>
    >,
  deleteKnowledgeProfile: (profileId: string) =>
    ipcRenderer.invoke('deleteKnowledgeProfile', profileId) as Promise<
      KnowledgeResult<KnowledgeSnapshot>
    >,
  activateKnowledgeProfile: (profileId: string | null) =>
    ipcRenderer.invoke('activateKnowledgeProfile', profileId) as Promise<
      KnowledgeResult<KnowledgeSnapshot>
    >,
  setBuiltinKnowledgeEnabled: (enabled: boolean) =>
    ipcRenderer.invoke('setBuiltinKnowledgeEnabled', enabled) as Promise<
      KnowledgeResult<KnowledgeSnapshot>
    >,
  importKnowledgeDocuments: (profileId: string | undefined, paths: string[]) =>
    ipcRenderer.invoke('importKnowledgeDocuments', profileId, paths) as Promise<
      KnowledgeResult<KnowledgeImportResult | null>
    >,
  updateKnowledgeDocumentLink: (profileId: string, documentId: string, patch: KnowledgeLinkPatch) =>
    ipcRenderer.invoke('updateKnowledgeDocumentLink', profileId, documentId, patch) as Promise<
      KnowledgeResult<KnowledgeSnapshot>
    >,
  deleteKnowledgeDocument: (documentId: string) =>
    ipcRenderer.invoke('deleteKnowledgeDocument', documentId) as Promise<
      KnowledgeResult<KnowledgeSnapshot>
    >,
  retryKnowledgeDocument: (documentId: string) =>
    ipcRenderer.invoke('retryKnowledgeDocument', documentId) as Promise<
      KnowledgeResult<KnowledgeSnapshot>
    >,
  onKnowledgeSnapshotChanged: (callback: (snapshot: KnowledgeSnapshot) => void) => {
    ipcRenderer.on('knowledge-snapshot-changed', (_event, snapshot) => callback(snapshot))
  },
  removeKnowledgeSnapshotChangedListener: () => {
    ipcRenderer.removeAllListeners('knowledge-snapshot-changed')
  },
  onKnowledgeImportProgress: (callback: (progress: KnowledgeImportProgress) => void) => {
    ipcRenderer.on('knowledge-import-progress', (_event, progress) => callback(progress))
  },
  removeKnowledgeImportProgressListener: () => {
    ipcRenderer.removeAllListeners('knowledge-import-progress')
  },
  onKnowledgeContextUsed: (callback: (context: KnowledgeContextUsed) => void) => {
    ipcRenderer.on('knowledge-context-used', (_event, context) => callback(context))
  },
  removeKnowledgeContextUsedListener: () => {
    ipcRenderer.removeAllListeners('knowledge-context-used')
  },

  // Listen for solution completion
  onSolutionComplete: (callback: () => void) => {
    ipcRenderer.on('solution-complete', callback)
  },
  removeSolutionCompleteListener: () => {
    ipcRenderer.removeAllListeners('solution-complete')
  },

  onSolutionStopped: (callback: () => void) => {
    ipcRenderer.on('solution-stopped', callback)
  },
  removeSolutionStoppedListener: () => {
    ipcRenderer.removeAllListeners('solution-stopped')
  },

  onSolutionError: (callback: (message: string) => void) => {
    ipcRenderer.on('solution-error', (_event, message) => {
      callback(message)
    })
  },
  removeSolutionErrorListener: () => {
    ipcRenderer.removeAllListeners('solution-error')
  },

  // Listen for scroll page up
  onScrollPageUp: (callback: () => void) => {
    ipcRenderer.on('scroll-page-up', callback)
  },
  // Remove scroll page up listener
  removeScrollPageUpListener: () => {
    ipcRenderer.removeAllListeners('scroll-page-up')
  },

  // Listen for screenshots-updated (gallery)
  onScreenshotsUpdated: (callback: (screenshots: string[]) => void) => {
    ipcRenderer.on('screenshots-updated', (_event, screenshots) => {
      callback(screenshots)
    })
  },
  removeScreenshotsUpdatedListener: () => {
    ipcRenderer.removeAllListeners('screenshots-updated')
  },

  // Listen for scroll page down
  onScrollPageDown: (callback: () => void) => {
    ipcRenderer.on('scroll-page-down', callback)
  },
  // Remove scroll page down listener
  removeScrollPageDownListener: () => {
    ipcRenderer.removeAllListeners('scroll-page-down')
  },

  // AI loading events
  onAiLoadingStart: (callback: () => void) => {
    ipcRenderer.on('ai-loading-start', callback)
  },
  onAiLoadingEnd: (callback: () => void) => {
    ipcRenderer.on('ai-loading-end', callback)
  },
  removeAiLoadingStartListener: () => {
    ipcRenderer.removeAllListeners('ai-loading-start')
  },
  removeAiLoadingEndListener: () => {
    ipcRenderer.removeAllListeners('ai-loading-end')
  },

  // Solution clear event (new session)
  onSolutionClear: (callback: () => void) => {
    ipcRenderer.on('solution-clear', callback)
  },
  removeSolutionClearListener: () => {
    ipcRenderer.removeAllListeners('solution-clear')
  },

  // Select screenshot save directory

  // Transcription
  startTranscription: (config: TranscriptionConfig, sessionId: string) =>
    ipcRenderer.invoke('start-transcription', config, sessionId),
  stopTranscription: () => ipcRenderer.invoke('stop-transcription'),
  sendTranscriptionAudioChunk: (sessionId: string, chunk: ArrayBuffer) =>
    ipcRenderer.send('transcription-audio-chunk', sessionId, chunk),
  getTranscriptionText: () => ipcRenderer.invoke('get-transcription-text') as Promise<string>,

  onToggleTranscription: (callback: () => void) => {
    ipcRenderer.on('toggle-transcription', callback)
  },
  removeToggleTranscriptionListener: () => {
    ipcRenderer.removeAllListeners('toggle-transcription')
  },
  onPauseResumeTranscription: (callback: () => void) => {
    ipcRenderer.on('pause-resume-transcription', callback)
    return () => {
      ipcRenderer.removeListener('pause-resume-transcription', callback)
    }
  },
  onTranscriptionStatus: (callback: (event: TranscriptionStatusEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, data: TranscriptionStatusEvent) =>
      callback(data)
    ipcRenderer.on('transcription-status', listener)
    return () => ipcRenderer.removeListener('transcription-status', listener)
  },
  onTranscriptionText: (callback: (data: TranscriptionTextEvent) => void) => {
    ipcRenderer.on('transcription-text', (_event, data) => callback(data))
  },
  removeTranscriptionTextListener: () => {
    ipcRenderer.removeAllListeners('transcription-text')
  },
  onTranscriptionError: (callback: (message: string) => void) => {
    ipcRenderer.on('transcription-error', (_event, message) => callback(message))
  },
  removeTranscriptionErrorListener: () => {
    ipcRenderer.removeAllListeners('transcription-error')
  },
  onTranscriptionStopped: (callback: () => void) => {
    ipcRenderer.on('transcription-stopped', callback)
  },
  removeTranscriptionStoppedListener: () => {
    ipcRenderer.removeAllListeners('transcription-stopped')
  },
  onTranscriptionCleared: (callback: () => void) => {
    ipcRenderer.on('transcription-cleared', callback)
  },
  removeTranscriptionClearedListener: () => {
    ipcRenderer.removeAllListeners('transcription-cleared')
  }
}

export type MainAPI = typeof api

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
