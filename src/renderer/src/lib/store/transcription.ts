import { create } from 'zustand'

interface TranscriptionState {
  isTranscribing: boolean
  transcriptionText: string
  errorMessage: string | null
}

interface TranscriptionStore extends TranscriptionState {
  setIsTranscribing: (v: boolean) => void
  setTranscriptionText: (text: string) => void
  clearText: () => void
  setError: (msg: string | null) => void
  resetState: () => void
}

const defaultState: TranscriptionState = {
  isTranscribing: false,
  transcriptionText: '',
  errorMessage: null
}

export const useTranscriptionStore = create<TranscriptionStore>()((set) => ({
  ...defaultState,
  setIsTranscribing: (v) => set({ isTranscribing: v }),
  setTranscriptionText: (text) => set({ transcriptionText: text }),
  clearText: () => set({ transcriptionText: '' }),
  setError: (msg) => set({ errorMessage: msg }),
  resetState: () => set(defaultState)
}))
