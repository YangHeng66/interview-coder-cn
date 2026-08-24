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
})
