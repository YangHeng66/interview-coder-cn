export type ApiProtocol = 'chat-completions' | 'responses'

export const THINKING_LEVELS = ['auto', 'none', 'minimal', 'low', 'medium', 'high'] as const

export type ThinkingLevel = (typeof THINKING_LEVELS)[number]

const DEFAULT_MODEL_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'auto',
  'minimal',
  'low',
  'medium',
  'high'
]
const GPT_56_THINKING_LEVELS: readonly ThinkingLevel[] = ['auto', 'none', 'low', 'medium', 'high']

const DEEPSEEK_THINKING_LEVELS: readonly ThinkingLevel[] = [
  'auto',
  'none',
  'minimal',
  'low',
  'medium',
  'high'
]

function isGpt56Model(model: string): boolean {
  return /^gpt-5\.6(?:$|-)/i.test(model.trim())
}

function isDeepSeekModel(model: string): boolean {
  return /^deepseek-/i.test(model.trim())
}

export function getThinkingLevelsForModel(model: string): readonly ThinkingLevel[] {
  if (isGpt56Model(model)) return GPT_56_THINKING_LEVELS
  return isDeepSeekModel(model) ? DEEPSEEK_THINKING_LEVELS : DEFAULT_MODEL_THINKING_LEVELS
}

export function normalizeThinkingLevelForModel(model: string, level: ThinkingLevel): ThinkingLevel {
  // GPT-5.6 replaced the legacy `minimal` effort with `none`. Preserve an
  // existing user's intent by selecting the lowest supported reasoning level.
  return isGpt56Model(model) && level === 'minimal' ? 'low' : level
}

export type ChatProvider = 'deepseek' | 'custom'

export type AssistantMode = 'screenshot' | 'chat'

export type ChatMessageSource = 'typed' | 'transcription'

export type TranscriptionProvider = 'dashscope' | 'volcengine'

export type TranscriptionAudioSource = 'system' | 'microphone' | 'mixed'

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

export type KnowledgeDocumentStatus = 'processing' | 'ready' | 'error'

export type KnowledgeLinkPriority = 'key' | 'normal'

export type KnowledgeDocument = {
  id: string
  name: string
  extension: string
  mediaType: string
  size: number
  sha256: string
  status: KnowledgeDocumentStatus
  error?: string
  characterCount: number
  chunkCount: number
  createdAt: string
  updatedAt: string
}

export type KnowledgeDocumentLink = {
  documentId: string
  priority: KnowledgeLinkPriority
  linkedAt: string
}

export type KnowledgeProfile = {
  id: string
  name: string
  company: string
  role: string
  jobDescription: string
  documentLinks: KnowledgeDocumentLink[]
  createdAt: string
  updatedAt: string
}

export type KnowledgeSnapshot = {
  schemaVersion: 1
  activeProfileId: string | null
  builtinFrontendKnowledgeEnabled: boolean
  profiles: KnowledgeProfile[]
  documents: KnowledgeDocument[]
}

/**
 * The bundled frontend pack is intentionally separate from user documents:
 * it is read-only, ships with the app, and never appears in the local file
 * manifest. Keep these identifiers stable so retrieval/source history remains
 * understandable after an app upgrade.
 */
export const BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID = '__builtin_frontend__'
export const BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_NAME = '前端开发通用知识'
export const BUILTIN_FRONTEND_KNOWLEDGE_DOCUMENT_PREFIX = 'builtin:frontend:'

export const BUILTIN_FRONTEND_KNOWLEDGE_TOPICS = [
  {
    id: 'html-css-accessibility',
    name: 'HTML、CSS 与无障碍',
    summary: '语义化结构、布局、响应式设计和 WCAG 实践'
  },
  {
    id: 'javascript-typescript',
    name: 'JavaScript 与 TypeScript',
    summary: '语言特性、类型建模、异步代码和常见陷阱'
  },
  {
    id: 'browser-web-platform',
    name: '浏览器与 Web 平台',
    summary: '事件循环、渲染管线、网络、缓存和存储'
  },
  {
    id: 'react-vue-engineering',
    name: 'React、Vue 与工程化',
    summary: '组件设计、状态管理、路由、构建和测试'
  },
  {
    id: 'performance-security',
    name: '性能、安全与质量',
    summary: '性能指标、Web 安全、可观测性和发布质量'
  }
] as const

export type KnowledgeProfileInput = Pick<
  KnowledgeProfile,
  'name' | 'company' | 'role' | 'jobDescription'
>

export type KnowledgeProfilePatch = Partial<KnowledgeProfileInput>

export type KnowledgeLinkPatch = {
  linked?: boolean
  priority?: KnowledgeLinkPriority
}

export type KnowledgeImportStage = 'copying' | 'extracting' | 'indexing' | 'ready' | 'error'

export type KnowledgeImportProgress = {
  documentId: string
  name: string
  stage: KnowledgeImportStage
  completed: number
  total: number
  error?: string
}

export type KnowledgeImportFailure = {
  name: string
  error: string
}

export type KnowledgeImportResult = {
  snapshot: KnowledgeSnapshot
  importedIds: string[]
  duplicateIds: string[]
  failures: KnowledgeImportFailure[]
}

export type KnowledgeSource = {
  documentId: string
  name: string
  priority: KnowledgeLinkPriority
  chunkCount: number
  excerpts: string[]
}

export type KnowledgeContextUsed = {
  mode: 'vision' | 'chat'
  requestId?: string
  profileId: string
  profileName: string
  sources: KnowledgeSource[]
}

export type KnowledgeResult<T> = { ok: true; data: T } | { ok: false; error: string }

export const KNOWLEDGE_DOCUMENT_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md', '.markdown'] as const
export const KNOWLEDGE_DOCUMENT_ACCEPT = KNOWLEDGE_DOCUMENT_EXTENSIONS.join(',')
export const KNOWLEDGE_MAX_FILE_BYTES = 10 * 1024 * 1024
export const KNOWLEDGE_MAX_IMPORT_FILES = 20

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
  | {
      type: 'auto-reply-queue'
      count: number
    }

export type ChatRequestResult =
  | { accepted: true; requestId: string }
  | { accepted: false; error: string }
