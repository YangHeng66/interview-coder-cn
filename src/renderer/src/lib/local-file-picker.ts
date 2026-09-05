import { create } from 'zustand'

type Selection = {
  title: string
  mode: 'files' | 'directory'
  extensions: readonly string[]
  multiple: boolean
}

export const usePicker = create<{
  request: Selection | null
  resolve: ((paths: string[]) => void) | null
}>(() => ({ request: null, resolve: null }))

export function chooseLocalFiles(request: Selection): Promise<string[]> {
  return new Promise((resolve) => usePicker.setState({ request, resolve }))
}
