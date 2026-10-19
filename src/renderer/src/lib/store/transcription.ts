import { create } from 'zustand'
import type {
  TranscriptionLine,
  TranscriptionStatus,
  TranscriptionTextEvent
} from '../../../../preload/contracts'

interface TranscriptionState {
  isTranscribing: boolean
  isPaused: boolean
  transcriptionText: string
  errorMessage: string | null
  status: TranscriptionStatus
  lines: TranscriptionLine[]
  audioLevel: number
}

interface TranscriptionStore extends TranscriptionState {
  setIsTranscribing: (v: boolean) => void
  setIsPaused: (v: boolean) => void
  setTranscriptionText: (text: string) => void
  clearText: () => void
  setError: (msg: string | null) => void
  resetState: () => void
  setStatus: (status: TranscriptionStatus) => void
  setAudioLevel: (audioLevel: number) => void
  updateTranscript: (event: TranscriptionTextEvent) => void
}

const defaultState: TranscriptionState = {
  isTranscribing: false,
  isPaused: false,
  transcriptionText: '',
  errorMessage: null,
  status: 'idle',
  lines: [],
  audioLevel: 0
}

export const useTranscriptionStore = create<TranscriptionStore>()((set) => ({
  ...defaultState,
  setIsTranscribing: (v) => set({ isTranscribing: v }),
  setIsPaused: (v) => set({ isPaused: v }),
  setTranscriptionText: (text) =>
    set({
      transcriptionText: text,
      lines: text ? [{ speaker: null, confirmedText: text, partialText: '' }] : []
    }),
  setStatus: (status) => set({ status }),
  setAudioLevel: (audioLevel) => set({ audioLevel }),
  updateTranscript: (event) => set({ transcriptionText: event.text, lines: event.lines }),
  clearText: () => set({ transcriptionText: '', lines: [] }),
  setError: (msg) => set({ errorMessage: msg }),
  resetState: () => set(defaultState)
}))
