import { describe, expect, it } from 'vitest'
import type { ModelMessage } from 'ai'
import { createChatModelText, normalizeChatDocuments } from './chat-documents'
import { extractErrorMessage } from './errors'
import { ChatHistoryTail, createRecentKnowledgeContext, getMessageText } from './messages'
import { normalizeShortcutKey } from '../shortcut-keys'

describe('extractErrorMessage', () => {
  it('prefers the API response body message', () => {
    const error = Object.assign(new Error('Bad Request'), {
      responseBody: JSON.stringify({ error: { message: 'invalid model' } })
    })
    expect(extractErrorMessage(error)).toBe('invalid model')
  })

  it('unwraps retry errors and falls back to the raw body or message', () => {
    const inner = Object.assign(new Error('x'), { responseBody: 'gateway down' })
    expect(extractErrorMessage(Object.assign(new Error('retry'), { lastError: inner }))).toBe(
      'gateway down'
    )
    expect(extractErrorMessage(new Error('timeout'))).toBe('timeout')
    expect(extractErrorMessage('boom')).toBe('boom')
  })
})

describe('chat documents', () => {
  it('normalizes valid documents and rejects unsupported or empty ones', () => {
    const result = normalizeChatDocuments([{ id: 'a', name: 'n\r\note.md', text: 'hi\0', size: 3 }])
    expect(result).toEqual([
      { id: 'a', name: 'note.md', mediaType: 'text/plain', size: 3, text: 'hi' }
    ])
    expect(normalizeChatDocuments(undefined)).toEqual([])
    expect(normalizeChatDocuments('x')).toBe('文档数据格式无效')
    expect(normalizeChatDocuments([{ name: 'a.exe', text: 'x', size: 1 }])).toBe(
      '不支持文档“a.exe”的格式'
    )
    expect(normalizeChatDocuments([{ name: 'a.md', text: '  ', size: 1 }])).toBe(
      '文档“a.md”没有可读取的文本'
    )
  })

  it('wraps documents around the question text', () => {
    const text = createChatModelText('', [
      { id: '1', name: 'a.md', mediaType: 'text/plain', size: 1, text: 'A' }
    ])
    expect(text).toBe(
      '请阅读以下文档并回答。\n\n===== 文档 1 开始：a.md =====\nA\n===== 文档 1 结束：a.md ====='
    )
    expect(createChatModelText('问题', [])).toBe('问题')
  })
})

describe('message text helpers', () => {
  const messages: ModelMessage[] = [
    {
      role: 'user',
      content: [
        { type: 'text', text: '题目' },
        { type: 'image', image: 'abc' }
      ]
    },
    { role: 'assistant', content: '解答' }
  ]

  it('extracts only text parts', () => {
    expect(getMessageText(messages[0])).toBe('题目')
    expect(getMessageText(messages[1])).toBe('解答')
  })

  it('summarizes recent turns for knowledge retrieval', () => {
    expect(createRecentKnowledgeContext(messages)).toBe('user: 题目\nassistant: 解答')
  })
})

describe('ChatHistoryTail', () => {
  const exchange = (question: string): ModelMessage[] => [
    { role: 'user', content: question },
    { role: 'assistant', content: `answer to ${question}` }
  ]

  it('drops the exchange of a replaced request while it is the last one', () => {
    const tail = new ChatHistoryTail()
    const history = [...exchange('earlier'), ...exchange('你好')]
    tail.record('half', history)

    expect(tail.withoutReplaced(history, 'half')).toEqual(exchange('earlier'))
  })

  it('keeps the history when another request answered after the replaced one', () => {
    const tail = new ChatHistoryTail()
    const history = exchange('你好')
    tail.record('half', history)
    history.push(...exchange('typed'))
    tail.record('typed', history)

    expect(tail.withoutReplaced(history, 'half')).toBe(history)
  })

  it('keeps the history when the replaced request never answered', () => {
    const tail = new ChatHistoryTail()
    const history = exchange('earlier')
    tail.record('earlier', history)

    expect(tail.withoutReplaced(history, 'half')).toBe(history)
    expect(tail.withoutReplaced(history, undefined)).toBe(history)
  })

  it('keeps a history that changed without a recorded exchange', () => {
    const tail = new ChatHistoryTail()
    tail.record('half', exchange('你好'))

    const restored = [...exchange('other'), ...exchange('conversation')]
    expect(tail.withoutReplaced(restored, 'half')).toBe(restored)

    const history = exchange('你好')
    tail.record('half', history)
    tail.reset()
    expect(tail.withoutReplaced(history, 'half')).toBe(history)
  })

  it('forgets the dropped exchange so an earlier one is never dropped next', () => {
    const tail = new ChatHistoryTail()
    const history = [...exchange('earlier'), ...exchange('你好')]
    tail.record('half', history)
    const trimmed = tail.withoutReplaced(history, 'half')

    expect(tail.withoutReplaced(trimmed, 'half')).toBe(trimmed)
  })
})

describe('normalizeShortcutKey', () => {
  it('canonicalizes modifiers so equivalent accelerators collide', () => {
    expect(normalizeShortcutKey('CommandOrControl+Shift+Enter', 'win32')).toBe(
      normalizeShortcutKey('Shift+Ctrl+Enter', 'win32')
    )
    expect(normalizeShortcutKey('CommandOrControl+H', 'darwin')).toBe('command+h')
  })
})
