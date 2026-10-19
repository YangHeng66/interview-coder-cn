import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import appConfig from '../../app.config.json'

const userData = vi.hoisted(() => ({ path: '' }))

vi.mock('electron', () => ({ app: { getPath: () => userData.path } }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})

// A PNG header is enough: assets are written as opaque bytes
const image =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

const directory = () => join(userData.path, appConfig.sessions.directory)
const conversationFile = (id: string) => join(directory(), `${id}.json`)
const assetDirectory = (id: string) => join(directory(), appConfig.sessions.assetDirectory, id)
const readIndex = () => JSON.parse(readFileSync(join(directory(), 'index.json'), 'utf8'))

async function load() {
  vi.resetModules()
  const fs = await import('node:fs/promises')
  const conversations = await import('./conversations')
  await conversations.initializeConversations()
  const indexWrites = () =>
    vi.mocked(fs.writeFile).mock.calls.filter(([path]) => String(path).endsWith('index.json.tmp'))
      .length
  return { ...conversations, writeFile: vi.mocked(fs.writeFile), indexWrites }
}

function chatMessage(
  record: (event: Parameters<typeof import('./conversations').recordChatEvent>[0]) => void,
  text: string
) {
  record({ type: 'user-message', requestId: text, messageId: text, text, source: 'typed' })
}

beforeEach(() => {
  userData.path = mkdtempSync(join(tmpdir(), 'conversations-'))
})

afterEach(() => {
  rmSync(userData.path, { recursive: true, force: true })
})

describe('deleteConversations', () => {
  it('removes the files and assets of every deleted conversation with one index write', async () => {
    const store = await load()
    const a = store.newConversation('chat')
    chatMessage(store.recordChatEvent, 'first')
    const s = store.newConversation('screenshot')
    store.recordVisionEvent('screenshots-updated', [image])
    const b = store.newConversation('chat')
    chatMessage(store.recordChatEvent, 'second')
    await store.flushConversations()
    expect(existsSync(assetDirectory(s.id))).toBe(true)

    store.writeFile.mockClear()
    await store.deleteConversations([a.id, s.id, 'missing'])

    expect(store.indexWrites()).toBe(1)
    expect(existsSync(conversationFile(a.id))).toBe(false)
    expect(existsSync(conversationFile(s.id))).toBe(false)
    expect(existsSync(assetDirectory(s.id))).toBe(false)
    expect(existsSync(conversationFile(b.id))).toBe(true)
    expect(readIndex().conversations.map((item: { id: string }) => item.id)).toEqual([b.id])
    expect(store.listConversations().conversations.map((item) => item.id)).toEqual([b.id])
  })

  it('switches each mode whose open conversation was deleted to a new one', async () => {
    const store = await load()
    const a = store.newConversation('chat')
    chatMessage(store.recordChatEvent, 'first')
    const b = store.newConversation('chat')
    chatMessage(store.recordChatEvent, 'second')
    await store.flushConversations()

    await store.deleteConversations([b.id])

    const active = store.activeConversation('chat')
    expect(active.id).not.toBe(b.id)
    expect(active.id).not.toBe(a.id)
    expect(active.chatMessages).toEqual([])
    expect(store.listConversations().active.chat).toBe(active.id)
  })

  it('never writes a deleted conversation back to disk', async () => {
    const store = await load()
    const a = store.newConversation('chat')
    chatMessage(store.recordChatEvent, 'first')
    await store.flushConversations()
    // Unsaved changes are pending when the delete starts
    chatMessage(store.recordChatEvent, 'pending')

    await store.deleteConversations([a.id])
    chatMessage(store.recordChatEvent, 'after')
    await store.flushConversations()

    expect(existsSync(conversationFile(a.id))).toBe(false)
    expect(readIndex().conversations.map((item: { id: string }) => item.id)).not.toContain(a.id)
  })

  it('leaves the disk untouched when no listed conversation matches', async () => {
    const store = await load()
    store.newConversation('chat')
    chatMessage(store.recordChatEvent, 'first')
    await store.flushConversations()

    store.writeFile.mockClear()
    await store.deleteConversations(['missing'])

    expect(store.writeFile).not.toHaveBeenCalled()
  })
})

describe('recordChatEvent', () => {
  type ChatEventInput = Parameters<typeof import('./conversations').recordChatEvent>[0]

  function voiceRequest(
    record: (event: ChatEventInput) => void,
    requestId: string,
    text: string,
    replacesRequestId?: string
  ) {
    record({
      type: 'user-message',
      requestId,
      messageId: `${requestId}-user`,
      text,
      source: 'transcription',
      replacesRequestId
    })
    record({ type: 'assistant-start', requestId, messageId: `${requestId}-assistant` })
  }

  it('replaces the question and answer of the request a resend replaces', async () => {
    const store = await load()
    const conversation = store.newConversation('chat')
    chatMessage(store.recordChatEvent, 'earlier')
    voiceRequest(store.recordChatEvent, 'a', '你好，欢迎参加今天的面试。')
    store.recordChatEvent({
      type: 'assistant-delta',
      requestId: 'a',
      messageId: 'a-assistant',
      delta: '你好'
    })
    store.recordChatEvent({ type: 'assistant-stopped', requestId: 'a', messageId: 'a-assistant' })

    voiceRequest(
      store.recordChatEvent,
      'b',
      '你好，欢迎参加今天的面试。先简单做个自我介绍吧。',
      'a'
    )
    await store.flushConversations()

    const reopened = await store.loadConversation(conversation.id)
    expect(reopened.chatMessages.map((message) => message.id)).toEqual([
      'earlier',
      'b-user',
      'b-assistant'
    ])
  })

  it('titles the conversation after the replacing question when the first one was replaced', async () => {
    const store = await load()
    store.newConversation('chat')
    voiceRequest(store.recordChatEvent, 'a', '你好')

    voiceRequest(store.recordChatEvent, 'b', '你好，先做个自我介绍吧', 'a')

    expect(store.activeConversation('chat').title).toBe('你好，先做个自我介绍吧')
  })
})
