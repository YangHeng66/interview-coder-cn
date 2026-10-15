import { sendChatEvent, sendVisionEvent } from './events'

export type AbortReason = 'user' | 'new-request' | 'clear-chat' | 'profile-switch'
export type StreamKind = 'vision' | 'chat'

export interface StreamContext {
  controller: AbortController
  reason: AbortReason | null
  kind: StreamKind
  requestId?: string
  assistantMessageId?: string
  stopNotified?: boolean
}

// Only one AI stream (vision or chat) runs at a time.
let currentStreamContext: StreamContext | null = null
let pendingConversationTransitions = 0
const persisters: Partial<Record<StreamKind, () => void>> = {}
const idleListeners = new Set<() => void>()

export function getCurrentStream(): StreamContext | null {
  return currentStreamContext
}

export function setCurrentStream(streamContext: StreamContext | null): void {
  currentStreamContext = streamContext
}

export function isConversationTransitioning(): boolean {
  return pendingConversationTransitions > 0
}

export function beginConversationTransition(): void {
  pendingConversationTransitions += 1
}

export function endConversationTransition(): void {
  pendingConversationTransitions -= 1
}

/** Each stream kind owns its model history and saves it when its stream ends */
export function registerStreamPersister(kind: StreamKind, persist: () => void): void {
  persisters[kind] = persist
}

/** Called after a stream is released, so queued work (voice auto-reply) can start */
export function onStreamIdle(listener: () => void): void {
  idleListeners.add(listener)
}

export function abortCurrentStream(reason: AbortReason) {
  if (!currentStreamContext) return
  currentStreamContext.reason = reason
  currentStreamContext.controller.abort()
}

export function releaseStream(streamContext: StreamContext): void {
  if (currentStreamContext !== streamContext) return
  persisters[streamContext.kind]?.()
  currentStreamContext = null
  idleListeners.forEach((listener) => listener())
}

/** Abort the running stream so a new request or conversation switch can take over */
export function detachCurrentStream(): void {
  const context = currentStreamContext
  if (!context) return
  abortCurrentStream('new-request')
  if (context.kind === 'chat' && context.requestId && context.assistantMessageId) {
    sendChatEvent({
      type: 'assistant-stopped',
      requestId: context.requestId,
      messageId: context.assistantMessageId
    })
  }
  if (context.kind === 'vision') sendVisionEvent('solution-stopped')
  persisters[context.kind]?.()
  currentStreamContext = null
}
