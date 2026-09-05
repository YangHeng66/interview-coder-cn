import { create } from 'zustand'

interface SolutionState {
  isLoading: boolean
  solutionChunks: string[]
  screenshotData: string | null
  recentScreenshots: string[]
  errorMessage: string | null
}

interface SolutionStore extends SolutionState {
  setIsLoading: (isReceiving: boolean) => void
  addSolutionChunk: (chunk: string) => void
  setSolutionChunks: (chunks: string[]) => void
  setScreenshotData: (data: string | null) => void
  setRecentScreenshots: (data: string[]) => void
  setErrorMessage: (message: string | null) => void
  clearSolution: () => void
  resetState: () => void
}

const defaultState: SolutionState = {
  isLoading: false,
  solutionChunks: [],
  screenshotData: null,
  recentScreenshots: [],
  errorMessage: null
}

export const useSolutionStore = create<SolutionStore>()((set) => ({
  ...defaultState,
  setRecentScreenshots: (recentScreenshots) => set({ recentScreenshots }),
  setIsLoading: (isReceiving) => {
    set({ isLoading: isReceiving })
  },
  addSolutionChunk: (chunk) => {
    set((state) => ({
      solutionChunks: [state.solutionChunks.join('') + chunk]
    }))
  },
  setSolutionChunks: (chunks) => {
    set({ solutionChunks: chunks })
  },
  setScreenshotData: (data) => {
    set({ screenshotData: data })
  },
  setErrorMessage: (message) => {
    set({ errorMessage: message })
  },
  clearSolution: () => {
    set({ solutionChunks: [], isLoading: false, errorMessage: null })
  },
  resetState: () => {
    set(defaultState)
  }
}))
