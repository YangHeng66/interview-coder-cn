import { globalShortcut, ipcMain, screen } from 'electron'
import type { BrowserWindow, Rectangle } from 'electron'
import type { ModelMessage } from 'ai'
import { randomUUID } from 'node:crypto'
import './model-diagnostics'
import appConfig from '../../app.config.json'
import shortcutConfig from '../../shortcuts.config.json'
import {
  activeConversation,
  getConversationView,
  recordChatEvent,
  recordVisionEvent,
  recordKnowledge,
  saveConversationModels,
  loadConversation,
  activateConversation,
  listConversations,
  flushConversations,
  renameConversation,
  deleteConversation,
  exportConversation,
  newConversation
} from './conversations'
import type { ShortcutRegistration } from '../preload/contracts'
import { applyContentProtection } from './main-window'
import {
  showToolbar,
  hideToolbar,
  setToolbarWanted,
  reassertToolbarTopMost
} from './toolbar-window'
import { takeScreenshot } from './take-screenshot'
import { saveScreenshotToDisk } from './save-screenshot'
import {
  getSolutionStream,
  getFollowUpStream,
  getGeneralStream,
  getChatStream,
  isChatConfigured,
  rewriteKnowledgeQuery
} from './ai'
import { state, subscribeAppState } from './state'
import { settings, subscribeAppSettings } from './settings'
import { knowledgeService } from './knowledge/service'
import type { KnowledgeRetrieval } from './knowledge/search'
import {
  getTranscriptionText,
  clearTranscriptionText,
  consumeTranscriptionText,
  subscribeTranscription
} from './transcription'
import type { TranscriptionEvent } from './transcription'
import { TranscriptionAutoReplyQueue } from './transcription-auto-reply'
import {
  CHAT_DOCUMENT_MAX_FILES,
  CHAT_DOCUMENT_MAX_FILE_BYTES,
  CHAT_DOCUMENT_MAX_TOTAL_CHARACTERS,
  isSupportedChatDocument,
  type ChatDocument,
  type AssistantMode,
  type ChatEvent,
  type ChatMessageSource,
  type ChatRequestResult,
  type KnowledgeContextUsed
} from '../preload/contracts'

/**
 * Extract meaningful error message from API errors
 */
function extractErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error) || '未知错误'
  }

  // Try to extract responseBody from AI SDK errors
  const apiError = error as Error & {
    responseBody?: string
    statusCode?: number
    data?: unknown
    lastError?: unknown
  }

  if (apiError.lastError && apiError.lastError !== error) {
    return extractErrorMessage(apiError.lastError)
  }

  // Try to parse responseBody for detailed message
  if (apiError.responseBody) {
    try {
      const body = JSON.parse(apiError.responseBody)
      if (body.message) {
        return body.message
      }
      if (body.error?.message) {
        return body.error.message
      }
    } catch {
      // If parsing fails, use responseBody as is
      if (typeof apiError.responseBody === 'string' && apiError.responseBody.length < 200) {
        return apiError.responseBody
      }
    }
  }

  // Fallback to error message
  return error.message || '未知错误'
}

type Shortcut = {
  action: string
  key: string
  status: ShortcutStatus
  registeredKeys: string[]
  conflictAction?: string
}

enum ShortcutStatus {
  Registered = 'registered',
  Failed = 'failed',
  /** Shortcut is available to register but not registered. */
  Available = 'available',
  Disabled = 'disabled',
  Conflict = 'conflict'
}

const MOVE_STEP = appConfig.interface.moveStep
/** Opacity delta per shortcut press, matching the settings slider step */
const OPACITY_STEP = appConfig.interface.opacityStep
const shortcuts: Record<string, Shortcut> = {}
let shortcutRecording = false

type AbortReason = 'user' | 'new-request' | 'clear-chat' | 'profile-switch'

interface StreamContext {
  controller: AbortController
  reason: AbortReason | null
  kind: 'vision' | 'chat'
  requestId?: string
  assistantMessageId?: string
  stopNotified?: boolean
}

let currentStreamContext: StreamContext | null = null
let conversationTransitions = Promise.resolve()
let pendingConversationTransitions = 0

// Conversation history tracking
let visionConversationMessages: ModelMessage[] = []
let chatConversationMessages: ModelMessage[] = []
let recentScreenshots: string[] = [] // 最近截图，水平预览 (限5张)
let hasAppendSeparator = false

const autoReplyQueue = new TranscriptionAutoReplyQueue(() => {
  drainAutoReplyQueue()
})
let autoReplyNotice: string | null = null

function clearAutoReplyQueue(): void {
  autoReplyQueue.clear()
  autoReplyNotice = null
  sendChatEvent({ type: 'auto-reply-queue', count: 0 })
}

function publishAutoReplyQueueState(): void {
  sendChatEvent({ type: 'auto-reply-queue', count: autoReplyQueue.pendingCount })
}

function notifyVisionStreamFinished(streamContext: StreamContext): void {
  const mainWindow = global.mainWindow
  if (
    currentStreamContext !== streamContext ||
    streamContext.controller.signal.aborted ||
    !mainWindow ||
    mainWindow.isDestroyed()
  ) {
    return
  }

  // Some OpenAI-compatible relays emit the SDK finish event before their SSE
  // connection closes. Clear the UI immediately and keep the iterator cleanup
  // below as the normal conversation-history path.
  sendVisionEvent('solution-complete')
  sendVisionEvent('ai-loading-end')
}

const FRONT_REASSERT_DURATION = 8000
const FRONT_REASSERT_INTERVAL = 100
const FRONT_RELATIVE_LEVEL = 100
const BACKGROUND_GUARD_INTERVAL = 2000
let frontReassertTimer: NodeJS.Timeout | null = null
let backgroundGuardTimer: NodeJS.Timeout | null = null
let isWindowSoftHidden = false
let softHiddenBounds: Rectangle | null = null

/**
 * Reassert always-on-top. `aggressive` also calls moveTop() which
 * brings the window above everything — only use on explicit user actions
 * (show, screenshot, etc.) to avoid disturbing interaction with other apps.
 */
function applyTopMost(win: BrowserWindow, aggressive = true) {
  if (!win || win.isDestroyed()) return
  win.setAlwaysOnTop(true, 'screen-saver', FRONT_RELATIVE_LEVEL)
  if (aggressive) win.moveTop()

  if (state.ignoreMouse) {
    reassertToolbarTopMost(FRONT_RELATIVE_LEVEL + 1, aggressive)
  }
}

/**
 * Start a persistent low-frequency background guard that continuously
 * re-asserts always-on-top while the window is visible.
 * Uses the non-aggressive variant so it won't steal focus or
 * interfere with the user's interaction with other windows.
 */
function startBackgroundGuard(window: BrowserWindow) {
  if (backgroundGuardTimer) return // already running
  backgroundGuardTimer = setInterval(() => {
    if (!window || window.isDestroyed() || !window.isVisible()) {
      stopBackgroundGuard()
      return
    }
    applyTopMost(window, false)
  }, BACKGROUND_GUARD_INTERVAL)
}

function stopBackgroundGuard() {
  if (backgroundGuardTimer) {
    clearInterval(backgroundGuardTimer)
    backgroundGuardTimer = null
  }
}

function stopFrontReassert() {
  if (frontReassertTimer) {
    clearInterval(frontReassertTimer)
    frontReassertTimer = null
  }
}

function getOffscreenBounds(window: BrowserWindow): Rectangle {
  const displays = screen.getAllDisplays()
  const maxRight = Math.max(...displays.map((display) => display.bounds.x + display.bounds.width))
  const topMost = Math.min(...displays.map((display) => display.bounds.y))
  const [width, height] = window.getSize()

  return {
    x: maxRight + 2000,
    y: topMost,
    width,
    height
  }
}

function softHideWindow(window: BrowserWindow) {
  if (isWindowSoftHidden || window.isDestroyed()) return

  stopFrontReassert()
  stopBackgroundGuard()
  softHiddenBounds = window.getBounds()
  isWindowSoftHidden = true

  window.setOpacity(0)
  window.setIgnoreMouseEvents(true)
  window.setBounds(getOffscreenBounds(window))
  hideToolbar()
}

function restoreSoftHiddenWindow(window: BrowserWindow) {
  if (!isWindowSoftHidden || !softHiddenBounds || window.isDestroyed()) return

  applyContentProtection(window)
  window.setBounds(softHiddenBounds)
  window.setIgnoreMouseEvents(state.ignoreMouse)
  window.setOpacity(1)

  isWindowSoftHidden = false
  softHiddenBounds = null
  showToolbar()
  keepWindowInFront(window)
}

function showMainWindow(window: BrowserWindow) {
  if (process.platform === 'darwin' || process.platform === 'win32') {
    window.showInactive()
  } else {
    window.show()
  }

  applyContentProtection(window)
  showToolbar()
  keepWindowInFront(window)
}

function keepWindowInFront(window: BrowserWindow) {
  if (!window || window.isDestroyed()) return
  if (frontReassertTimer) {
    clearInterval(frontReassertTimer)
    frontReassertTimer = null
  }

  const start = Date.now()
  const reassert = () => {
    if (!window.isVisible() || window.isDestroyed()) return false
    applyTopMost(window)
    return true
  }

  if (!reassert()) return

  // Aggressive burst: rapid reasserts for a short period
  frontReassertTimer = setInterval(() => {
    const shouldStop = Date.now() - start > FRONT_REASSERT_DURATION
    if (shouldStop || !reassert()) {
      if (frontReassertTimer) {
        clearInterval(frontReassertTimer)
        frontReassertTimer = null
      }
    }
  }, FRONT_REASSERT_INTERVAL)

  // Ensure background guard is running for persistent protection
  startBackgroundGuard(window)
}

/**
 * Opacity is owned by the renderer settings store (persisted + synced back to
 * main), so the shortcut only asks the renderer to step it.
 */
function adjustOpacity(delta: number) {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
  mainWindow.webContents.send('adjust-opacity', delta)
}

function abortCurrentStream(reason: AbortReason) {
  if (!currentStreamContext) return
  currentStreamContext.reason = reason
  currentStreamContext.controller.abort()
}

function interruptChatStream(drainQueue = true): void {
  const streamContext = currentStreamContext
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

  currentStreamContext = null
  if (drainQueue) drainAutoReplyQueue()
}

function releaseStream(streamContext: StreamContext): void {
  if (currentStreamContext !== streamContext) return
  saveConversationModels(
    streamContext.kind === 'chat' ? 'chat' : 'screenshot',
    streamContext.kind === 'chat' ? chatConversationMessages : visionConversationMessages
  )
  currentStreamContext = null
  drainAutoReplyQueue()
}

function setAssistantMode(mode: AssistantMode) {
  state.assistantMode = mode
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('sync-app-state', state)
  }
  if (mode === 'chat') drainAutoReplyQueue()
}

function sendChatEvent(event: ChatEvent) {
  recordChatEvent(event)
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('chat-event', event)
  }
}

function sendVisionEvent(channel: string, value?: string | string[]) {
  recordVisionEvent(channel, value)
  global.mainWindow?.webContents.send(channel, value)
}

export function restoreConversationModels() {
  visionConversationMessages = activeConversation('screenshot').modelMessages
  chatConversationMessages = activeConversation('chat').modelMessages
  recentScreenshots = activeConversation('screenshot').screenshots
  hasAppendSeparator = false
}

function getMessageText(message: ModelMessage): string {
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''
  return message.content
    .map((part) => {
      if (!part || typeof part !== 'object' || !('type' in part) || part.type !== 'text') return ''
      return 'text' in part && typeof part.text === 'string' ? part.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

function createRecentKnowledgeContext(messages: ModelMessage[]): string {
  return messages
    .slice(-6)
    .map((message) => {
      const text = getMessageText(message).trim()
      return text ? `${message.role}: ${text}` : ''
    })
    .filter(Boolean)
    .join('\n')
    .slice(-4_000)
}

function sendKnowledgeContextUsed(
  mode: KnowledgeContextUsed['mode'],
  retrieval: KnowledgeRetrieval,
  requestId?: string
): void {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  const context = {
    mode,
    requestId,
    profileId: retrieval.profileId,
    profileName: retrieval.profileName,
    sources: retrieval.sources
  } satisfies KnowledgeContextUsed
  recordKnowledge(context)
  mainWindow.webContents.send('knowledge-context-used', context)
}

async function retrieveKnowledgeContext(
  mode: KnowledgeContextUsed['mode'],
  query: string,
  requestId?: string,
  recentConversation = '',
  abortSignal?: AbortSignal
): Promise<KnowledgeRetrieval | null> {
  try {
    const knowledgeSnapshot = await knowledgeService.getSnapshot()
    if (abortSignal?.aborted) return null
    const conversation = activeConversation(mode === 'chat' ? 'chat' : 'screenshot')
    conversation.profileId = knowledgeSnapshot.activeProfileId
    conversation.builtinKnowledge = knowledgeSnapshot.builtinFrontendKnowledgeEnabled
    if (!knowledgeSnapshot.activeProfileId && !knowledgeSnapshot.builtinFrontendKnowledgeEnabled) {
      return null
    }

    let semanticQuery = ''
    if (settings.knowledgeQueryRewrite && query.trim()) {
      try {
        semanticQuery = await rewriteKnowledgeQuery(mode, query, recentConversation, abortSignal)
      } catch (error) {
        if (abortSignal?.aborted) return null
        console.warn('AI knowledge query rewrite failed; using the original query:', error)
      }
    }
    if (abortSignal?.aborted) return null

    const retrieval = await knowledgeService.retrieve(query, semanticQuery)
    if (abortSignal?.aborted) return null
    if (retrieval) sendKnowledgeContextUsed(mode, retrieval, requestId)
    return retrieval
  } catch (error) {
    console.warn('Knowledge retrieval failed; continuing without knowledge context:', error)
    return null
  }
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

function normalizeChatDocuments(input: unknown): ChatDocument[] | string {
  if (input === undefined) return []
  if (!Array.isArray(input)) return '文档数据格式无效'
  if (input.length > CHAT_DOCUMENT_MAX_FILES) {
    return `一次最多上传 ${CHAT_DOCUMENT_MAX_FILES} 个文档`
  }

  let totalCharacters = 0
  const documents: ChatDocument[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') return '文档数据格式无效'
    const raw = item as Partial<ChatDocument>
    const name = typeof raw.name === 'string' ? raw.name.replace(/[\r\n\0]/g, '').slice(0, 200) : ''
    const text = typeof raw.text === 'string' ? raw.text.replace(/\0/g, '') : ''
    const size = typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0

    if (!name || !isSupportedChatDocument(name)) {
      return `不支持文档“${name || '未命名文件'}”的格式`
    }
    if (size > CHAT_DOCUMENT_MAX_FILE_BYTES) {
      return `文档“${name}”超过 1 MB 限制`
    }
    if (!text.trim()) return `文档“${name}”没有可读取的文本`

    totalCharacters += text.length
    if (totalCharacters > CHAT_DOCUMENT_MAX_TOTAL_CHARACTERS) {
      return '文档文本总量超过 20 万字符限制'
    }

    documents.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : randomUUID(),
      name,
      mediaType: typeof raw.mediaType === 'string' ? raw.mediaType.slice(0, 100) : 'text/plain',
      size,
      text
    })
  }
  return documents
}

function createChatModelText(text: string, documents: ChatDocument[]): string {
  const sections = documents.map(
    (document, index) =>
      `===== 文档 ${index + 1} 开始：${document.name} =====\n${document.text}\n===== 文档 ${index + 1} 结束：${document.name} =====`
  )
  return [text || (documents.length ? '请阅读以下文档并回答。' : ''), ...sections]
    .filter(Boolean)
    .join('\n\n')
}

function validateChatRequest(
  text: string,
  documents: ChatDocument[] = [],
  allowBusy = false
): string | null {
  if (pendingConversationTransitions) return '会话正在切换，请稍后发送'
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
  if (currentStreamContext && !allowBusy) {
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
  if (pendingConversationTransitions) return
  if (event.isPartial) return
  if (!settings.transcriptionAutoReply || !state.inCoderPage) return
  if (state.assistantMode !== 'chat') return
  if (state.transcriptionPaused) return

  if (!isChatConfigured()) {
    notifyAutoReplyIssue('请先在设置中配置文字对话模型，语音自动回答暂未发送')
    return
  }

  const pendingText = getTranscriptionText().trim()
  if (!pendingText) return
  if (!autoReplyQueue.canAccept(pendingText)) {
    notifyAutoReplyIssue('语音自动回答队列已满，请先停止或清空当前对话')
    return
  }

  const consumedText = consumeTranscriptionText().trim()
  if (consumedText) {
    autoReplyNotice = null
    autoReplyQueue.add(consumedText)

    // Voice questions should be able to take over an ongoing chat response.
    // Use the same user-stop path so the interrupted assistant message is
    // closed in the renderer before the queued question starts.
    const shouldInterrupt = currentStreamContext?.kind === 'chat'
    if (shouldInterrupt) {
      interruptChatStream(false)
      autoReplyQueue.flush()
    }
    publishAutoReplyQueueState()
  }
}

function drainAutoReplyQueue(): void {
  if (
    pendingConversationTransitions ||
    !settings.transcriptionAutoReply ||
    !state.inCoderPage ||
    state.assistantMode !== 'chat' ||
    state.transcriptionPaused ||
    currentStreamContext ||
    !isChatConfigured()
  ) {
    return
  }

  const text = autoReplyQueue.peek()
  if (!text) return

  const validationError = validateChatRequest(text, [], true)
  if (validationError) {
    notifyAutoReplyIssue(validationError)
    return
  }

  autoReplyQueue.removeFirst()
  publishAutoReplyQueueState()
  acceptChatRequest(text, 'transcription')
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
    const knowledge = await retrieveKnowledgeContext(
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
        knowledge?.context
      )
      for await (const chunk of chatStream) {
        if (streamContext.controller.signal.aborted) break
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
    sendChatEvent({
      type: 'assistant-complete',
      requestId,
      messageId: assistantMessageId
    })
  }

  releaseStream(streamContext)
}

function acceptChatRequest(
  text: string,
  source: ChatMessageSource,
  documents: ChatDocument[] = []
): ChatRequestResult {
  const requestId = randomUUID()
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

  currentStreamContext = streamContext
  setAssistantMode('chat')
  sendChatEvent({
    type: 'user-message',
    requestId,
    messageId: userMessageId,
    text,
    source,
    documents: documents.length ? documents : undefined
  })
  sendChatEvent({ type: 'assistant-start', requestId, messageId: assistantMessageId })
  const knowledgeQuery = [text, ...documents.map((document) => document.name)]
    .filter(Boolean)
    .join('\n')
  void runChatRequest(streamContext, requestId, assistantMessageId, userMessage, knowledgeQuery)
  return { accepted: true, requestId }
}

function submitChatMessage(
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
    currentStreamContext?.kind === 'chat'
  )
  if (validationError) return rejectChatRequest(validationError)
  interruptChatStream(false)
  return acceptChatRequest(text, source, normalizedDocuments)
}

function submitTranscriptionToChat(): ChatRequestResult {
  setAssistantMode('chat')
  const pendingText = getTranscriptionText().trim()
  const validationError = validateChatRequest(
    pendingText,
    [],
    currentStreamContext?.kind === 'chat'
  )
  if (validationError) return rejectChatRequest(validationError)

  const consumedText = consumeTranscriptionText().trim()
  if (!consumedText) return rejectChatRequest('没有可发送的语音转录内容')
  interruptChatStream(false)
  return acceptChatRequest(consumedText, 'transcription')
}

function clearChatConversation(): void {
  if (pendingConversationTransitions) return
  clearAutoReplyQueue()
  if (currentStreamContext?.kind === 'chat') {
    abortCurrentStream('clear-chat')
    currentStreamContext = null
  }
  chatConversationMessages = []
  sendChatEvent({ type: 'conversation-cleared' })
}

function clearKnowledgeScopedConversations(): void {
  clearAutoReplyQueue()
  if (currentStreamContext) {
    abortCurrentStream('profile-switch')
    currentStreamContext = null
  }
  visionConversationMessages = []
  chatConversationMessages = []
  recentScreenshots = []
  hasAppendSeparator = false

  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    sendVisionEvent('solution-clear')
    sendVisionEvent('ai-loading-end')
  }
  sendChatEvent({ type: 'conversation-cleared' })
}

const callbacks: Record<string, () => void> = {
  switchAssistantMode: () => {
    if (state.inCoderPage) setAssistantMode(state.assistantMode === 'chat' ? 'screenshot' : 'chat')
  },
  increaseFontSize: () => global.mainWindow?.webContents.send('reader-action', 'increaseFontSize'),
  decreaseFontSize: () => global.mainWindow?.webContents.send('reader-action', 'decreaseFontSize'),
  toggleScreenshots: () =>
    global.mainWindow?.webContents.send('reader-action', 'toggleScreenshots'),
  hideOrShowMainWindow: async () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return

    if (process.platform === 'win32') {
      if (isWindowSoftHidden) {
        restoreSoftHiddenWindow(mainWindow)
        return
      }

      if (!mainWindow.isVisible()) {
        showMainWindow(mainWindow)
        return
      }

      softHideWindow(mainWindow)
      return
    }

    if (mainWindow.isVisible()) {
      stopBackgroundGuard()
      mainWindow.hide()
    } else {
      // 重新显示时不断重申置顶属性，抵消其他前台软件持续抢占
      showMainWindow(mainWindow)
    }
  },

  takeScreenshot: async () => {
    if (pendingConversationTransitions) return
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    setAssistantMode('screenshot')
    if (!settings.apiKey.trim()) return

    detachConversationStream()
    const streamContext: StreamContext = {
      controller: new AbortController(),
      reason: null,
      kind: 'vision'
    }
    currentStreamContext = streamContext
    let loadingStarted = false
    const screenshotData = await takeScreenshot()
    if (streamContext.controller.signal.aborted) return
    if (!screenshotData) {
      releaseStream(streamContext)
      return
    }
    if (screenshotData && mainWindow && !mainWindow.isDestroyed()) {
      saveScreenshotToDisk(screenshotData)
      const transcriptionText = getTranscriptionText()
      if (transcriptionText) {
        clearTranscriptionText()
        mainWindow.webContents.send('transcription-cleared')
      }
      visionConversationMessages = [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: transcriptionText
                ? `这是语音转录内容：\n${transcriptionText}\n\n同时附上屏幕截图：`
                : '这是屏幕截图'
            },
            {
              type: 'image',
              image: screenshotData
            }
          ]
        }
      ]

      recentScreenshots = [screenshotData]
      hasAppendSeparator = false
      sendVisionEvent('solution-clear')
      sendVisionEvent('screenshots-updated', recentScreenshots)
      sendVisionEvent('screenshot-taken', screenshotData)
      sendVisionEvent('ai-loading-start')
      loadingStarted = true
      let endedNaturally = true
      let streamStarted = false
      let assistantResponse = ''
      try {
        const knowledge = await retrieveKnowledgeContext(
          'vision',
          transcriptionText,
          undefined,
          createRecentKnowledgeContext(visionConversationMessages),
          streamContext.controller.signal
        )
        const solutionStream = getSolutionStream(
          visionConversationMessages,
          streamContext.controller.signal,
          () => notifyVisionStreamFinished(streamContext),
          knowledge?.context
        )
        streamStarted = true
        try {
          for await (const chunk of solutionStream) {
            if (streamContext.controller.signal.aborted) {
              endedNaturally = false
              break
            }
            assistantResponse += chunk
            sendVisionEvent('solution-chunk', chunk)
          }
        } catch (error) {
          if (!streamContext.controller.signal.aborted) {
            endedNaturally = false
            console.error('Error streaming solution:', error)
            sendVisionEvent('solution-error', extractErrorMessage(error))
          } else {
            endedNaturally = false
          }
        }

        if (streamContext.controller.signal.aborted) {
          if (streamContext.reason === 'user') {
            sendVisionEvent('solution-stopped')
          }
        } else if (endedNaturally) {
          // Add assistant response to conversation history
          if (assistantResponse) {
            visionConversationMessages.push({
              role: 'assistant',
              content: assistantResponse
            })
          }
          sendVisionEvent('solution-complete')
        }
      } catch (error) {
        if (streamContext.controller.signal.aborted) {
          if (streamContext.reason === 'user') {
            sendVisionEvent('solution-stopped')
          }
        } else {
          endedNaturally = false
          console.error('Error streaming solution:', error)
          sendVisionEvent('solution-error', extractErrorMessage(error))
        }
      } finally {
        const isCurrent = currentStreamContext === streamContext
        releaseStream(streamContext)
        if (!streamStarted && streamContext.reason === 'user') {
          sendVisionEvent('solution-stopped')
        }
        if (isCurrent && loadingStarted && mainWindow && !mainWindow.isDestroyed()) {
          sendVisionEvent('ai-loading-end')
        }
      }
    }
  },

  // Append screenshot for continuous capture (if conversation exists)
  appendScreenshot: async () => {
    if (pendingConversationTransitions) return
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    setAssistantMode('screenshot')
    if (!settings.apiKey.trim()) return

    // Fallback to first screenshot if no conversation
    if (visionConversationMessages.length === 0) {
      callbacks.takeScreenshot()
      return
    }

    detachConversationStream()
    const streamContext: StreamContext = {
      controller: new AbortController(),
      reason: null,
      kind: 'vision'
    }
    currentStreamContext = streamContext
    let loadingStarted = false

    const screenshotData = await takeScreenshot()
    if (streamContext.controller.signal.aborted) return
    if (!screenshotData) {
      releaseStream(streamContext)
      return
    }
    if (screenshotData && mainWindow && !mainWindow.isDestroyed()) {
      saveScreenshotToDisk(screenshotData)
      const transcriptionText = getTranscriptionText()
      if (transcriptionText) {
        clearTranscriptionText()
        mainWindow.webContents.send('transcription-cleared')
      }
      // Append new image message to conversation
      const newUserMessage: ModelMessage = {
        role: 'user',
        content: [
          {
            type: 'text',
            text: transcriptionText
              ? `这是下一部分截图和语音转录内容：\n${transcriptionText}\n请结合之前所有截图和分析，继续分析解答，不要遗漏任何信息。`
              : '这是下一部分截图，请结合之前所有截图和分析，继续分析解答，不要遗漏任何信息。'
          },
          {
            type: 'image',
            image: screenshotData
          }
        ]
      }
      visionConversationMessages.push(newUserMessage)

      recentScreenshots.push(screenshotData)
      recentScreenshots = recentScreenshots.slice(-5) // 限5张
      sendVisionEvent('screenshot-taken', screenshotData)
      sendVisionEvent('screenshots-updated', recentScreenshots)
      if (!hasAppendSeparator) {
        sendVisionEvent('solution-chunk', '\n\n---\n\n')
        hasAppendSeparator = true
      } else {
        sendVisionEvent('solution-chunk', '\n\n')
      }
      sendVisionEvent('ai-loading-start')
      loadingStarted = true

      let endedNaturally = true
      let streamStarted = false
      let assistantResponse = ''
      try {
        const knowledge = await retrieveKnowledgeContext(
          'vision',
          transcriptionText,
          undefined,
          createRecentKnowledgeContext(visionConversationMessages),
          streamContext.controller.signal
        )
        const solutionStream = getGeneralStream(
          visionConversationMessages,
          streamContext.controller.signal,
          () => notifyVisionStreamFinished(streamContext),
          knowledge?.context
        )
        streamStarted = true
        try {
          for await (const chunk of solutionStream) {
            if (streamContext.controller.signal.aborted) {
              endedNaturally = false
              break
            }
            assistantResponse += chunk
            sendVisionEvent('solution-chunk', chunk)
          }
        } catch (error) {
          if (!streamContext.controller.signal.aborted) {
            endedNaturally = false
            console.error('Error streaming continuous solution:', error)
            sendVisionEvent('solution-error', extractErrorMessage(error))
          } else {
            endedNaturally = false
          }
        }

        if (streamContext.controller.signal.aborted) {
          if (streamContext.reason === 'user') {
            sendVisionEvent('solution-stopped')
          }
        } else if (endedNaturally) {
          // Add assistant response to conversation history
          if (assistantResponse) {
            visionConversationMessages.push({
              role: 'assistant',
              content: assistantResponse
            })
          }
          sendVisionEvent('solution-complete')
        }
      } catch (error) {
        if (streamContext.controller.signal.aborted) {
          if (streamContext.reason === 'user') {
            sendVisionEvent('solution-stopped')
          }
        } else {
          endedNaturally = false
          console.error('Error streaming continuous solution:', error)
          sendVisionEvent('solution-error', extractErrorMessage(error))
        }
      } finally {
        const isCurrent = currentStreamContext === streamContext
        releaseStream(streamContext)
        if (!streamStarted && streamContext.reason === 'user') {
          sendVisionEvent('solution-stopped')
        }
        if (isCurrent && loadingStarted && mainWindow && !mainWindow.isDestroyed()) {
          sendVisionEvent('ai-loading-end')
        }
      }
    }
  },

  // Stop current AI solution stream
  stopSolutionStream: () => {
    if (currentStreamContext?.kind === 'chat') {
      interruptChatStream()
    } else {
      abortCurrentStream('user')
    }
  },

  ignoreOrEnableMouse: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    state.ignoreMouse = !state.ignoreMouse
    mainWindow.setIgnoreMouseEvents(state.ignoreMouse)
    showToolbar()
    mainWindow.webContents.send('sync-app-state', state)
  },

  increaseOpacity: () => {
    adjustOpacity(OPACITY_STEP)
  },

  decreaseOpacity: () => {
    adjustOpacity(-OPACITY_STEP)
  },

  pageUp: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    mainWindow.webContents.send('scroll-page-up')
  },

  pageDown: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    mainWindow.webContents.send('scroll-page-down')
  },

  moveMainWindowUp: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x, y - MOVE_STEP)
  },

  moveMainWindowDown: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x, y + MOVE_STEP)
  },

  moveMainWindowLeft: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x - MOVE_STEP, y)
  },

  moveMainWindowRight: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed()) return
    const [x, y] = mainWindow.getPosition()
    mainWindow.setPosition(x + MOVE_STEP, y)
  },

  toggleTranscription: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    mainWindow.webContents.send('toggle-transcription')
  },

  pauseResumeTranscription: () => {
    if (state.inCoderPage) global.mainWindow?.webContents.send('pause-resume-transcription')
  },

  clearTranscription: () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    clearTranscriptionText()
    mainWindow.webContents.send('transcription-cleared')
  },

  sendTranscriptionToChat: () => {
    submitTranscriptionToChat()
  }
}

const clickableActions = new Set([
  'takeScreenshot',
  'appendScreenshot',
  'stopSolutionStream',
  'ignoreOrEnableMouse',
  'increaseOpacity',
  'decreaseOpacity',
  'pageUp',
  'pageDown',
  'moveMainWindowUp',
  'moveMainWindowDown',
  'moveMainWindowLeft',
  'moveMainWindowRight',
  'toggleTranscription',
  'pauseResumeTranscription',
  'clearTranscription',
  'sendTranscriptionToChat'
])

function unregisterShortcut(action: string) {
  const shortcut = shortcuts[action]
  if (!shortcut) return
  if (shortcut.registeredKeys.length) {
    shortcut.registeredKeys.forEach((registeredKey) => {
      globalShortcut.unregister(registeredKey)
    })
  }
  shortcut.status = ShortcutStatus.Available
  shortcut.registeredKeys = []
}

function getShortcutRegistrationKeys(key: string) {
  return [key]
}

function registerShortcut(action: string, key: string) {
  if (!key || shortcutConfig[action as keyof typeof shortcutConfig].scope === 'local') {
    shortcuts[action] = {
      action,
      key,
      status: key ? ShortcutStatus.Registered : ShortcutStatus.Disabled,
      registeredKeys: []
    }
    return
  }
  const keysToRegister = getShortcutRegistrationKeys(key)
  const registeredKeys: string[] = []
  keysToRegister.forEach((shortcutKey) => {
    if (globalShortcut.register(shortcutKey, callbacks[action])) {
      registeredKeys.push(shortcutKey)
    }
  })

  shortcuts[action] = {
    action,
    key,
    status: registeredKeys.length ? ShortcutStatus.Registered : ShortcutStatus.Failed,
    registeredKeys
  }
}

ipcMain.handle('getShortcuts', () => shortcuts)

function detachConversationStream() {
  clearAutoReplyQueue()
  const context = currentStreamContext
  if (context) {
    abortCurrentStream('new-request')
    if (context.kind === 'chat' && context.requestId && context.assistantMessageId) {
      sendChatEvent({
        type: 'assistant-stopped',
        requestId: context.requestId,
        messageId: context.assistantMessageId
      })
    }
    if (context.kind === 'vision') sendVisionEvent('solution-stopped')
    saveConversationModels(
      context.kind === 'chat' ? 'chat' : 'screenshot',
      context.kind === 'chat' ? chatConversationMessages : visionConversationMessages
    )
    currentStreamContext = null
  }
}

ipcMain.handle('getConversations', () => listConversations())
ipcMain.handle('getConversationViews', () => ({
  screenshot: getConversationView('screenshot'),
  chat: getConversationView('chat')
}))
function transitionConversation<T>(action: () => Promise<T>): Promise<T> {
  pendingConversationTransitions += 1
  const operation = conversationTransitions.then(async () => {
    detachConversationStream()
    try {
      await flushConversations()
      return await action()
    } finally {
      pendingConversationTransitions -= 1
      drainAutoReplyQueue()
    }
  })
  conversationTransitions = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

ipcMain.handle('openConversation', (_event, id: string) =>
  transitionConversation(async () => {
    const conversation = await loadConversation(id)
    const profile = await knowledgeService.setActiveProfile(conversation.profileId)
    if (!profile.ok) throw new Error(profile.error)
    const builtin = await knowledgeService.setBuiltinKnowledgeEnabled(conversation.builtinKnowledge)
    if (!builtin.ok) throw new Error(builtin.error)
    const otherMode = conversation.mode === 'chat' ? 'screenshot' : 'chat'
    const otherConversation = activeConversation(otherMode)
    if (
      otherConversation.profileId !== conversation.profileId ||
      otherConversation.builtinKnowledge !== conversation.builtinKnowledge
    ) {
      newConversation(otherMode)
    }
    activateConversation(conversation)
    restoreConversationModels()
    setAssistantMode(conversation.mode)
    return { screenshot: getConversationView('screenshot'), chat: getConversationView('chat') }
  })
)
ipcMain.handle('newConversation', (_event, mode: AssistantMode) =>
  transitionConversation(async () => {
    newConversation(mode)
    restoreConversationModels()
    return { screenshot: getConversationView('screenshot'), chat: getConversationView('chat') }
  })
)
ipcMain.handle('renameConversation', async (_event, id: string, title: string) => {
  await renameConversation(id, title)
  return listConversations()
})
ipcMain.handle('deleteConversation', (_event, id: string) =>
  transitionConversation(async () => {
    await deleteConversation(id)
    restoreConversationModels()
    return { screenshot: getConversationView('screenshot'), chat: getConversationView('chat') }
  })
)
ipcMain.handle('exportConversation', (_event, id: string) => exportConversation(id))

function registerShortcutSet(bindings: { action: string; key: string }[]) {
  Object.keys(shortcuts).forEach(unregisterShortcut)
  const owners = new Map<string, string>()
  for (const binding of bindings) {
    const definition = shortcutConfig[binding.action as keyof typeof shortcutConfig]
    const normalized = binding.key
      .toLowerCase()
      .replace(/commandorcontrol/g, process.platform === 'darwin' ? 'command' : 'control')
      .replace(/ctrl/g, 'control')
      .split('+')
      .sort()
      .join('+')
    const owner = owners.get(normalized)
    if (binding.key && owner) {
      shortcuts[binding.action] = {
        ...binding,
        status: ShortcutStatus.Conflict,
        conflictAction: owner,
        registeredKeys: []
      }
    } else {
      if (binding.key) owners.set(normalized, binding.action)
      if (shortcutRecording && definition.scope === 'global') {
        shortcuts[binding.action] = {
          ...binding,
          status: ShortcutStatus.Available,
          registeredKeys: []
        }
      } else registerShortcut(binding.action, binding.key)
    }
  }
  return shortcuts satisfies Record<string, ShortcutRegistration>
}

ipcMain.handle('setShortcutRecording', (_event, recording: boolean) => {
  shortcutRecording = recording
  return registerShortcutSet(Object.values(shortcuts).map(({ action, key }) => ({ action, key })))
})

ipcMain.handle(
  'initShortcuts',
  (_event, shortcuts: Record<string, { action: string; key: string }>) => {
    return registerShortcutSet(
      Object.entries(shortcuts).map(([action, { key }]) => ({ action, key }))
    )
  }
)

ipcMain.handle('updateShortcuts', (_event, _shortcuts: { action: string; key: string }[]) => {
  const merged = Object.fromEntries(
    Object.values(shortcuts).map(({ action, key }) => [action, { action, key }])
  )
  _shortcuts.forEach((binding) => {
    merged[binding.action] = binding
  })
  return registerShortcutSet(Object.values(merged))
})

ipcMain.handle('stopSolutionStream', () => {
  if (!currentStreamContext) return false
  if (currentStreamContext.kind === 'chat') {
    interruptChatStream()
  } else {
    abortCurrentStream('user')
  }
  return true
})

ipcMain.handle('triggerAction', (_event, action: string) => {
  if (!clickableActions.has(action)) return false
  callbacks[action]?.()
  return true
})

ipcMain.handle('setToolbarVisible', (_event, visible: boolean) => {
  setToolbarWanted(visible)
})

ipcMain.handle('sendChatMessage', (_event, text: string, documents?: ChatDocument[]) => {
  return submitChatMessage(text, 'typed', documents)
})

ipcMain.handle('sendTranscriptionToChat', () => {
  return submitTranscriptionToChat()
})

ipcMain.handle('clearAutoReplyQueue', () => {
  clearAutoReplyQueue()
  return true
})

ipcMain.handle('clearChatConversation', () => {
  clearChatConversation()
  return true
})

subscribeTranscription(handleTranscriptionEvent)
subscribeAppState((nextState) => {
  if (!nextState.inCoderPage) {
    clearAutoReplyQueue()
  } else if (nextState.assistantMode === 'chat') {
    drainAutoReplyQueue()
  }
})
subscribeAppSettings((_nextSettings, patch) => {
  if ('transcriptionAutoReply' in patch || 'chatApiKey' in patch || 'chatModel' in patch) {
    drainAutoReplyQueue()
  }
  if ('transcriptionAutoReply' in patch) {
    autoReplyNotice = null
  }
})

ipcMain.handle('activateKnowledgeProfile', async (_event, profileId: string | null) => {
  const currentSnapshot = await knowledgeService.getSnapshot()
  if (currentSnapshot.activeProfileId === profileId) {
    return { ok: true, data: currentSnapshot }
  }

  const result = await knowledgeService.setActiveProfile(profileId)
  if (!result.ok) return result
  clearKnowledgeScopedConversations()
  return result
})

ipcMain.handle('setBuiltinKnowledgeEnabled', async (_event, enabled: boolean) => {
  const currentSnapshot = await knowledgeService.getSnapshot()
  if (currentSnapshot.builtinFrontendKnowledgeEnabled === enabled) {
    return { ok: true, data: currentSnapshot }
  }

  const result = await knowledgeService.setBuiltinKnowledgeEnabled(enabled)
  if (result.ok) clearKnowledgeScopedConversations()
  return result
})

ipcMain.handle('deleteKnowledgeProfile', async (_event, profileId: string) => {
  const snapshot = await knowledgeService.getSnapshot()
  const wasActive = snapshot.activeProfileId === profileId
  const result = await knowledgeService.deleteProfile(profileId)
  if (result.ok && wasActive) clearKnowledgeScopedConversations()
  return result
})

ipcMain.handle('sendFollowUpQuestion', async (_event, question: string) => {
  if (pendingConversationTransitions) {
    return { success: false, error: '会话正在切换，请稍后发送' }
  }
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage || !settings.apiKey) {
    return { success: false, error: 'Invalid state' }
  }

  // Validate that there's an active conversation
  if (visionConversationMessages.length === 0) {
    return { success: false, error: 'No active conversation' }
  }

  detachConversationStream()
  const streamContext: StreamContext = {
    controller: new AbortController(),
    reason: null,
    kind: 'vision'
  }
  currentStreamContext = streamContext

  // Add a separator before the follow-up response
  sendVisionEvent('solution-chunk', '\n\n---\n\n')
  sendVisionEvent('ai-loading-start')

  let endedNaturally = true
  let streamStarted = false
  let assistantResponse = ''

  try {
    const knowledge = await retrieveKnowledgeContext(
      'vision',
      question,
      undefined,
      createRecentKnowledgeContext(visionConversationMessages),
      streamContext.controller.signal
    )
    const followUpStream = getFollowUpStream(
      visionConversationMessages,
      question,
      streamContext.controller.signal,
      () => notifyVisionStreamFinished(streamContext),
      knowledge?.context
    )
    streamStarted = true

    try {
      for await (const chunk of followUpStream) {
        if (streamContext.controller.signal.aborted) {
          endedNaturally = false
          break
        }
        assistantResponse += chunk
        sendVisionEvent('solution-chunk', chunk)
      }
    } catch (error) {
      if (!streamContext.controller.signal.aborted) {
        endedNaturally = false
        console.error('Error streaming follow-up solution:', error)
        sendVisionEvent('solution-error', extractErrorMessage(error))
      } else {
        endedNaturally = false
      }
    }

    if (streamContext.controller.signal.aborted) {
      if (streamContext.reason === 'user') {
        sendVisionEvent('solution-stopped')
      }
    } else if (endedNaturally) {
      // Update conversation history with user question and assistant response
      visionConversationMessages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: question
          }
        ]
      })
      if (assistantResponse) {
        visionConversationMessages.push({
          role: 'assistant',
          content: assistantResponse
        })
      }
      sendVisionEvent('solution-complete')
    }
  } catch (error) {
    if (streamContext.controller.signal.aborted) {
      if (streamContext.reason === 'user') {
        sendVisionEvent('solution-stopped')
      }
    } else {
      endedNaturally = false
      console.error('Error streaming follow-up solution:', error)
      sendVisionEvent('solution-error', extractErrorMessage(error))
    }
  } finally {
    releaseStream(streamContext)
    if (!streamStarted && streamContext.reason === 'user') {
      sendVisionEvent('solution-stopped')
    }
  }

  return { success: true }
})
