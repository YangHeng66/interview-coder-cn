import { beforeEach, describe, expect, it } from 'vitest'
import type { ChatEvent } from '../../../../preload/contracts'
import { useChatStore } from './chat'

const send = (event: ChatEvent) => useChatStore.getState().handleEvent(event)

function voiceRequest(requestId: string, text: string, replacesRequestId?: string) {
  send({
    type: 'user-message',
    requestId,
    messageId: `${requestId}-user`,
    text,
    source: 'transcription',
    replacesRequestId
  })
  send({ type: 'assistant-start', requestId, messageId: `${requestId}-assistant` })
}

describe('useChatStore', () => {
  beforeEach(() => {
    send({ type: 'conversation-cleared' })
  })

  it('replaces the question and answer of the request a resend replaces', () => {
    send({
      type: 'user-message',
      requestId: 'typed',
      messageId: 'typed',
      text: '你好',
      source: 'typed'
    })
    voiceRequest('a', '你好，欢迎参加今天的面试。')
    send({ type: 'assistant-delta', requestId: 'a', messageId: 'a-assistant', delta: '你好' })
    send({ type: 'assistant-stopped', requestId: 'a', messageId: 'a-assistant' })

    voiceRequest('b', '你好，欢迎参加今天的面试。先简单做个自我介绍吧。', 'a')

    const { messages, isLoading, activeRequestId } = useChatStore.getState()
    expect(messages.map((message) => message.id)).toEqual(['typed', 'b-user', 'b-assistant'])
    expect(messages[1].content).toBe('你好，欢迎参加今天的面试。先简单做个自我介绍吧。')
    expect(isLoading).toBe(true)
    expect(activeRequestId).toBe('b')
  })

  it('keeps the replacing request when its own messages already arrived with a view', () => {
    voiceRequest('a', '你好')
    useChatStore.setState((state) => ({
      messages: [
        ...state.messages,
        { id: 'b-user', requestId: 'b', role: 'user', content: '你好，请介绍一下自己' }
      ]
    }))

    voiceRequest('b', '你好，请介绍一下自己', 'a')

    expect(useChatStore.getState().messages.map((message) => message.id)).toEqual([
      'b-user',
      'b-assistant'
    ])
  })
})
