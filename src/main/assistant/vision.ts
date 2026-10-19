import { ipcMain } from 'electron'
import type { ModelMessage } from 'ai'
import { activeConversation, saveConversationModels } from '../conversations'
import { getFollowUpStream, getGeneralStream, getSolutionStream } from '../ai'
import { state } from '../state'
import { settings } from '../settings'
import { takeScreenshot } from '../take-screenshot'
import { saveScreenshotToDisk } from '../save-screenshot'
import { getTranscriptionText, clearTranscriptionText } from '../transcription'
import { getImageMediaType } from '../../preload/contracts'
import { detachConversationStream, setAssistantMode } from './chat'
import { extractErrorMessage } from './errors'
import { sendVisionEvent } from './events'
import { retrieveKnowledgeContext } from './knowledge-context'
import { createRecentKnowledgeContext } from './messages'
import {
  getCurrentStream,
  isConversationTransitioning,
  registerStreamPersister,
  releaseStream,
  setCurrentStream,
  type StreamContext
} from './stream-context'

let visionConversationMessages: ModelMessage[] = []
let recentScreenshots: string[] = [] // 最近截图，水平预览 (限5张)
let hasAppendSeparator = false

registerStreamPersister('vision', () =>
  saveConversationModels('screenshot', visionConversationMessages)
)

export function restoreVisionModels(): void {
  visionConversationMessages = activeConversation('screenshot').modelMessages
  recentScreenshots = activeConversation('screenshot').screenshots
  hasAppendSeparator = false
}

export function resetVisionModels(): void {
  visionConversationMessages = []
  recentScreenshots = []
  hasAppendSeparator = false
}

function notifyVisionStreamFinished(streamContext: StreamContext): void {
  const mainWindow = global.mainWindow
  if (
    getCurrentStream() !== streamContext ||
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

function startVisionStream(): StreamContext {
  detachConversationStream()
  const streamContext: StreamContext = {
    controller: new AbortController(),
    reason: null,
    kind: 'vision'
  }
  setCurrentStream(streamContext)
  return streamContext
}

/** Capture the screen and take any pending transcription along with it */
async function captureScreenshot(
  streamContext: StreamContext
): Promise<{ screenshotData: string; transcriptionText: string } | null> {
  const screenshotData = await takeScreenshot()
  if (streamContext.controller.signal.aborted) return null
  if (!screenshotData) {
    releaseStream(streamContext)
    return null
  }
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return null

  saveScreenshotToDisk(screenshotData)
  const transcriptionText = getTranscriptionText()
  if (transcriptionText) {
    clearTranscriptionText('screenshot')
    mainWindow.webContents.send('transcription-cleared')
  }
  return { screenshotData, transcriptionText }
}

type VisionStreamOptions = {
  knowledgeQuery: string
  createStream: (onFinish: () => void, knowledgeContext?: string) => AsyncIterable<string>
  /** Commit the turn to the model history; only called when the stream ends naturally */
  onComplete: (response: string) => void
  errorLabel: string
  /** Follow-ups never sent ai-loading-end; the renderer closes loading on complete/stop/error */
  endLoading: boolean
}

async function runVisionStream(streamContext: StreamContext, options: VisionStreamOptions) {
  const mainWindow = global.mainWindow
  const { signal } = streamContext.controller
  let endedNaturally = true
  let streamStarted = false
  let assistantResponse = ''

  try {
    const knowledge = await retrieveKnowledgeContext(
      'vision',
      options.knowledgeQuery,
      undefined,
      createRecentKnowledgeContext(visionConversationMessages),
      signal
    )
    const stream = options.createStream(
      () => notifyVisionStreamFinished(streamContext),
      knowledge?.context
    )
    streamStarted = true
    try {
      for await (const chunk of stream) {
        if (signal.aborted) {
          endedNaturally = false
          break
        }
        assistantResponse += chunk
        sendVisionEvent('solution-chunk', chunk)
      }
    } catch (error) {
      endedNaturally = false
      if (!signal.aborted) {
        console.error(`Error streaming ${options.errorLabel}:`, error)
        sendVisionEvent('solution-error', extractErrorMessage(error))
      }
    }

    if (signal.aborted) {
      if (streamContext.reason === 'user') {
        sendVisionEvent('solution-stopped')
      }
    } else if (endedNaturally) {
      options.onComplete(assistantResponse)
      sendVisionEvent('solution-complete')
    }
  } catch (error) {
    if (signal.aborted) {
      if (streamContext.reason === 'user') {
        sendVisionEvent('solution-stopped')
      }
    } else {
      console.error(`Error streaming ${options.errorLabel}:`, error)
      sendVisionEvent('solution-error', extractErrorMessage(error))
    }
  } finally {
    const isCurrent = getCurrentStream() === streamContext
    releaseStream(streamContext)
    if (!streamStarted && streamContext.reason === 'user') {
      sendVisionEvent('solution-stopped')
    }
    if (options.endLoading && isCurrent && mainWindow && !mainWindow.isDestroyed()) {
      sendVisionEvent('ai-loading-end')
    }
  }
}

function commitAssistantResponse(response: string) {
  if (response) {
    visionConversationMessages.push({ role: 'assistant', content: response })
  }
}

function canStartVisionRequest(): boolean {
  if (isConversationTransitioning()) return false
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed() || !state.inCoderPage) return false
  setAssistantMode('screenshot')
  return Boolean(settings.apiKey.trim())
}

export async function takeScreenshotAndSolve() {
  if (!canStartVisionRequest()) return

  const streamContext = startVisionStream()
  const capture = await captureScreenshot(streamContext)
  if (!capture) return
  const { screenshotData, transcriptionText } = capture

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
          image: screenshotData,
          mediaType: getImageMediaType(screenshotData)
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

  await runVisionStream(streamContext, {
    knowledgeQuery: transcriptionText,
    createStream: (onFinish, knowledgeContext) =>
      getSolutionStream(
        visionConversationMessages,
        streamContext.controller.signal,
        onFinish,
        knowledgeContext
      ),
    onComplete: commitAssistantResponse,
    errorLabel: 'solution',
    endLoading: true
  })
}

// Append screenshot for continuous capture (if conversation exists)
export async function appendScreenshot() {
  if (!canStartVisionRequest()) return

  // Fallback to first screenshot if no conversation
  if (visionConversationMessages.length === 0) {
    void takeScreenshotAndSolve()
    return
  }

  const streamContext = startVisionStream()
  const capture = await captureScreenshot(streamContext)
  if (!capture) return
  const { screenshotData, transcriptionText } = capture

  visionConversationMessages.push({
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
        image: screenshotData,
        mediaType: getImageMediaType(screenshotData)
      }
    ]
  })

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

  await runVisionStream(streamContext, {
    knowledgeQuery: transcriptionText,
    createStream: (onFinish, knowledgeContext) =>
      getGeneralStream(
        visionConversationMessages,
        streamContext.controller.signal,
        onFinish,
        knowledgeContext
      ),
    onComplete: commitAssistantResponse,
    errorLabel: 'continuous solution',
    endLoading: true
  })
}

ipcMain.handle('sendFollowUpQuestion', async (_event, question: string) => {
  if (isConversationTransitioning()) {
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

  const streamContext = startVisionStream()

  // Add a separator before the follow-up response
  sendVisionEvent('solution-chunk', '\n\n---\n\n')
  sendVisionEvent('ai-loading-start')

  await runVisionStream(streamContext, {
    knowledgeQuery: question,
    createStream: (onFinish, knowledgeContext) =>
      getFollowUpStream(
        visionConversationMessages,
        question,
        streamContext.controller.signal,
        onFinish,
        knowledgeContext
      ),
    onComplete: (response) => {
      visionConversationMessages.push({ role: 'user', content: [{ type: 'text', text: question }] })
      commitAssistantResponse(response)
    },
    errorLabel: 'follow-up solution',
    endLoading: false
  })

  return { success: true }
})
