export type ApiProtocol = 'chat-completions' | 'responses'

export type ChatProvider = 'deepseek' | 'custom'

export type AssistantMode = 'screenshot' | 'chat'

export type ChatMessageSource = 'typed' | 'transcription'

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
