import { ipcMain } from 'electron'
import type { ModelMessage } from 'ai'
import { randomUUID } from 'node:crypto'
import { activeConversation, saveConversationModels } from '../conversations'
import { getChatStream, isChatConfigured } from '../ai'
import { state, subscribeAppState } from '../state'
import { settings, subscribeAppSettings } from '../settings'
import {
  getTranscriptionText,
  consumeConfirmedTranscriptionText,
  consumeTranscriptionText,
  isTranscriptionListening,
  subscribeTranscription
} from '../transcription'
import type { TranscriptionEvent } from '../transcription'
import { AutoReplyTurn, shouldTriggerAutoReply } from '../transcription-auto-reply'
import { logTimeline } from '../transcription-timeline'
import type {
  AssistantMode,
  ChatDocument,
  ChatMessageSource,
  ChatRequestResult
} from '../../preload/contracts'
import { createChatModelText, normalizeChatDocuments } from './chat-documents'
import { extractErrorMessage } from './errors'
import { sendChatEvent } from './events'
import { getActiveJobProfile, retrieveKnowledgeContext } from './knowledge-context'
import { buildPersonaSystemPrompt } from './personas'
import { ChatHistoryTail, createRecentKnowledgeContext } from './messages'
import {
  abortCurrentStream,
  detachCurrentStream,
  getCurrentStream,
  isConversationTransitioning,
  onStreamIdle,
  registerStreamPersister,
  releaseStream,
  setCurrentStream,
  type StreamContext
} from './stream-context'

let chatConversationMessages: ModelMessage[] = []
const chatHistoryTail = new ChatHistoryTail()

const autoReplyTurn = new AutoReplyTurn()
let autoReplyNotice: string | null = null

registerStreamPersister('chat', () => saveConversationModels('chat', chatConversationMessages))
onStreamIdle(() => sendAutoReplyTurn())

export function clearAutoReplyTurn(): void {
  autoReplyTurn.clear()
  autoReplyNotice = null
  publishAutoReplyState()
}

/** Shows a voice turn that is waiting for a busy stream or a fixed configuration */
function publishAutoReplyState(): void {
  sendChatEvent({ type: 'auto-reply-queue', count: autoReplyTurn.pendingRequest ? 1 : 0 })
}

export function interruptChatStream(sendPendingTurn = true): void {
  const streamContext = getCurrentStream()
  if (!streamContext || streamContext.kind !== 'chat') return

  abortCurrentStream('user')
  if (!streamContext.stopNotified && streamContext.requestId && streamContext.assistantMessageId) {
    streamContext.stopNotified = true
    sendChatEvent({
      type: 'assistant-stopped',
      requestId: streamContext.requestId,
      messageId: streamContext.assistantMessageId
    })
  }

  setCurrentStream(null)
  if (sendPendingTurn) sendAutoReplyTurn()
}

export function setAssistantMode(mode: AssistantMode) {
  state.assistantMode = mode
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync-app-state', state)
  }
  if (mode === 'chat') sendAutoReplyTurn()
}

/** Drop the voice turn, then abort whatever is streaming */
export function detachConversationStream(): void {
  clearAutoReplyTurn()
  detachCurrentStream()
}

export function stopCurrentStream(): boolean {
  const streamContext = getCurrentStream()
  if (!streamContext) return false
  if (streamContext.kind === 'chat') {
    interruptChatStream()
  } else {
    abortCurrentStream('user')
  }
  return true
}

export function restoreChatModels(): void {
  chatConversationMessages = activeConversation('chat').modelMessages
  chatHistoryTail.reset()
}

export function resetChatModels(): void {
  chatConversationMessages = []
  chatHistoryTail.reset()
}

function rejectChatRequest(error: string): ChatRequestResult {
  sendChatEvent({
    type: 'request-error',
    requestId: randomUUID(),
    messageId: randomUUID(),
    error
  })
  return { accepted: false, error }
}

function validateChatRequest(
  text: string,
  documents: ChatDocument[] = [],
  allowBusy = false
): string | null {
  if (isConversationTransitioning()) return '会话正在切换，请稍后发送'
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) {
    return '当前无法发送消息'
  }
  if (!text.trim() && documents.length === 0) {
    return '没有可发送的内容'
  }
  if (!isChatConfigured()) {
    return '请先在设置中配置文字对话模型'
  }
  if (getCurrentStream() && !allowBusy) {
    return 'AI 正在生成，请先停止当前回答'
  }
  return null
}

function notifyAutoReplyIssue(message: string): void {
  if (autoReplyNotice === message) return
  autoReplyNotice = message
  rejectChatRequest(message)
}

function handleTranscriptionEvent(event: TranscriptionEvent): void {
  const triggers = shouldTriggerAutoReply(event.speaker, activeConversation('chat').persona)
  if (event.isPartial) {
    if (triggers) autoReplyTurn.touch()
    return
  }

  const skip = (why: string) =>
    logTimeline('auto-reply-skip', { speaker: event.speaker, reason: event.reason, why })
  if (isConversationTransitioning()) return skip('transitioning')
  if (!settings.transcriptionAutoReply) return skip('disabled')
  if (!state.inCoderPage) return skip('not-coder-page')
  if (state.assistantMode !== 'chat') return skip('vision-mode')
  if (state.transcriptionPaused) return skip('paused')
  // The last result after a stop stays in the transcript for a manual send
  if (!isTranscriptionListening()) return skip('stopped')
  if (!triggers) return skip('own-speech')

  if (!isChatConfigured()) {
    skip('chat-unconfigured')
    notifyAutoReplyIssue('请先在设置中配置文字对话模型，语音自动回答暂未发送')
    return
  }

  // My confirmed answers ride along with the interviewer's question; a partial
  // I'm still speaking stays in the transcript.
  const fragment = consumeConfirmedTranscriptionText()
  if (!fragment.trim()) return skip('empty')
  autoReplyTurn.append(fragment)
  logTimeline('auto-reply-append', {
    speaker: event.speaker,
    reason: event.reason,
    chars: fragment.length
  })
  sendAutoReplyTurn()
}

/** Sends the voice turn when it says something new; it replaces the chat answer being written */
export function sendAutoReplyTurn(): void {
  if (
    isConversationTransitioning() ||
    !settings.transcriptionAutoReply ||
    !state.inCoderPage ||
    state.assistantMode !== 'chat' ||
    state.transcriptionPaused ||
    !isChatConfigured()
  ) {
    return
  }

  const text = autoReplyTurn.pendingRequest
  if (!text) return

  const currentStream = getCurrentStream()
  if (currentStream && currentStream.kind !== 'chat') {
    // A screenshot answer finishes first; onStreamIdle sends the turn
    publishAutoReplyState()
    return
  }
  const validationError = validateChatRequest(text, [], true)
  if (validationError) {
    notifyAutoReplyIssue(validationError)
    publishAutoReplyState()
    return
  }

  logTimeline('auto-reply-send', {
    chars: text.length,
    interrupts: currentStream?.requestId ?? null
  })
  // The user-stop path closes the interrupted answer in the renderer before the turn starts
  interruptChatStream(false)
  const replacesRequestId = autoReplyTurn.requestId ?? undefined
  const requestId = randomUUID()
  autoReplyTurn.markSent(requestId)
  autoReplyNotice = null
  acceptChatRequest(text, 'transcription', [], { requestId, replacesRequestId })
  publishAutoReplyState()
}

async function runChatRequest(
  streamContext: StreamContext,
  requestId: string,
  assistantMessageId: string,
  userMessage: ModelMessage,
  knowledgeQuery: string
) {
  const requestMessages = [...chatConversationMessages, userMessage]
  let assistantResponse = ''
  let streamError: unknown = null

  try {
    const conversation = activeConversation('chat')
    const systemPrompt = conversation.persona
      ? buildPersonaSystemPrompt(conversation, await getActiveJobProfile())
      : undefined
    // The review material already contains what the knowledge base matched at the time
    const knowledge =
      conversation.persona === 'review'
        ? null
        : await retrieveKnowledgeContext(
            'chat',
            knowledgeQuery,
            requestId,
            createRecentKnowledgeContext(chatConversationMessages),
            streamContext.controller.signal
          )
    if (!streamContext.controller.signal.aborted) {
      const chatStream = getChatStream(
        requestMessages,
        streamContext.controller.signal,
        knowledge?.context,
        systemPrompt
      )
      for await (const chunk of chatStream) {
        if (streamContext.controller.signal.aborted) break
        if (!assistantResponse) logTimeline('chat-first-token', { requestId })
        assistantResponse += chunk
        sendChatEvent({
          type: 'assistant-delta',
          requestId,
          messageId: assistantMessageId,
          delta: chunk
        })
      }
    }
  } catch (error) {
    if (!streamContext.controller.signal.aborted) {
      streamError = error
    }
  }

  if (streamContext.controller.signal.aborted) {
    if (
      !streamContext.stopNotified &&
      streamContext.reason !== 'clear-chat' &&
      streamContext.reason !== 'profile-switch'
    ) {
      sendChatEvent({
        type: 'assistant-stopped',
        requestId,
        messageId: assistantMessageId
      })
    }
  } else if (streamError) {
    const error = extractErrorMessage(streamError)
    console.error('Error streaming chat response:', streamError)
    sendChatEvent({
      type: 'assistant-error',
      requestId,
      messageId: assistantMessageId,
      error
    })
  } else if (!assistantResponse) {
    sendChatEvent({
      type: 'assistant-error',
      requestId,
      messageId: assistantMessageId,
      error: '模型未返回内容'
    })
  } else {
    chatConversationMessages.push(userMessage, {
      role: 'assistant',
      content: assistantResponse
    })
    chatHistoryTail.record(requestId, chatConversationMessages)
    sendChatEvent({
      type: 'assistant-complete',
      requestId,
      messageId: assistantMessageId
    })
  }

  logTimeline('chat-end', {
    requestId,
    outcome: streamContext.controller.signal.aborted
      ? 'stopped'
      : streamError
        ? 'error'
        : assistantResponse
          ? 'complete'
          : 'empty',
    stopReason: streamContext.reason,
    chars: assistantResponse.length
  })
  releaseStream(streamContext)
}

function acceptChatRequest(
  text: string,
  source: ChatMessageSource,
  documents: ChatDocument[] = [],
  {
    requestId = randomUUID(),
    replacesRequestId
  }: { requestId?: string; replacesRequestId?: string } = {}
): ChatRequestResult {
  const userMessageId = randomUUID()
  const assistantMessageId = randomUUID()
  const userMessage: ModelMessage = {
    role: 'user',
    content: createChatModelText(text, documents)
  }
  const streamContext: StreamContext = {
    controller: new AbortController(),
    reason: null,
    kind: 'chat',
    requestId,
    assistantMessageId
  }

  // The model must not see the half question and its answer next to the whole one
  const history = chatHistoryTail.withoutReplaced(chatConversationMessages, replacesRequestId)
  if (history !== chatConversationMessages) {
    chatConversationMessages = history
    saveConversationModels('chat', history)
  }
  logTimeline('chat-request', { requestId, source, text })
  setCurrentStream(streamContext)
  setAssistantMode('chat')
  sendChatEvent({
    type: 'user-message',
    requestId,
    messageId: userMessageId,
    text,
    source,
    documents: documents.length ? documents : undefined,
    replacesRequestId
  })
  sendChatEvent({ type: 'assistant-start', requestId, messageId: assistantMessageId })
  const knowledgeQuery = [text, ...documents.map((document) => document.name)]
    .filter(Boolean)
    .join('\n')
  void runChatRequest(streamContext, requestId, assistantMessageId, userMessage, knowledgeQuery)
  return { accepted: true, requestId }
}

export function submitChatMessage(
  rawText: string,
  source: ChatMessageSource,
  rawDocuments?: ChatDocument[]
): ChatRequestResult {
  const text = rawText.trim()
  const normalizedDocuments = normalizeChatDocuments(rawDocuments)
  if (typeof normalizedDocuments === 'string') return rejectChatRequest(normalizedDocuments)
  const validationError = validateChatRequest(
    text,
    normalizedDocuments,
    getCurrentStream()?.kind === 'chat'
  )
  if (validationError) return rejectChatRequest(validationError)
  interruptChatStream(false)
  return acceptChatRequest(text, source, normalizedDocuments)
}

export function submitTranscriptionToChat(): ChatRequestResult {
  setAssistantMode('chat')
  const pendingText = getTranscriptionText().trim()
  const validationError = validateChatRequest(pendingText, [], getCurrentStream()?.kind === 'chat')
  if (validationError) return rejectChatRequest(validationError)

  const consumedText = consumeTranscriptionText().trim()
  if (!consumedText) return rejectChatRequest('没有可发送的语音转录内容')
  interruptChatStream(false)
  return acceptChatRequest(consumedText, 'transcription')
}

function clearChatConversation(): void {
  if (isConversationTransitioning()) return
  clearAutoReplyTurn()
  if (getCurrentStream()?.kind === 'chat') {
    abortCurrentStream('clear-chat')
    setCurrentStream(null)
  }
  chatConversationMessages = []
  chatHistoryTail.reset()
  sendChatEvent({ type: 'conversation-cleared' })
}

ipcMain.handle('sendChatMessage', (_event, text: string, documents?: ChatDocument[]) => {
  return submitChatMessage(text, 'typed', documents)
})

ipcMain.handle('sendTranscriptionToChat', () => {
  return submitTranscriptionToChat()
})

ipcMain.handle('clearAutoReplyQueue', () => {
  clearAutoReplyTurn()
  return true
})

ipcMain.handle('clearChatConversation', () => {
  clearChatConversation()
  return true
})

ipcMain.handle('stopSolutionStream', () => stopCurrentStream())

subscribeTranscription(handleTranscriptionEvent)
subscribeAppState((nextState) => {
  if (!nextState.inCoderPage) {
    clearAutoReplyTurn()
  } else if (nextState.assistantMode === 'chat') {
    sendAutoReplyTurn()
  }
})
subscribeAppSettings((_nextSettings, patch) => {
  if ('transcriptionAutoReply' in patch || 'chatApiKey' in patch || 'chatModel' in patch) {
    sendAutoReplyTurn()
  }
  if ('transcriptionAutoReply' in patch) {
    autoReplyNotice = null
  }
})
