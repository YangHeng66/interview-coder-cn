import { create } from 'zustand'
import type {
  KnowledgeContextUsed,
  KnowledgeImportProgress,
  KnowledgeSnapshot
} from '../../../../preload/contracts'

const emptySnapshot: KnowledgeSnapshot = {
  schemaVersion: 1,
  activeProfileId: null,
  builtinFrontendKnowledgeEnabled: true,
  profiles: [],
  documents: []
}

type KnowledgeState = {
  snapshot: KnowledgeSnapshot
  initialized: boolean
  errorMessage: string | null
  importProgress: Record<string, KnowledgeImportProgress>
  visionContext: KnowledgeContextUsed | null
  chatContexts: Record<string, KnowledgeContextUsed>
}

type KnowledgeStore = KnowledgeState & {
  initialize: () => Promise<void>
  setSnapshot: (snapshot: KnowledgeSnapshot) => void
  setErrorMessage: (message: string | null) => void
  handleImportProgress: (progress: KnowledgeImportProgress) => void
  handleContextUsed: (context: KnowledgeContextUsed) => void
  clearVisionContext: () => void
  clearChatContexts: () => void
}

export const useKnowledgeStore = create<KnowledgeStore>()((set, get) => ({
  snapshot: emptySnapshot,
  initialized: false,
  errorMessage: null,
  importProgress: {},
  visionContext: null,
  chatContexts: {},
  initialize: async () => {
    if (get().initialized) return
    try {
      const snapshot = await window.api.getKnowledgeSnapshot()
      set({ snapshot, initialized: true, errorMessage: null })
    } catch (error) {
      set({
        initialized: true,
        errorMessage: error instanceof Error ? error.message : '读取知识库失败'
      })
    }
  },
  setSnapshot: (snapshot) => set({ snapshot }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  handleImportProgress: (progress) =>
    set((state) => ({
      importProgress: { ...state.importProgress, [progress.documentId]: progress }
    })),
  handleContextUsed: (context) => {
    if (context.mode === 'vision') {
      set({ visionContext: context })
      return
    }
    if (!context.requestId) return
    set((state) => ({
      chatContexts: { ...state.chatContexts, [context.requestId as string]: context }
    }))
  },
  clearVisionContext: () => set({ visionContext: null }),
  clearChatContexts: () => set({ chatContexts: {} })
}))
