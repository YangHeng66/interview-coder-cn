import { streamText, type ModelMessage } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { settings, AppSettings } from './settings'
import {
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  DEFAULT_CHAT_SYSTEM_PROMPT,
  type ApiProtocol
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
}

function createLanguageModel(connection: ConnectionSettings) {
  const openai = createOpenAI({
    baseURL: connection.apiBaseURL.trim() || undefined,
    apiKey: connection.apiKey.trim()
  })
  return connection.apiProtocol === 'responses'
    ? openai.responses(connection.model)
    : openai.chat(connection.model)
}

function getVisionLanguageModel() {
  return createLanguageModel({
    apiProtocol: settings.apiProtocol,
    apiBaseURL: settings.apiBaseURL,
    apiKey: settings.apiKey,
    model: getModel(settings)
  })
}

function getChatConnection(): ConnectionSettings {
  if (settings.chatProvider === 'deepseek') {
    return {
      apiProtocol: 'chat-completions',
      apiBaseURL: DEEPSEEK_API_BASE_URL,
      apiKey: settings.chatApiKey,
      model: settings.chatModel.trim() || DEEPSEEK_DEFAULT_MODEL
    }
  }

  return {
    apiProtocol: settings.chatApiProtocol,
    apiBaseURL: settings.chatApiBaseURL,
    apiKey: settings.chatApiKey,
    model: settings.chatModel.trim()
  }
}

export function isChatConfigured(): boolean {
  const connection = getChatConnection()
  return Boolean(connection.apiKey.trim() && connection.model)
}

export function getSolutionStream(messages: ModelMessage[], abortSignal?: AbortSignal) {
  const { textStream } = streamText({
    model: getVisionLanguageModel(),
    system: getSystemPrompt(),
    messages,
    abortSignal,
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return textStream
}

export function getFollowUpStream(
  messages: ModelMessage[],
  userQuestion: string,
  abortSignal?: AbortSignal
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

  const { textStream } = streamText({
    model: getVisionLanguageModel(),
    system: getSystemPrompt(),
    messages: updatedMessages,
    abortSignal,
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return textStream
}

export function getGeneralStream(messages: ModelMessage[], abortSignal?: AbortSignal) {
  const { textStream } = streamText({
    model: getVisionLanguageModel(),
    system: getSystemPrompt(
      '注意：如果有多张截图，请结合所有截图内容进行完整分析，不要遗漏任何部分。'
    ),
    messages,
    abortSignal,
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return textStream
}

export function getChatStream(messages: ModelMessage[], abortSignal?: AbortSignal) {
  const { textStream } = streamText({
    model: createLanguageModel(getChatConnection()),
    system: settings.chatSystemPrompt.trim() || DEFAULT_CHAT_SYSTEM_PROMPT,
    messages,
    abortSignal,
    onError: (err) => {
      throw err.error ?? err
    }
  })
  return textStream
}
