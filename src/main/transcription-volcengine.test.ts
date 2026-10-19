import { describe, expect, it } from 'vitest'
import { parseVolcengineUtterances, VolcengineUtteranceTracker } from './transcription-volcengine'

describe('VolcengineUtteranceTracker', () => {
  it('reports only the utterance still being spoken while nothing is definite', () => {
    const tracker = new VolcengineUtteranceTracker()

    expect(tracker.update([{ text: '你好', definite: false }], false)).toEqual({
      finished: [],
      partial: '你好'
    })
  })

  it('finishes each utterance once, even when the next one arrives in the same frame', () => {
    const tracker = new VolcengineUtteranceTracker()
    tracker.update([{ text: '你好', definite: false }], false)

    expect(
      tracker.update(
        [
          { text: '你好。', definite: true },
          { text: '先简单', definite: false }
        ],
        false
      )
    ).toEqual({ finished: ['你好。'], partial: '先简单' })
    expect(
      tracker.update(
        [
          { text: '你好。', definite: true },
          { text: '先简单介绍', definite: false }
        ],
        false
      )
    ).toEqual({ finished: [], partial: '先简单介绍' })
  })

  it('finishes everything left on the final packet', () => {
    const tracker = new VolcengineUtteranceTracker()

    expect(tracker.update([{ text: '最后一句', definite: false }], true)).toEqual({
      finished: ['最后一句'],
      partial: ''
    })
  })
})

describe('parseVolcengineUtterances', () => {
  it('keeps text and definiteness and ignores malformed entries', () => {
    expect(
      parseVolcengineUtterances([
        { text: '你好', definite: true, start_time: 0 },
        { text: '先', definite: false },
        null,
        { definite: true }
      ])
    ).toEqual([
      { text: '你好', definite: true },
      { text: '先', definite: false }
    ])
  })

  it('returns an empty list when the provider sends no utterances', () => {
    expect(parseVolcengineUtterances(undefined)).toEqual([])
  })
})
