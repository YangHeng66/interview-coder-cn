import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const userData = vi.hoisted(() => ({ path: '' }))

vi.mock('electron', () => ({ app: { getPath: () => userData.path } }))
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>()
  return { ...actual, writeFile: vi.fn(actual.writeFile) }
})

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
