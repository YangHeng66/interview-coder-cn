import { create } from 'zustand'
import type {
  ChatDocument,
  ChatEvent,
  ChatMessageSource,
  ConversationPersona,
  MockInterviewSetup
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
  autoReplyQueueCount: number
  persona?: ConversationPersona
  mockInterview?: MockInterviewSetup
}

interface ChatStore extends ChatState {
  handleEvent: (event: ChatEvent) => void
  setErrorMessage: (error: string | null) => void
}

const defaultState: ChatState = {
  messages: [],
  isLoading: false,
  activeRequestId: null,
  errorMessage: null,
  autoReplyQueueCount: 0,
  persona: undefined,
  mockInterview: undefined
}

/**
 * A conversation switch (e.g. starting a review report) returns views that may already
 * contain the request's first messages, and the IPC reply can beat the chat events.
 */
function appendMessage(messages: ChatMessage[], message: ChatMessage): ChatMessage[] {
  return messages.some((item) => item.id === message.id) ? messages : [...messages, message]
}

/** A resend of the same voice turn takes the place of the earlier question and its answer */
function withoutRequest(messages: ChatMessage[], requestId: string | undefined): ChatMessage[] {
  return requestId ? messages.filter((message) => message.requestId !== requestId) : messages
}

export const useChatStore = create<ChatStore>()((set) => ({
  ...defaultState,
  handleEvent: (event) => {
    switch (event.type) {
      case 'user-message':
        set((state) => ({
          messages: appendMessage(withoutRequest(state.messages, event.replacesRequestId), {
            id: event.messageId,
            requestId: event.requestId,
            role: 'user',
            content: event.text,
            source: event.source,
            documents: event.documents
          }),
          errorMessage: null
        }))
        break
      case 'assistant-start':
        set((state) => ({
          messages: appendMessage(state.messages, {
            id: event.messageId,
            requestId: event.requestId,
            role: 'assistant',
            content: '',
            status: 'streaming'
          }),
          isLoading: true,
          activeRequestId: event.requestId,
          errorMessage: null
        }))
        break
      case 'assistant-delta':
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === event.messageId && message.status === 'streaming'
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
          isLoading: state.activeRequestId === event.requestId ? false : state.isLoading,
          activeRequestId: state.activeRequestId === event.requestId ? null : state.activeRequestId
        }))
        break
      case 'assistant-stopped':
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === event.messageId ? { ...message, status: 'stopped' } : message
          ),
          isLoading: state.activeRequestId === event.requestId ? false : state.isLoading,
          activeRequestId: state.activeRequestId === event.requestId ? null : state.activeRequestId
        }))
        break
      case 'assistant-error':
        set((state) => ({
          messages: state.messages.map((message) =>
            message.id === event.messageId
              ? { ...message, status: 'error', error: event.error }
              : message
          ),
          isLoading: state.activeRequestId === event.requestId ? false : state.isLoading,
          activeRequestId: state.activeRequestId === event.requestId ? null : state.activeRequestId
        }))
        break
      case 'request-error':
        set({ errorMessage: event.error })
        break
      case 'auto-reply-queue':
        set({ autoReplyQueueCount: event.count })
        break
      case 'conversation-cleared':
        set(defaultState)
        break
    }
  },
  setErrorMessage: (errorMessage) => set({ errorMessage })
}))
