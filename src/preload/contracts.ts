import appConfig from '../../app.config.json'

export type ApiProtocol = 'chat-completions' | 'responses' | 'messages'

export function getApiEndpoint(baseURL: string, protocol: ApiProtocol): string {
  return baseURL.trim().replace(/\/+$/, '') + appConfig.protocolPaths[protocol]
}

export type ModelDiagnosticInput = {
  apiBaseURL: string
  apiKey: string
  apiProtocol: ApiProtocol
  model: string
  thinkingLevel: ThinkingLevel
  kind: 'text' | 'image' | 'stream'
  image?: string
}

export type ModelDiagnosticResult = {
  ok: boolean
  endpoint: string
  elapsedMs: number
  firstTextMs: number | null
  status: number | null
  text: string
  error: string | null
}

export type ShortcutRegistration = {
  action: string
  key: string
  status: 'registered' | 'failed' | 'available' | 'disabled' | 'conflict'
  conflictAction?: string
}

export type SavedChatMessage = {
  id: string
  requestId: string
  role: 'user' | 'assistant'
  content: string
  source?: ChatMessageSource
  documents?: ChatDocument[]
  status?: 'streaming' | 'complete' | 'stopped' | 'error'
  error?: string
}

export type ConversationSummary = {
  id: string
  title: string
  mode: AssistantMode
  createdAt: string
  updatedAt: string
}

export type LocalDirectory = {
  path: string
  parent: string
  entries: { name: string; path: string; directory: boolean }[]
}

export type ConversationView = ConversationSummary & {
  chatMessages: SavedChatMessage[]
  visionText: string
  visionStatus: 'idle' | 'streaming' | 'complete' | 'stopped' | 'error'
  visionError: string | null
  screenshots: string[]
  sources: KnowledgeContextUsed[]
  profileId: string | null
  builtinKnowledge: boolean
  /** Absent for a plain assistant conversation */
  persona?: ConversationPersona
  mockInterview?: MockInterviewSetup
}

/** Chat conversations with their own system prompt: a review report or a mock interview */
export type ConversationPersona = 'review' | 'mock-interview'

export type MockInterviewFocus = 'technical' | 'project' | 'behavioral' | 'mixed'

export const MOCK_INTERVIEW_FOCUS_LABELS: Record<MockInterviewFocus, string> = {
  technical: '技术基础',
  project: '项目经历',
  behavioral: '行为面试',
  mixed: '综合'
}

export const MOCK_INTERVIEW_QUESTION_COUNTS = [3, 5, 8] as const

export type MockInterviewOptions = { questionCount: number; focus: MockInterviewFocus }

export type MockInterviewSetup = MockInterviewOptions & {
  /** Job profile summary captured at start, so reopening the conversation stays consistent */
  brief: string
  endedAt?: string
}

export type PersonaConversationResult =
  | { ok: true; views: Record<AssistantMode, ConversationView> }
  | { ok: false; error: string }

export const THINKING_LEVELS = [
  'auto',
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max'
] as const

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
  const rule = appConfig.modelThinkingRules.find((rule) =>
    new RegExp(rule.pattern, 'i').test(model.trim())
  )
  if (rule) return rule.levels as ThinkingLevel[]
  if (isGpt56Model(model)) return GPT_56_THINKING_LEVELS
  return isDeepSeekModel(model) ? DEEPSEEK_THINKING_LEVELS : DEFAULT_MODEL_THINKING_LEVELS
}

export function normalizeThinkingLevelForModel(model: string, level: ThinkingLevel): ThinkingLevel {
  const rule = appConfig.modelThinkingRules.find((rule) =>
    new RegExp(rule.pattern, 'i').test(model.trim())
  )
  if (rule && level in rule.migrations)
    return rule.migrations[level as keyof typeof rule.migrations] as ThinkingLevel
  // GPT-5.6 replaced the legacy `minimal` effort with `none`. Preserve an
  // existing user's intent by selecting the lowest supported reasoning level.
  return isGpt56Model(model) && level === 'minimal' ? 'low' : level
}

export type ChatProvider = 'deepseek' | 'custom'

export type AssistantMode = 'screenshot' | 'chat'

/** `control` marks instructions the app sends on the user's behalf (shown as a label, not a bubble) */
export type ChatMessageSource = 'typed' | 'transcription' | 'control'

export type TranscriptionProvider = 'dashscope' | 'volcengine'

export type TranscriptionAudioSource = 'system' | 'microphone' | 'mixed'

export type TranscriptionStatus =
  | 'idle'
  | 'connecting'
  | 'listening'
  | 'finishing'
  | 'stopped'
  | 'error'
export type TranscriptionStatusEvent = { sessionId: string; status: TranscriptionStatus }
export type TranscriptionTextEvent = {
  text: string
  isPartial: boolean
  confirmedText: string
  partialText: string
}

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

export type KnowledgePassage = {
  id: string
  documentId: string
  documentName: string
  order: number
  text: string
}

export type KnowledgeDiagnosticInput = {
  query: string
  profileId: string | null
  includeBuiltin: boolean
}

export type KnowledgeDiagnostic = {
  query: string
  profileName: string
  elapsedMs: number
  searchMs: number
  indexMs: number
  indexedDocuments: number
  updatedDocuments: number
  candidateCount: number
  candidates: (KnowledgePassage & { score: number })[]
  passages: KnowledgePassage[]
  context: string
  contextCharacters: number
}

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

/** Settings stored encrypted by the main process instead of the renderer's localStorage */
export const SECRET_SETTING_KEYS = [
  'apiKey',
  'chatApiKey',
  'dashscopeApiKey',
  'volcengineAsrApiKey'
] as const

export type SecretSettingKey = (typeof SECRET_SETTING_KEYS)[number]
export type SecretSettings = Partial<Record<SecretSettingKey, string>>
export type SecretStorageStatus = { encrypted: boolean }

export function isSecretSettingKey(key: string): key is SecretSettingKey {
  return (SECRET_SETTING_KEYS as readonly string[]).includes(key)
}

export function pickSecretSettings(source: object): SecretSettings {
  const secrets: SecretSettings = {}
  for (const [key, value] of Object.entries(source)) {
    if (isSecretSettingKey(key) && typeof value === 'string') secrets[key] = value
  }
  return secrets
}

export function omitSecretSettings<T extends object>(source: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !isSecretSettingKey(key))
  ) as Partial<T>
}

/** Screenshots are base64 without a data-URL prefix; JPEG data always starts with FF D8 FF */
export function getImageMediaType(base64: string): 'image/jpeg' | 'image/png' {
  return base64.startsWith('/9j/') ? 'image/jpeg' : 'image/png'
}

export function getImageExtension(base64: string): '.jpg' | '.png' {
  return getImageMediaType(base64) === 'image/jpeg' ? '.jpg' : '.png'
}

export const DEEPSEEK_API_BASE_URL = 'https://api.deepseek.com'
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-v4-flash'
export const DEEPSEEK_MODELS = ['deepseek-v4-flash', 'deepseek-v4-pro'] as const

export const DEFAULT_CHAT_SYSTEM_PROMPT =
  '你是一名准确、简洁的中文 AI 助手。直接回答用户问题；信息不足时明确说明。除非用户另有要求，否则使用中文回答。'

export const DEFAULT_MOCK_INTERVIEW_PROMPT = `你是一名严格但友善的技术面试官，正在对候选人进行模拟面试。规则：
1. 每次只提出一个问题，问题要具体，贴合岗位要求与候选人资料，不要一次列出多个问题。
2. 每个问题前标注题号，例如「第 2 题」。
3. 候选人回答后，先简短点评（亮点、缺漏、参考要点，各 1-3 条），再提出下一题；回答明显不完整时可以先追问一次，追问不计入题数。
4. 达到计划题数后不再提问，提示候选人点击「结束并评分」。
5. 回答来自语音识别，可能有错别字或断句问题，按语义理解，不要因识别错误扣分。
6. 使用中文。`

export const MOCK_INTERVIEW_END_PROMPT =
  '面试结束。请不要再提问，按技术深度、表达结构、项目匹配度、沟通四个维度分别打分（1-5 分）并说明理由，最后给出总体评价和 3 条最优先的改进建议。'

export const DEFAULT_REVIEW_REPORT_PROMPT = `你是一名资深技术面试复盘教练。用户会提供一场或多场面试过程中的记录：语音转录的问答、截图题目，以及当时 AI 给出的参考回答。请基于这些材料输出一份中文 Markdown 复盘报告，包含以下部分：

## 问题清单
按出现顺序列出面试官提出的问题或题目，每条一句话概括。

## 我的回答要点
针对每个问题，概括候选人实际表达的要点；材料中没有候选人回答的，标注「未记录到回答」，不要编造。

## 不足与改进
指出回答中的错误、遗漏和表达问题，并给出更好的回答思路或要点。

## 建议补充的资料
列出需要复习的知识点或需要准备的项目细节。

## 下一轮准备重点
给出 3-5 条最优先的准备建议。

要求：只依据材料作答；材料中的 AI 参考回答仅供对照，不代表候选人的回答。`

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
