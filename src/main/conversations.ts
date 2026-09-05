import { app } from 'electron'
import { mkdir, readFile, writeFile, rename, unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { ModelMessage } from 'ai'
import type {
  AssistantMode,
  ChatEvent,
  ConversationSummary,
  ConversationView,
  KnowledgeContextUsed
} from '../preload/contracts'
import appConfig from '../../app.config.json'

type Conversation = ConversationView & { modelMessages: ModelMessage[] }
type Manifest = {
  conversations: ConversationSummary[]
  active: Record<AssistantMode, string | null>
}

let manifest: Manifest = { conversations: [], active: { screenshot: null, chat: null } }
const loaded = new Map<string, Conversation>()
const dirty = new Set<string>()
let timer: ReturnType<typeof setTimeout> | null = null
let writes = Promise.resolve()
let storageError: string | null = null
const directory = () => join(app.getPath('userData'), appConfig.sessions.directory)

export async function initializeConversations() {
  await mkdir(directory(), { recursive: true })
  try {
    manifest = JSON.parse(await readFile(join(directory(), 'index.json'), 'utf8')) as Manifest
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }
  for (const id of Object.values(manifest.active)) {
    if (id) await loadConversation(id)
  }
}

function queueSave() {
  if (timer !== null) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    void flushConversations().catch((error) => {
      storageError = String(error)
      global.mainWindow?.webContents.send('conversation-storage-error', storageError)
    })
  }, appConfig.sessions.saveDelayMs)
}

function touch(conversation: Conversation) {
  conversation.updatedAt = new Date().toISOString()
  const summary: ConversationSummary = {
    id: conversation.id,
    title: conversation.title,
    mode: conversation.mode,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  }
  const index = manifest.conversations.findIndex((item) => item.id === conversation.id)
  if (index === -1) manifest.conversations.push(summary)
  else manifest.conversations[index] = summary
  dirty.add(conversation.id)
  queueSave()
}

export function newConversation(mode: AssistantMode): Conversation {
  const timestamp = new Date().toISOString()
  const conversation: Conversation = {
    id: randomUUID(),
    title: mode === 'chat' ? '新的文字对话' : '截图分析',
    mode,
    createdAt: timestamp,
    updatedAt: timestamp,
    chatMessages: [],
    visionText: '',
    visionStatus: 'idle',
    visionError: null,
    screenshots: [],
    sources: [],
    modelMessages: [],
    profileId: null,
    builtinKnowledge: false
  }
  loaded.set(conversation.id, conversation)
  manifest.active[mode] = conversation.id
  queueSave()
  return conversation
}

export function activeConversation(mode: AssistantMode): Conversation {
  const id = manifest.active[mode]
  return id ? loaded.get(id)! : newConversation(mode)
}

export function getConversationView(mode: AssistantMode): ConversationView {
  const { modelMessages: _models, ...view } = activeConversation(mode)
  void _models
  return view
}

export function listConversations() {
  return {
    conversations: [...manifest.conversations].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt)
    ),
    active: manifest.active,
    error: storageError
  }
}

export function saveConversationModels(mode: AssistantMode, messages: ModelMessage[]) {
  const conversation = activeConversation(mode)
  conversation.modelMessages = messages
  if (messages.length || conversation.chatMessages.length || conversation.visionText)
    touch(conversation)
}

export function recordChatEvent(event: ChatEvent) {
  if (event.type === 'conversation-cleared') {
    newConversation('chat')
    return
  }
  if (event.type === 'auto-reply-queue' || event.type === 'request-error') return
  const conversation = activeConversation('chat')
  if (event.type === 'user-message') {
    if (!conversation.chatMessages.length)
      conversation.title = (event.text || event.documents?.[0]?.name || '文字对话').slice(
        0,
        appConfig.sessions.titleLength
      )
    conversation.chatMessages.push({
      id: event.messageId,
      requestId: event.requestId,
      role: 'user',
      content: event.text,
      source: event.source,
      documents: event.documents
    })
  } else if (event.type === 'assistant-start') {
    conversation.chatMessages.push({
      id: event.messageId,
      requestId: event.requestId,
      role: 'assistant',
      content: '',
      status: 'streaming'
    })
  } else {
    const message = conversation.chatMessages.find((item) => item.id === event.messageId)
    if (!message) return
    if (event.type === 'assistant-delta') {
      if (message.status === 'streaming') message.content += event.delta
    } else {
      message.status =
        event.type === 'assistant-complete'
          ? 'complete'
          : event.type === 'assistant-stopped'
            ? 'stopped'
            : 'error'
      if (event.type === 'assistant-error') message.error = event.error
    }
  }
  touch(conversation)
}

export function recordVisionEvent(channel: string, value?: string | string[]) {
  if (channel === 'solution-clear') {
    newConversation('screenshot')
    return
  }
  const conversation = activeConversation('screenshot')
  if (channel === 'solution-chunk') conversation.visionText += value as string
  if (channel === 'screenshots-updated') conversation.screenshots = value as string[]
  if (channel === 'ai-loading-start') {
    conversation.visionStatus = 'streaming'
    conversation.visionError = null
  }
  if (channel === 'solution-complete') conversation.visionStatus = 'complete'
  if (channel === 'solution-stopped') conversation.visionStatus = 'stopped'
  if (channel === 'solution-error') {
    conversation.visionStatus = 'error'
    conversation.visionError = value as string
  }
  if (conversation.screenshots.length || conversation.visionText) touch(conversation)
}

export function recordKnowledge(context: KnowledgeContextUsed) {
  const conversation = activeConversation(context.mode === 'chat' ? 'chat' : 'screenshot')
  conversation.sources.push(context)
  touch(conversation)
}

export async function loadConversation(id: string): Promise<Conversation> {
  let conversation = loaded.get(id)
  if (!conversation) {
    const entry = manifest.conversations.find((item) => item.id === id)!
    conversation = JSON.parse(
      await readFile(join(directory(), `${entry.id}.json`), 'utf8')
    ) as Conversation
    conversation.chatMessages.forEach((message) => {
      if (message.status === 'streaming') message.status = 'stopped'
    })
    if (conversation.visionStatus === 'streaming') conversation.visionStatus = 'stopped'
    loaded.set(id, conversation)
  }
  return conversation
}

export function activateConversation(conversation: Conversation) {
  loaded.set(conversation.id, conversation)
  manifest.active[conversation.mode] = conversation.id
  queueSave()
}

export async function renameConversation(id: string, title: string) {
  const summary = manifest.conversations.find((item) => item.id === id)!
  const conversation =
    loaded.get(id) ??
    (JSON.parse(await readFile(join(directory(), `${summary.id}.json`), 'utf8')) as Conversation)
  conversation.title = title.trim()
  loaded.set(id, conversation)
  touch(conversation)
  await flushConversations()
}

export async function deleteConversation(id: string) {
  await flushConversations()
  const entry = manifest.conversations.find((item) => item.id === id)!
  await unlink(join(directory(), `${entry.id}.json`))
  loaded.delete(id)
  manifest.conversations = manifest.conversations.filter((item) => item.id !== id)
  if (manifest.active[entry.mode] === id) newConversation(entry.mode)
  await flushConversations()
}

export async function exportConversation(id: string): Promise<string> {
  const summary = manifest.conversations.find((item) => item.id === id)!
  const conversation =
    loaded.get(id) ??
    (JSON.parse(await readFile(join(directory(), `${summary.id}.json`), 'utf8')) as Conversation)
  const content =
    conversation.mode === 'chat'
      ? conversation.chatMessages
          .map((message) => `## ${message.role === 'user' ? '问题' : '回答'}\n\n${message.content}`)
          .join('\n\n')
      : conversation.visionText
  const sources = conversation.sources.flatMap((context) =>
    context.sources.map((source) => `- ${source.name}\n\n${source.excerpts.join('\n\n')}`)
  )
  const exportDir = join(directory(), appConfig.sessions.exportDirectory)
  await mkdir(exportDir, { recursive: true })
  const path = join(exportDir, `${conversation.id}.md`)
  await writeFile(
    path,
    `# ${conversation.title}\n\n${content}${sources.length ? '\n\n## 引用资料\n\n' + sources.join('\n\n') : ''}\n`,
    'utf8'
  )
  return path
}

export function flushConversations(): Promise<void> {
  if (timer !== null) clearTimeout(timer)
  timer = null
  const snapshots = [...dirty].map((id) => ({ id, json: JSON.stringify(loaded.get(id)) }))
  dirty.clear()
  const index = JSON.stringify({
    ...manifest,
    active: Object.fromEntries(
      Object.entries(manifest.active).map(([mode, id]) => [
        mode,
        manifest.conversations.some((item) => item.id === id) ? id : null
      ])
    )
  })
  // Serialize disk updates so switching sessions cannot overwrite a newer snapshot.
  const operation = writes.then(async () => {
    for (const snapshot of snapshots) {
      const path = join(directory(), `${snapshot.id}.json`)
      await writeFile(`${path}.tmp`, snapshot.json, 'utf8')
      await rename(`${path}.tmp`, path)
    }
    const path = join(directory(), 'index.json')
    await writeFile(`${path}.tmp`, index, 'utf8')
    await rename(`${path}.tmp`, path)
    storageError = null
    for (const id of loaded.keys()) {
      if (!Object.values(manifest.active).includes(id) && !dirty.has(id)) loaded.delete(id)
    }
  })
  writes = operation.catch((error) => {
    storageError = String(error)
    snapshots.forEach(({ id }) => dirty.add(id))
  })
  return operation
}
