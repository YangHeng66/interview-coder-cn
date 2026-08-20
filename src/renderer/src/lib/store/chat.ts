import { create } from 'zustand'
import type {
  ChatDocument,
  ChatEvent,
  ChatMessageSource
} from '../../../../preload/contracts'

export type ChatMessageStatus = 'streaming' | 'complete' | 'stopped' | 'error'

export type ChatMessage = {
  id: string
  requestId: string
  role: 'user' | 'assistant'
  content: string
  source?: ChatMessageSource
  documents?: ChatDocument[]
  status?: ChatMessageStatus
  error?: string
}

interface ChatState {
  messages: ChatMessage[]
  isLoading: boolean
  activeRequestId: string | null
  errorMessage: string | null
}

interface ChatStore extends ChatState {
  handleEvent: (event: ChatEvent) => void
  setErrorMessage: (error: string | null) => void
}

const defaultState: ChatState = {
  messages: [],
  isLoading: false,
  activeRequestId: null,
  errorMessage: null
}

export const useChatStore = create<ChatStore>()((set) => ({
  ...defaultState,
  handleEvent: (event) => {
    switch (event.type) {
      case 'user-message':
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: event.messageId,
              requestId: event.requestId,
              role: 'user',
              content: event.text,
              source: event.source,
              documents: event.documents
            }
          ],
          errorMessage: null
        }))
        break
      case 'assistant-start':
        set((state) => ({
          messages: [
            ...state.messages,
            {
              id: event.messageId,
              requestId: event.requestId,
              role: 'assistant',
              content: '',
              status: 'streaming'
            }
          ],
          isLoading: true,
          activeRequestId: event.requestId,
          errorMessage: null
        }))
        break
      case 'assistant-delta':
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === event.messageId
              ? { ...message, content: message.content + event.delta }
              : message
          )
        }))
        break
      case 'assistant-complete':
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === event.messageId ? { ...message, status: 'complete' } : message
          ),
          isLoading: false,
          activeRequestId: null
        }))
        break
      case 'assistant-stopped':
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === event.messageId ? { ...message, status: 'stopped' } : message
          ),
          isLoading: false,
          activeRequestId: null
        }))
        break
      case 'assistant-error':
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === event.messageId
              ? { ...message, status: 'error', error: event.error }
              : message
          ),
          isLoading: false,
          activeRequestId: null
        }))
        break
      case 'request-error':
        set({ errorMessage: event.error })
        break
      case 'conversation-cleared':
        set(defaultState)
        break
    }
  },
  setErrorMessage: (errorMessage) => set({ errorMessage })
}))
