import { globalShortcut, ipcMain, screen } from 'electron'
import type { BrowserWindow, Rectangle } from 'electron'
import type { ModelMessage } from 'ai'
import { randomUUID } from 'node:crypto'
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
}

enum ShortcutStatus {
  Registered = 'registered',
  Failed = 'failed',
  /** Shortcut is available to register but not registered. */
  Available = 'available'
}

const MOVE_STEP = 200
/** Opacity delta per shortcut press, matching the settings slider step */
const OPACITY_STEP = 0.05
const shortcuts: Record<string, Shortcut> = {}

type AbortReason = 'user' | 'new-request' | 'clear-chat' | 'profile-switch'

interface StreamContext {
  controller: AbortController
  reason: AbortReason | null
  kind: 'vision' | 'chat'
}

let currentStreamContext: StreamContext | null = null

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
  mainWindow.webContents.send('solution-complete')
  mainWindow.webContents.send('ai-loading-end')
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

  applyContentProtection(window, true)
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

  applyContentProtection(window, process.platform === 'win32')
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

function releaseStream(streamContext: StreamContext): void {
  if (currentStreamContext !== streamContext) return
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
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('chat-event', event)
  }
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
  mainWindow.webContents.send('knowledge-context-used', {
    mode,
    requestId,
    profileId: retrieval.profileId,
    profileName: retrieval.profileName,
    sources: retrieval.sources
  } satisfies KnowledgeContextUsed)
}

async function retrieveKnowledgeContext(
  mode: KnowledgeContextUsed['mode'],
  query: string,
  requestId?: string,
  recentConversation = '',
  abortSignal?: AbortSignal
): Promise<KnowledgeRetrieval | null> {
  try {
    let semanticQuery = ''
    if (query.trim()) {
      try {
        semanticQuery = await rewriteKnowledgeQuery(mode, query, recentConversation, abortSignal)
      } catch (error) {
        if (abortSignal?.aborted) return null
        console.warn('AI knowledge query rewrite failed; using the original query:', error)
      }
    }
    if (abortSignal?.aborted) return null

    const retrieval = await knowledgeService.retrieve(query, semanticQuery)
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
  }
}

function drainAutoReplyQueue(): void {
  if (
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
    if (streamContext.reason !== 'clear-chat' && streamContext.reason !== 'profile-switch') {
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
    kind: 'chat'
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
  const validationError = validateChatRequest(text, normalizedDocuments)
  if (validationError) return rejectChatRequest(validationError)
  return acceptChatRequest(text, source, normalizedDocuments)
}

function submitTranscriptionToChat(): ChatRequestResult {
  setAssistantMode('chat')
  const pendingText = getTranscriptionText().trim()
  const validationError = validateChatRequest(pendingText)
  if (validationError) return rejectChatRequest(validationError)

  const consumedText = consumeTranscriptionText().trim()
  if (!consumedText) return rejectChatRequest('没有可发送的语音转录内容')
  return acceptChatRequest(consumedText, 'transcription')
}

function clearChatConversation(): void {
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
    mainWindow.webContents.send('solution-clear')
    mainWindow.webContents.send('ai-loading-end')
  }
  sendChatEvent({ type: 'conversation-cleared' })
}

const callbacks: Record<string, () => void> = {
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
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    setAssistantMode('screenshot')
    if (!settings.apiKey.trim()) return

    abortCurrentStream('new-request')
    let loadingStarted = false
    const screenshotData = await takeScreenshot()
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

      const streamContext: StreamContext = {
        controller: new AbortController(),
        reason: null,
        kind: 'vision'
      }
      currentStreamContext = streamContext
      recentScreenshots = [screenshotData]
      hasAppendSeparator = false
      mainWindow.webContents.send('solution-clear')
      mainWindow.webContents.send('screenshots-updated', recentScreenshots)
      mainWindow.webContents.send('screenshot-taken', screenshotData)
      mainWindow.webContents.send('ai-loading-start')
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
            mainWindow.webContents.send('solution-chunk', chunk)
          }
        } catch (error) {
          if (!streamContext.controller.signal.aborted) {
            endedNaturally = false
            console.error('Error streaming solution:', error)
            mainWindow.webContents.send('solution-error', extractErrorMessage(error))
          } else {
            endedNaturally = false
          }
        }

        if (streamContext.controller.signal.aborted) {
          if (streamContext.reason === 'user') {
            mainWindow.webContents.send('solution-stopped')
          }
        } else if (endedNaturally) {
          // Add assistant response to conversation history
          if (assistantResponse) {
            visionConversationMessages.push({
              role: 'assistant',
              content: assistantResponse
            })
          }
          mainWindow.webContents.send('solution-complete')
        }
      } catch (error) {
        if (streamContext.controller.signal.aborted) {
          if (streamContext.reason === 'user') {
            mainWindow.webContents.send('solution-stopped')
          }
        } else {
          endedNaturally = false
          console.error('Error streaming solution:', error)
          mainWindow.webContents.send('solution-error', extractErrorMessage(error))
        }
      } finally {
        releaseStream(streamContext)
        if (!streamStarted && streamContext.reason === 'user') {
          mainWindow.webContents.send('solution-stopped')
        }
        if (loadingStarted && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-loading-end')
        }
      }
    }
  },

  // Append screenshot for continuous capture (if conversation exists)
  appendScreenshot: async () => {
    const mainWindow = global.mainWindow
    if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return
    setAssistantMode('screenshot')
    if (!settings.apiKey.trim()) return

    // Fallback to first screenshot if no conversation
    if (visionConversationMessages.length === 0) {
      callbacks.takeScreenshot()
      return
    }

    abortCurrentStream('new-request')
    let loadingStarted = false

    const screenshotData = await takeScreenshot()
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

      const streamContext: StreamContext = {
        controller: new AbortController(),
        reason: null,
        kind: 'vision'
      }
      currentStreamContext = streamContext

      recentScreenshots.push(screenshotData)
      recentScreenshots = recentScreenshots.slice(-5) // 限5张
      mainWindow.webContents.send('screenshot-taken', screenshotData)
      mainWindow.webContents.send('screenshots-updated', recentScreenshots)
      if (!hasAppendSeparator) {
        mainWindow.webContents.send('solution-chunk', '\n\n---\n\n')
        hasAppendSeparator = true
      } else {
        mainWindow.webContents.send('solution-chunk', '\n\n')
      }
      mainWindow.webContents.send('ai-loading-start')
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
            mainWindow.webContents.send('solution-chunk', chunk)
          }
        } catch (error) {
          if (!streamContext.controller.signal.aborted) {
            endedNaturally = false
            console.error('Error streaming continuous solution:', error)
            mainWindow.webContents.send('solution-error', extractErrorMessage(error))
          } else {
            endedNaturally = false
          }
        }

        if (streamContext.controller.signal.aborted) {
          if (streamContext.reason === 'user') {
            mainWindow.webContents.send('solution-stopped')
          }
        } else if (endedNaturally) {
          // Add assistant response to conversation history
          if (assistantResponse) {
            visionConversationMessages.push({
              role: 'assistant',
              content: assistantResponse
            })
          }
          mainWindow.webContents.send('solution-complete')
        }
      } catch (error) {
        if (streamContext.controller.signal.aborted) {
          if (streamContext.reason === 'user') {
            mainWindow.webContents.send('solution-stopped')
          }
        } else {
          endedNaturally = false
          console.error('Error streaming continuous solution:', error)
          mainWindow.webContents.send('solution-error', extractErrorMessage(error))
        }
      } finally {
        releaseStream(streamContext)
        if (!streamStarted && streamContext.reason === 'user') {
          mainWindow.webContents.send('solution-stopped')
        }
        if (loadingStarted && mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('ai-loading-end')
        }
      }
    }
  },

  // Stop current AI solution stream
  stopSolutionStream: () => {
    abortCurrentStream('user')
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
  } else {
    globalShortcut.unregister(shortcut.key)
  }
  shortcut.status = ShortcutStatus.Available
  shortcut.registeredKeys = []
}

function getShortcutRegistrationKeys(key: string) {
  const keys = [key]
  if (process.platform !== 'win32') {
    return keys
  }
  const parts = key.split('+')
  const hasAlt = parts.includes('Alt')
  const hasCtrl = parts.includes('CommandOrControl') || parts.includes('Control')
  if (hasAlt && !hasCtrl) {
    const aliasParts = [...parts]
    const altIndex = aliasParts.indexOf('Alt')
    if (altIndex >= 0) {
      aliasParts.splice(altIndex, 0, 'CommandOrControl')
      const aliasKey = aliasParts.join('+')
      if (!keys.includes(aliasKey)) {
        keys.push(aliasKey)
      }
    }
  }
  return keys
}

function registerShortcut(action: string, key: string) {
  if (shortcuts[action]) {
    unregisterShortcut(action)
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

ipcMain.handle(
  'initShortcuts',
  (_event, shortcuts: Record<string, { action: string; key: string }>) => {
    Object.entries(shortcuts).forEach(([action, { key }]) => {
      registerShortcut(action, key)
    })
  }
)

ipcMain.handle('updateShortcuts', (_event, _shortcuts: { action: string; key: string }[]) => {
  _shortcuts.forEach((shortcut) => {
    if (shortcuts[shortcut.action]?.key !== shortcut.key) {
      registerShortcut(shortcut.action, shortcut.key)
    }
  })
})

ipcMain.handle('stopSolutionStream', () => {
  if (!currentStreamContext) return false
  abortCurrentStream('user')
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
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage || !settings.apiKey) {
    return { success: false, error: 'Invalid state' }
  }

  // Validate that there's an active conversation
  if (visionConversationMessages.length === 0) {
    return { success: false, error: 'No active conversation' }
  }

  abortCurrentStream('new-request')
  const streamContext: StreamContext = {
    controller: new AbortController(),
    reason: null,
    kind: 'vision'
  }
  currentStreamContext = streamContext

  // Add a separator before the follow-up response
  mainWindow.webContents.send('solution-chunk', '\n\n---\n\n')

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
        mainWindow.webContents.send('solution-chunk', chunk)
      }
    } catch (error) {
      if (!streamContext.controller.signal.aborted) {
        endedNaturally = false
        console.error('Error streaming follow-up solution:', error)
        mainWindow.webContents.send('solution-error', extractErrorMessage(error))
      } else {
        endedNaturally = false
      }
    }

    if (streamContext.controller.signal.aborted) {
      if (streamContext.reason === 'user') {
        mainWindow.webContents.send('solution-stopped')
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
      mainWindow.webContents.send('solution-complete')
    }
  } catch (error) {
    if (streamContext.controller.signal.aborted) {
      if (streamContext.reason === 'user') {
        mainWindow.webContents.send('solution-stopped')
      }
    } else {
      endedNaturally = false
      console.error('Error streaming follow-up solution:', error)
      mainWindow.webContents.send('solution-error', extractErrorMessage(error))
    }
  } finally {
    releaseStream(streamContext)
    if (!streamStarted && streamContext.reason === 'user') {
      mainWindow.webContents.send('solution-stopped')
    }
  }

  return { success: true }
})
