import { describe, expect, it } from 'vitest'
import { TranscriptionBuffer } from './transcription-buffer'

describe('TranscriptionBuffer', () => {
  it('keeps partial text visible and finalizes a sentence', () => {
    const buffer = new TranscriptionBuffer()

    buffer.updatePartial('你好')
    expect(buffer.getText()).toBe('你好')
    buffer.finishSentence('你好')
    expect(buffer.getText()).toBe('你好')
    expect(buffer.consume()).toBe('你好')
    expect(buffer.getText()).toBe('')
  })

  it('returns only the new suffix after a partial result was consumed', () => {
    const buffer = new TranscriptionBuffer()

    buffer.updatePartial('你好')
    expect(buffer.consume()).toBe('你好')
    buffer.updatePartial('你好，面试官')

    expect(buffer.getText()).toBe('，面试官')
    expect(buffer.consume()).toBe('，面试官')
  })

  it('handles providers that reset the partial text for a new utterance', () => {
    const buffer = new TranscriptionBuffer()

    buffer.updatePartial('第一句')
    expect(buffer.consume()).toBe('第一句')
    buffer.updatePartial('第二句')

    expect(buffer.getText()).toBe('第二句')
    buffer.finishSentence('第二句')
    expect(buffer.consume()).toBe('第二句')
  })

  it('clears finalized and partial text without throwing', () => {
    const buffer = new TranscriptionBuffer()

    buffer.updatePartial('待清除')
    buffer.clear()
    expect(buffer.getText()).toBe('')
    expect(buffer.consume()).toBe('')
  })

  describe('consumeConfirmed', () => {
    it('consumes the confirmed part of a partial and keeps the unconfirmed tail', () => {
      const buffer = new TranscriptionBuffer()

      buffer.updatePartial('你好')
      buffer.confirmPartial()
      buffer.updatePartial('你好，请')

      expect(buffer.consumeConfirmed()).toBe('你好')
      expect(buffer.getText()).toBe('，请')

      buffer.finishSentence('你好，请介绍一下。')
      expect(buffer.getText()).toBe('，请介绍一下。')
    })

    it('consumes finalized text and keeps an unconfirmed partial', () => {
      const buffer = new TranscriptionBuffer()

      buffer.finishSentence('第一句。')
      buffer.updatePartial('第二')

      expect(buffer.consumeConfirmed()).toBe('第一句。')
      expect(buffer.getText()).toBe('第二')
    })

    it('returns an empty string and leaves the text untouched when nothing is confirmed', () => {
      const buffer = new TranscriptionBuffer()

      buffer.updatePartial('还没确认')

      expect(buffer.consumeConfirmed()).toBe('')
      expect(buffer.getText()).toBe('还没确认')
    })
  })

  describe('revised partials', () => {
    it('does not hand out consumed text again when misheard words are corrected', () => {
      const buffer = new TranscriptionBuffer()

      buffer.updatePartial('下一个问题，BO3的响应式原理和 BO2有什么不同')
      buffer.consume()
      buffer.finishSentence(
        '下一个问题，Vue 3的响应式原理和 Vue 2有什么不同？Proxy 相比 defineProperty 好在哪里？'
      )

      expect(buffer.getText()).toBe('？Proxy 相比 defineProperty 好在哪里？')
    })

    it('follows a revision that adds and rewrites several words', () => {
      const buffer = new TranscriptionBuffer()

      buffer.updatePartial(
        '下一个问题3的响应是原理和 V2有什么不同？proxy 相比 define，property 好在哪里'
      )
      buffer.consume()
      buffer.finishSentence(
        '下一个问题。Vue 3的响应式原理和 Vue 2有什么不同？Proxy 相比 defineProperty 好在哪里？'
      )

      expect(buffer.getText()).toBe('？')
    })

    it('ignores punctuation the provider adds or changes later', () => {
      const buffer = new TranscriptionBuffer()

      buffer.updatePartial('你好欢迎参加今天的面试先')
      buffer.consume()
      buffer.updatePartial('你好，欢迎参加今天的面试。先简单')

      expect(buffer.getText()).toBe('简单')
    })

    it('ignores letter case the provider normalizes later', () => {
      const buffer = new TranscriptionBuffer()

      buffer.updatePartial('主要使用 react')
      buffer.consume()
      buffer.finishSentence('主要使用 React 和 Vue。')

      expect(buffer.getText()).toBe(' 和 Vue。')
    })

    it('keeps the confirmed boundary across a revision', () => {
      const buffer = new TranscriptionBuffer()

      buffer.updatePartial('你好欢迎')
      buffer.confirmPartial()
      buffer.updatePartial('你好，欢迎参加')

      expect(buffer.consumeConfirmed()).toBe('你好，欢迎')
      expect(buffer.getText()).toBe('参加')
    })
  })
})
