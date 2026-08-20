export type ApiProtocol = 'chat-completions' | 'responses'

export type ChatProvider = 'deepseek' | 'custom'

export type AssistantMode = 'screenshot' | 'chat'

export type ChatMessageSource = 'typed' | 'transcription'

export type TranscriptionProvider = 'dashscope' | 'volcengine'

export const DEFAULT_DASHSCOPE_ASR_MODEL = 'fun-asr-realtime'
export const DEFAULT_DASHSCOPE_ASR_WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/'
export const DEFAULT_VOLCENGINE_ASR_MODEL = 'bigmodel'
export const DEFAULT_VOLCENGINE_ASR_RESOURCE_ID = 'volc.seedasr.sauc.duration'
export const DEFAULT_VOLCENGINE_ASR_WS_URL =
  'wss://openspeech.bytedance.com/api/v3/sauc/bigmodel_async'

export type TranscriptionSettings = {
  transcriptionProvider: TranscriptionProvider
  dashscopeApiKey: string
  dashscopeAsrModel: string
  dashscopeAsrWsUrl: string
  volcengineAsrApiKey: string
  volcengineAsrModel: string
  volcengineAsrResourceId: string
  volcengineAsrWsUrl: string
}

export type TranscriptionConfig =
  | {
      provider: 'dashscope'
      apiKey: string
      model: string
      wsUrl: string
    }
  | {
      provider: 'volcengine'
      apiKey: string
      model: string
      resourceId: string
      wsUrl: string
    }

export function createTranscriptionConfig(settings: TranscriptionSettings): TranscriptionConfig {
  if (settings.transcriptionProvider === 'volcengine') {
    return {
      provider: 'volcengine',
      apiKey: settings.volcengineAsrApiKey.trim(),
      model: settings.volcengineAsrModel.trim(),
      resourceId: settings.volcengineAsrResourceId.trim(),
      wsUrl: settings.volcengineAsrWsUrl.trim()
    }
  }

  return {
    provider: 'dashscope',
    apiKey: settings.dashscopeApiKey.trim(),
    model: settings.dashscopeAsrModel.trim(),
    wsUrl: settings.dashscopeAsrWsUrl.trim()
  }
}

export function getTranscriptionConfigError(config: TranscriptionConfig): string | null {
  const providerName = config.provider === 'dashscope' ? '百炼平台' : '豆包语音'
  if (!config.apiKey) return `请先在设置中配置${providerName} API Key`
  if (!config.model) return `请先在设置中配置${providerName}模型`
  if (config.provider === 'volcengine' && !config.resourceId) {
    return '请先在设置中配置豆包语音资源 ID'
  }
  if (!config.wsUrl) return `请先在设置中配置${providerName} WebSocket 地址`
  return null
}

export function isTranscriptionConfigured(settings: TranscriptionSettings): boolean {
  return getTranscriptionConfigError(createTranscriptionConfig(settings)) === null
}

export type ChatDocument = {
  id: string
  name: string
  mediaType: string
  size: number
  text: string
}

export const CHAT_DOCUMENT_EXTENSIONS = [
  '.txt',
  '.md',
  '.markdown',
  '.json',
  '.jsonl',
  '.csv',
  '.tsv',
  '.log',
  '.xml',
  '.yaml',
  '.yml',
  '.toml',
  '.ini',
  '.html',
  '.css',
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.py',
  '.java',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.go',
  '.rs',
  '.sql',
  '.sh',
  '.ps1'
] as const

export const CHAT_DOCUMENT_ACCEPT = CHAT_DOCUMENT_EXTENSIONS.join(',')
export const CHAT_DOCUMENT_MAX_FILES = 5
export const CHAT_DOCUMENT_MAX_FILE_BYTES = 1024 * 1024
export const CHAT_DOCUMENT_MAX_TOTAL_CHARACTERS = 200_000

export function isSupportedChatDocument(name: string): boolean {
  const lowerName = name.toLowerCase()
  return CHAT_DOCUMENT_EXTENSIONS.some((extension) => lowerName.endsWith(extension))
}

export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash'
export const DEEPSEEK_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const

export const DEFAULT_CHAT_SYSTEM_PROMPT =
  '你是一名准确、简洁的中文 AI 助手。直接回答用户问题；信息不足时明确说明。除非用户另有要求，否则使用中文回答。'

export type ChatEvent =
  | {
      type: 'user-message'
      requestId: string
      messageId: string
      text: string
      source: ChatMessageSource
      documents?: ChatDocument[]
    }
  | {
      type: 'assistant-start'
      requestId: string
      messageId: string
    }
  | {
      type: 'assistant-delta'
      requestId: string
      messageId: string
      delta: string
    }
  | {
      type: 'assistant-complete'
      requestId: string
      messageId: string
    }
  | {
      type: 'assistant-stopped'
      requestId: string
      messageId: string
    }
  | {
      type: 'assistant-error'
      requestId: string
      messageId: string
      error: string
    }
  | {
      type: 'request-error'
      requestId: string
      messageId: string
      error: string
    }
  | {
      type: 'conversation-cleared'
    }

export type ChatRequestResult =
  | { accepted: true; requestId: string }
  | { accepted: false; error: string }
