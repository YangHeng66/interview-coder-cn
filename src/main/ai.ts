import { streamText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { settings, AppSettings } from './settings'
import {
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  DEFAULT_CHAT_SYSTEM_PROMPT,
  normalizeThinkingLevelForModel,
  type ApiProtocol,
  type ThinkingLevel
} from '../preload/contracts'

// The system prompt is fully managed by the renderer (prompt scenes in the
// settings store) and synced here via updateAppSettings on app startup
function getSystemPrompt(extra?: string) {
  return [settings.customPrompt, extra].filter(Boolean).join('\n\n') || undefined
}

function getModel(_settings: AppSettings) {
  const fallbackModel = _settings.apiBaseURL.includes('siliconflow')
    ? 'Qwen/Qwen3-VL-32B-Instruct'
    : 'gpt-5-mini'
  return _settings.model || fallbackModel
}

type ConnectionSettings = {
  apiProtocol: ApiProtocol
  apiBaseURL: string
  apiKey: string
  model: string
  thinkingLevel: ThinkingLevel
  enableThinkingSwitch?: boolean
}

type ActiveThinkingLevel = Exclude<ThinkingLevel, 'auto'>

type StreamKind = 'vision' | 'chat'

function createStreamTimingLogger(connection: ConnectionSettings, kind: StreamKind) {
  const startedAt = performance.now()
  let firstChunkLogged = false
  let firstTextLogged = false

  return {
    markChunk(chunkType: string) {
      const elapsed = Math.round(performance.now() - startedAt)
      if (!firstChunkLogged) {
        firstChunkLogged = true
        console.info(
          `[AI timing] ${kind} firstChunk=${elapsed}ms chunkType=${chunkType} ` +
            `model=${connection.model} protocol=${connection.apiProtocol} ` +
            `thinking=${connection.thinkingLevel}`
        )
      }
      if (!firstTextLogged && chunkType === 'text-delta') {
        firstTextLogged = true
        console.info(`[AI timing] ${kind} firstText=${elapsed}ms model=${connection.model}`)
      }
    },
    finish(finishReason: unknown, totalUsage: unknown) {
      const elapsed = Math.round(performance.now() - startedAt)
      const usage =
        totalUsage && typeof totalUsage === 'object' ? JSON.stringify(totalUsage) : 'unavailable'
      console.info(
        `[AI timing] ${kind} complete=${elapsed}ms finishReason=${String(finishReason)} ` +
          `model=${connection.model} thinking=${connection.thinkingLevel} usage=${usage}`
      )
    }
  }
}

function getThinkingLevel(levels: Record<string, ThinkingLevel>, model: string): ThinkingLevel {
  return normalizeThinkingLevelForModel(model, levels[model.trim()] ?? 'auto')
}

function supportsThinkingSwitch(apiBaseURL: string): boolean {
  return /(?:^|\/\/)(?:ark\.[^/]+\.volces\.com|api\.deepseek\.com)(?:\/|$)/i.test(apiBaseURL.trim())
}

function createProviderFetch(connection: ConnectionSettings): typeof globalThis.fetch {
  return async (input, init) => {
    let requestInit = init

    if (connection.thinkingLevel !== 'auto' && typeof init?.body === 'string') {
      try {
        const body = JSON.parse(init.body) as Record<string, unknown>
        if (connection.enableThinkingSwitch && body.thinking == null) {
          body.thinking = { type: connection.thinkingLevel === 'none' ? 'disabled' : 'enabled' }
        } else if (connection.apiProtocol === 'responses' && body.reasoning == null) {
          body.reasoning = { effort: connection.thinkingLevel }
        } else if (connection.apiProtocol === 'chat-completions' && body.reasoning_effort == null) {
          body.reasoning_effort = connection.thinkingLevel
        }
        requestInit = { ...init, body: JSON.stringify(body) }
      } catch {
        // Keep the SDK payload unchanged if a provider uses a non-JSON request body.
      }
    }

    const startedAt = performance.now()
    try {
      const response = await globalThis.fetch(input, requestInit)
      console.info(
        `[AI timing] responseHeaders=${Math.round(performance.now() - startedAt)}ms ` +
          `status=${response.status} model=${connection.model} protocol=${connection.apiProtocol} ` +
          `thinking=${connection.thinkingLevel}`
      )
      return response
    } catch (error) {
      console.info(
        `[AI timing] responseHeaders=failed after=${Math.round(performance.now() - startedAt)}ms ` +
          `model=${connection.model} protocol=${connection.apiProtocol} ` +
          `thinking=${connection.thinkingLevel}`
      )
      throw error
    }
  }
}

function createLanguageModel(connection: ConnectionSettings) {
  const openai = createOpenAI({
    baseURL: connection.apiBaseURL.trim() || undefined,
    apiKey: connection.apiKey.trim(),
    fetch: createProviderFetch(connection)
  })
  return connection.apiProtocol === 'responses'
    ? openai.responses(connection.model)
    : openai.chat(connection.model)
}

function getProviderOptions(connection: ConnectionSettings) {
  if (
    connection.thinkingLevel === 'auto' ||
    connection.enableThinkingSwitch ||
    (connection.apiProtocol === 'chat-completions' && connection.thinkingLevel === 'none')
  ) {
    return undefined
  }

  return {
    openai: {
      reasoningEffort: connection.thinkingLevel satisfies ActiveThinkingLevel
    }
  }
}

function getVisionConnection(): ConnectionSettings {
  const model = getModel(settings)
  return {
    apiProtocol: settings.apiProtocol,
    apiBaseURL: settings.apiBaseURL,
    apiKey: settings.apiKey,
    model,
    thinkingLevel: getThinkingLevel(settings.modelThinkingLevels, model),
    enableThinkingSwitch: supportsThinkingSwitch(settings.apiBaseURL)
  }
}

function getChatConnection(): ConnectionSettings {
  if (settings.chatProvider === 'deepseek') {
    return {
      apiProtocol: 'chat-completions',
      apiBaseURL: DEEPSEEK_API_BASE_URL,
      apiKey: settings.chatApiKey,
      model: settings.chatModel.trim() || DEEPSEEK_DEFAULT_MODEL,
      thinkingLevel: getThinkingLevel(
        settings.chatModelThinkingLevels,
        settings.chatModel.trim() || DEEPSEEK_DEFAULT_MODEL
      ),
      enableThinkingSwitch: true
    }
  }

  const model = settings.chatModel.trim()
  return {
    apiProtocol: settings.chatApiProtocol,
    apiBaseURL: settings.chatApiBaseURL,
    apiKey: settings.chatApiKey,
    model,
    thinkingLevel: getThinkingLevel(settings.chatModelThinkingLevels, model)
  }
}

export function isChatConfigured(): boolean {
  const connection = getChatConnection()
  return Boolean(connection.apiKey.trim() && connection.model)
}

export function getSolutionStream(
  messages: ModelMessage[],
  abortSignal?: AbortSignal,
  onFinish?: () => void,
  knowledgeContext?: string
) {
  const connection = getVisionConnection()
  const timing = createStreamTimingLogger(connection, 'vision')
  const { textStream } = streamText({
    model: createLanguageModel(connection),
    system: getSystemPrompt(knowledgeContext),
    messages,
    providerOptions: getProviderOptions(connection),
    abortSignal,
    onChunk: ({ chunk }) => timing.markChunk(chunk.type),
    onFinish: ({ finishReason, totalUsage }) => {
      timing.finish(finishReason, totalUsage)
      onFinish?.()
    },
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return textStream
}

export function getFollowUpStream(
  messages: ModelMessage[],
  userQuestion: string,
  abortSignal?: AbortSignal,
  onFinish?: () => void,
  knowledgeContext?: string
) {
  // Add the user's follow-up question to the conversation
  const updatedMessages: ModelMessage[] = [
    ...messages,
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: userQuestion
        }
      ]
    }
  ]

  const connection = getVisionConnection()
  const timing = createStreamTimingLogger(connection, 'vision')
  const { textStream } = streamText({
    model: createLanguageModel(connection),
    system: getSystemPrompt(knowledgeContext),
    messages: updatedMessages,
    providerOptions: getProviderOptions(connection),
    abortSignal,
    onChunk: ({ chunk }) => timing.markChunk(chunk.type),
    onFinish: ({ finishReason, totalUsage }) => {
      timing.finish(finishReason, totalUsage)
      onFinish?.()
    },
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return textStream
}

export function getGeneralStream(
  messages: ModelMessage[],
  abortSignal?: AbortSignal,
  onFinish?: () => void,
  knowledgeContext?: string
) {
  const connection = getVisionConnection()
  const timing = createStreamTimingLogger(connection, 'vision')
  const { textStream } = streamText({
    model: createLanguageModel(connection),
    system: getSystemPrompt(
      ['注意：如果有多张截图，请结合所有截图内容进行完整分析，不要遗漏任何部分。', knowledgeContext]
        .filter(Boolean)
        .join('\n\n')
    ),
    messages,
    providerOptions: getProviderOptions(connection),
    abortSignal,
    onChunk: ({ chunk }) => timing.markChunk(chunk.type),
    onFinish: ({ finishReason, totalUsage }) => {
      timing.finish(finishReason, totalUsage)
      onFinish?.()
    },
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return textStream
}

export function getChatStream(
  messages: ModelMessage[],
  abortSignal?: AbortSignal,
  knowledgeContext?: string
) {
  const connection = getChatConnection()
  const timing = createStreamTimingLogger(connection, 'chat')
  const { textStream } = streamText({
    model: createLanguageModel(connection),
    system: [settings.chatSystemPrompt.trim() || DEFAULT_CHAT_SYSTEM_PROMPT, knowledgeContext]
      .filter(Boolean)
      .join('\n\n'),
    messages,
    providerOptions: getProviderOptions(connection),
    abortSignal,
    onChunk: ({ chunk }) => timing.markChunk(chunk.type),
    onFinish: ({ finishReason, totalUsage }) => timing.finish(finishReason, totalUsage),
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return textStream
}
