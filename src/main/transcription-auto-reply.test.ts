import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AUTO_REPLY_MAX_CHARACTERS,
  AUTO_REPLY_TURN_GAP_MS,
  AutoReplyTurn,
  isMeaningfulSpeech,
  shouldTriggerAutoReply
} from './transcription-auto-reply'

describe('AutoReplyTurn', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('resends the whole turn when the speaker continues after a pause', () => {
    const turn = new AutoReplyTurn()

    turn.append('那我们聊聊前端性能')
    expect(turn.pendingRequest).toBe('那我们聊聊前端性能')
    turn.markSent()
    expect(turn.pendingRequest).toBeNull()

    turn.append('，你说说重绘和回流有什么区别？')
    expect(turn.pendingRequest).toBe('那我们聊聊前端性能，你说说重绘和回流有什么区别？')
  })

  it('does not resend when only punctuation was added', () => {
    const turn = new AutoReplyTurn()
    turn.append('你说说重绘和回流有什么区别')
    turn.markSent()

    turn.append('？')

    expect(turn.pendingRequest).toBeNull()
  })

  it('does not resend for a single extra character', () => {
    const turn = new AutoReplyTurn()
    turn.append('先简单做个自我介绍')
    turn.markSent()

    turn.append('吧。')

    expect(turn.pendingRequest).toBeNull()
  })

  it('drops punctuation left over from the end of the previous turn', () => {
    const turn = new AutoReplyTurn()
    turn.append('？最后一道场景题')
    expect(turn.pendingRequest).toBe('最后一道场景题')

    turn.clear()
    turn.append('面试官：？最后一道场景题')
    expect(turn.pendingRequest).toBe('面试官：最后一道场景题')
  })

  it('holds back a turn that is only a filler word', () => {
    const turn = new AutoReplyTurn()

    turn.append('对。')
    expect(turn.pendingRequest).toBeNull()

    turn.append('那你说说怎么减少回流？')
    expect(turn.pendingRequest).toBe('对。那你说说怎么减少回流？')
  })

  it('starts a new turn once the speaker has been quiet for the gap', () => {
    const turn = new AutoReplyTurn()
    turn.append('第一个问题？')
    turn.markSent()

    vi.advanceTimersByTime(AUTO_REPLY_TURN_GAP_MS)
    turn.append('第二个问题？')

    expect(turn.pendingRequest).toBe('第二个问题？')
  })

  it('stays open while the speaker is still talking', () => {
    const turn = new AutoReplyTurn()
    turn.append('最后一道场景题')
    turn.markSent()

    vi.advanceTimersByTime(AUTO_REPLY_TURN_GAP_MS - 100)
    turn.touch()
    vi.advanceTimersByTime(AUTO_REPLY_TURN_GAP_MS - 100)
    turn.append('，请设计一个完整的方案。')

    expect(turn.pendingRequest).toBe('最后一道场景题，请设计一个完整的方案。')
  })

  it('keeps a request that could not be sent yet past the gap', () => {
    const turn = new AutoReplyTurn()
    turn.append('还没发出去的问题？')

    vi.advanceTimersByTime(AUTO_REPLY_TURN_GAP_MS * 3)

    expect(turn.pendingRequest).toBe('还没发出去的问题？')
  })

  it('starts a new turn instead of growing past the size limit', () => {
    const turn = new AutoReplyTurn()
    turn.append('长'.repeat(AUTO_REPLY_MAX_CHARACTERS - 1))
    turn.markSent()

    turn.append('新的问题？')

    expect(turn.pendingRequest).toBe('新的问题？')
  })

  it('drops everything when cleared', () => {
    const turn = new AutoReplyTurn()
    turn.append('不会发送的问题？')

    turn.clear()

    expect(turn.pendingRequest).toBeNull()
  })
})

describe('isMeaningfulSpeech', () => {
  it('rejects punctuation and filler words', () => {
    expect(isMeaningfulSpeech('。')).toBe(false)
    expect(isMeaningfulSpeech('对。')).toBe(false)
    expect(isMeaningfulSpeech('嗯，好的，好的')).toBe(false)
    expect(isMeaningfulSpeech('OK')).toBe(false)
  })

  it('accepts anything with content beyond fillers', () => {
    expect(isMeaningfulSpeech('好的，我了解了，那你说说回流')).toBe(true)
    expect(isMeaningfulSpeech('下一个问题')).toBe(true)
  })
})

describe('shouldTriggerAutoReply', () => {
  it('skips my own speech in a regular conversation', () => {
    expect(shouldTriggerAutoReply('me', undefined)).toBe(false)
  })

  it('skips my own speech in a review conversation', () => {
    expect(shouldTriggerAutoReply('me', 'review')).toBe(false)
  })

  it('replies to my own speech in a mock interview', () => {
    expect(shouldTriggerAutoReply('me', 'mock-interview')).toBe(true)
  })

  it('replies to the interviewer in every conversation type', () => {
    expect(shouldTriggerAutoReply('interviewer', undefined)).toBe(true)
    expect(shouldTriggerAutoReply('interviewer', 'review')).toBe(true)
    expect(shouldTriggerAutoReply('interviewer', 'mock-interview')).toBe(true)
  })

  it('replies when the speaker is unknown', () => {
    expect(shouldTriggerAutoReply(null, undefined)).toBe(true)
    expect(shouldTriggerAutoReply(undefined, undefined)).toBe(true)
    expect(shouldTriggerAutoReply(null, 'mock-interview')).toBe(true)
  })
})
