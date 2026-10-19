import { describe, expect, it } from 'vitest'
import type { TranscriptionSpeaker } from '../preload/contracts'
import { TranscriptionBuffer } from './transcription-buffer'
import {
  formatTranscriptionLines,
  SpeakerTranscript,
  speakerForChannel
} from './transcription-speakers'

function createDualTranscript(): SpeakerTranscript {
  const transcript = new SpeakerTranscript()
  transcript.setSpeakers(['interviewer', 'me'])
  return transcript
}

describe('speakerForChannel', () => {
  it('maps the system channel to the interviewer', () => {
    expect(speakerForChannel('system')).toBe('interviewer')
  })

  it('maps the microphone channel to me', () => {
    expect(speakerForChannel('microphone')).toBe('me')
  })

  it('returns null when there is no channel', () => {
    expect(speakerForChannel(null)).toBeNull()
  })
})

describe('formatTranscriptionLines', () => {
  it('joins lines directly when no line has a speaker', () => {
    const text = formatTranscriptionLines([
      { speaker: null, text: '你好' },
      { speaker: null, text: '，世界' }
    ])

    expect(text).toBe('你好，世界')
  })

  it('writes one labeled line per entry when speakers are present', () => {
    const text = formatTranscriptionLines([
      { speaker: 'interviewer', text: '请介绍一下项目' },
      { speaker: 'me', text: '好的' }
    ])

    expect(text).toBe('面试官：请介绍一下项目\n我：好的')
  })

  it('labels a single line when only one speaker is present', () => {
    expect(formatTranscriptionLines([{ speaker: 'me', text: '好的' }])).toBe('我：好的')
  })

  it('skips lines with empty text', () => {
    const lines: { speaker: TranscriptionSpeaker | null; text: string }[] = [
      { speaker: 'interviewer', text: '问题' },
      { speaker: 'me', text: '' },
      { speaker: 'interviewer', text: '补充' }
    ]

    expect(formatTranscriptionLines(lines)).toBe('面试官：问题\n面试官：补充')
  })

  it('skips empty lines when no line has a speaker', () => {
    const text = formatTranscriptionLines([
      { speaker: null, text: '' },
      { speaker: null, text: '你好' }
    ])

    expect(text).toBe('你好')
  })

  it('writes unlabeled lines as plain text when mixed with labeled lines', () => {
    const text = formatTranscriptionLines([
      { speaker: null, text: '旧的内容' },
      { speaker: 'interviewer', text: '新问题。' }
    ])

    expect(text).toBe('旧的内容\n面试官：新问题。')
  })

  it('returns an empty string for no lines', () => {
    expect(formatTranscriptionLines([])).toBe('')
  })
})

describe('SpeakerTranscript with a single source', () => {
  it('stays in step with TranscriptionBuffer for the same operations', () => {
    const transcript = new SpeakerTranscript()
    const buffer = new TranscriptionBuffer()
    const expectInSync = (): void => {
      const segments = buffer.getSegments()
      const hasText = Boolean(segments.confirmedText || segments.partialText)

      expect(transcript.getText()).toBe(buffer.getText())
      expect(transcript.getLines()).toEqual(hasText ? [{ speaker: null, ...segments }] : [])
    }

    expectInSync()

    transcript.updatePartial(null, '你好')
    buffer.updatePartial('你好')
    expectInSync()

    transcript.confirm(null, false)
    buffer.confirmPartial()
    expectInSync()

    transcript.updatePartial(null, '你好，面试官')
    buffer.updatePartial('你好，面试官')
    expectInSync()

    transcript.finishSentence(null, '你好，面试官。')
    buffer.finishSentence('你好，面试官。')
    expectInSync()

    transcript.confirm(null, true)
    buffer.confirmPartial()
    expectInSync()

    transcript.updatePartial(null, '第二句')
    buffer.updatePartial('第二句')
    expectInSync()

    expect(transcript.consume()).toBe(buffer.consume())
    expectInSync()

    transcript.updatePartial(null, '第二句话')
    buffer.updatePartial('第二句话')
    expectInSync()

    transcript.finishSentence(null, '第二句话。')
    buffer.finishSentence('第二句话。')
    expectInSync()

    transcript.clear()
    buffer.clear()
    expectInSync()
  })

  it('finalizes and consumes the confirmed part like TranscriptionBuffer', () => {
    const transcript = new SpeakerTranscript()
    const buffer = new TranscriptionBuffer()
    const expectInSync = (): void => {
      const segments = buffer.getSegments()
      const hasText = Boolean(segments.confirmedText || segments.partialText)

      expect(transcript.getText()).toBe(buffer.getText())
      expect(transcript.getLines()).toEqual(hasText ? [{ speaker: null, ...segments }] : [])
    }

    transcript.finishSentence(null, '第一句。')
    buffer.finishSentence('第一句。')
    transcript.updatePartial(null, '第二')
    buffer.updatePartial('第二')
    transcript.confirm(null, true)
    buffer.confirmPartial()
    transcript.updatePartial(null, '第二句')
    buffer.updatePartial('第二句')
    expectInSync()

    expect(transcript.consumeConfirmed()).toBe(buffer.consumeConfirmed())
    expectInSync()

    transcript.updatePartial(null, '第二句话')
    buffer.updatePartial('第二句话')
    expectInSync()

    transcript.finalizePartial(null)
    buffer.finalizeCurrentPartial()
    expectInSync()
    expect(transcript.getLines()).toEqual([
      { speaker: null, confirmedText: '句话', partialText: '' }
    ])
  })

  it('exposes the text of the single source through getSpeakerText(null)', () => {
    const transcript = new SpeakerTranscript()

    transcript.updatePartial(null, '只有一个来源')

    expect(transcript.getSpeakerText(null)).toBe('只有一个来源')
    expect(transcript.getSpeakerText('interviewer')).toBe('')
    expect(transcript.getSpeakerText('me')).toBe('')
  })
})

describe('SpeakerTranscript with two speakers', () => {
  it('labels text in the order it was finalized', () => {
    const transcript = createDualTranscript()

    transcript.updatePartial('interviewer', '请介绍')
    transcript.finishSentence('interviewer', '请介绍一下项目。')
    transcript.confirm('interviewer', true)
    transcript.finishSentence('me', '好的。')
    transcript.confirm('me', true)

    expect(transcript.getText()).toBe('面试官：请介绍一下项目。\n我：好的。')
    expect(transcript.getLines()).toEqual([
      { speaker: 'interviewer', confirmedText: '请介绍一下项目。', partialText: '' },
      { speaker: 'me', confirmedText: '好的。', partialText: '' }
    ])
  })

  it('merges adjacent sentences of the same speaker into one line', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '第一句。')
    transcript.confirm('interviewer', true)
    transcript.finishSentence('interviewer', '第二句。')
    transcript.confirm('interviewer', true)

    expect(transcript.getText()).toBe('面试官：第一句。第二句。')
    expect(transcript.getLines()).toEqual([
      { speaker: 'interviewer', confirmedText: '第一句。第二句。', partialText: '' }
    ])
  })

  it('keeps partial text of each speaker as a trailing line', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '问题一。')
    transcript.confirm('interviewer', true)
    transcript.updatePartial('me', '我觉得')
    transcript.updatePartial('interviewer', '那么')

    expect(transcript.getLines()).toEqual([
      { speaker: 'interviewer', confirmedText: '问题一。', partialText: '' },
      { speaker: 'me', confirmedText: '', partialText: '我觉得' },
      { speaker: 'interviewer', confirmedText: '', partialText: '那么' }
    ])
    expect(transcript.getText()).toBe('面试官：问题一。\n我：我觉得\n面试官：那么')
  })

  it('merges a partial into the previous line of the same speaker', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '问题一。')
    transcript.confirm('interviewer', true)
    transcript.updatePartial('interviewer', '那么')

    expect(transcript.getLines()).toEqual([
      { speaker: 'interviewer', confirmedText: '问题一。', partialText: '那么' }
    ])
    expect(transcript.getText()).toBe('面试官：问题一。那么')
  })

  it('orders text by when each speaker started talking, not by when it was finalized', () => {
    const transcript = createDualTranscript()

    transcript.updatePartial('interviewer', '你好')
    transcript.confirm('interviewer', false)
    transcript.finishSentence('me', '在的。')
    transcript.confirm('me', true)

    expect(transcript.getText()).toBe('面试官：你好\n我：在的。')
  })

  it('keeps the start order when the later speaker finalizes first', () => {
    const transcript = createDualTranscript()

    transcript.updatePartial('interviewer', '请问')
    transcript.updatePartial('me', '嗯')
    transcript.finishSentence('me', '嗯嗯。')
    transcript.confirm('me', true)
    transcript.finishSentence('interviewer', '请问你是？')
    transcript.confirm('interviewer', true)

    expect(transcript.getText()).toBe('面试官：请问你是？\n我：嗯嗯。')
  })

  it('does not freeze confirmed text on a non-final confirm', () => {
    const transcript = createDualTranscript()

    transcript.updatePartial('interviewer', '你好')
    transcript.confirm('interviewer', false)
    transcript.updatePartial('me', '嗯')
    transcript.updatePartial('interviewer', '你好，请问')

    expect(transcript.getLines()).toEqual([
      { speaker: 'interviewer', confirmedText: '你好', partialText: '，请问' },
      { speaker: 'me', confirmedText: '', partialText: '嗯' }
    ])
  })

  it('freezes confirmed text on a final confirm so later text sorts after other speakers', () => {
    const transcript = createDualTranscript()

    transcript.updatePartial('interviewer', '你好')
    transcript.confirm('interviewer', true)
    transcript.updatePartial('me', '嗯')
    transcript.updatePartial('interviewer', '你好，请问')

    expect(transcript.getLines()).toEqual([
      { speaker: 'interviewer', confirmedText: '你好', partialText: '' },
      { speaker: 'me', confirmedText: '', partialText: '嗯' },
      { speaker: 'interviewer', confirmedText: '', partialText: '，请问' }
    ])
  })

  it('freezes finalized partial text of a labeled speaker', () => {
    const transcript = createDualTranscript()

    transcript.updatePartial('interviewer', '没说完')
    transcript.updatePartial('me', '嗯')
    transcript.finalizePartial('interviewer')
    transcript.updatePartial('interviewer', '后续')

    expect(transcript.getLines()).toEqual([
      { speaker: 'interviewer', confirmedText: '没说完', partialText: '' },
      { speaker: 'me', confirmedText: '', partialText: '嗯' },
      { speaker: 'interviewer', confirmedText: '', partialText: '后续' }
    ])
  })

  it('returns only the text of the requested speaker from getSpeakerText', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '问题。')
    transcript.updatePartial('me', '回答')

    expect(transcript.getSpeakerText('interviewer')).toBe('问题。')
    expect(transcript.getSpeakerText('me')).toBe('回答')
    expect(transcript.getSpeakerText(null)).toBe('')
  })

  it('returns labeled text from consume and empties the transcript', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '问题？')
    transcript.confirm('interviewer', true)
    transcript.updatePartial('me', '嗯')

    expect(transcript.consume()).toBe('面试官：问题？\n我：嗯')
    expect(transcript.getText()).toBe('')
    expect(transcript.getLines()).toEqual([])
  })

  it('only returns text that comes after the consumed part once a speaker keeps talking', () => {
    const transcript = createDualTranscript()

    transcript.updatePartial('me', '嗯')
    expect(transcript.consume()).toBe('我：嗯')
    transcript.updatePartial('me', '嗯，我觉得')

    expect(transcript.getText()).toBe('我：，我觉得')
  })

  it('empties history and all speakers on clear', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '问题？')
    transcript.confirm('interviewer', true)
    transcript.updatePartial('me', '嗯')
    transcript.clear()

    expect(transcript.getText()).toBe('')
    expect(transcript.getLines()).toEqual([])
    expect(transcript.getSpeakerText('me')).toBe('')
  })
})

describe('SpeakerTranscript.consumeConfirmed', () => {
  it('keeps the unconfirmed partial of another speaker', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '问题？')
    transcript.confirm('interviewer', true)
    transcript.updatePartial('me', '嗯')

    expect(transcript.consumeConfirmed()).toBe('面试官：问题？')
    expect(transcript.getText()).toBe('我：嗯')
  })

  it('includes a partial that was confirmed without being frozen', () => {
    const transcript = createDualTranscript()

    transcript.updatePartial('interviewer', '请讲')
    transcript.confirm('interviewer', false)

    expect(transcript.consumeConfirmed()).toBe('面试官：请讲')
    expect(transcript.getText()).toBe('')
  })

  it('returns an empty string when only unconfirmed partials exist', () => {
    const transcript = createDualTranscript()

    transcript.updatePartial('me', '嗯')

    expect(transcript.consumeConfirmed()).toBe('')
    expect(transcript.getText()).toBe('我：嗯')
  })

  it('does not return the same confirmed text twice', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '问题？')
    transcript.confirm('interviewer', true)

    expect(transcript.consumeConfirmed()).toBe('面试官：问题？')
    expect(transcript.consumeConfirmed()).toBe('')
  })

  it('merges and orders confirmed text across speakers', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '第一句。')
    transcript.confirm('interviewer', true)
    transcript.finishSentence('interviewer', '第二句。')
    transcript.confirm('interviewer', true)
    transcript.finishSentence('me', '明白。')
    transcript.confirm('me', true)

    expect(transcript.consumeConfirmed()).toBe('面试官：第一句。第二句。\n我：明白。')
  })
})

describe('SpeakerTranscript.setSpeakers', () => {
  it('keeps earlier text when switching from a single source to two speakers', () => {
    const transcript = new SpeakerTranscript()

    transcript.updatePartial(null, '旧的内容')
    transcript.setSpeakers(['interviewer', 'me'])

    expect(transcript.getLines()).toEqual([
      { speaker: null, confirmedText: '旧的内容', partialText: '' }
    ])

    transcript.finishSentence('interviewer', '新问题。')
    transcript.confirm('interviewer', true)

    expect(transcript.getText()).toBe('旧的内容\n面试官：新问题。')
  })

  it('keeps the text when the same speakers are set again', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '新问题。')
    transcript.confirm('interviewer', true)
    transcript.setSpeakers(['interviewer', 'me'])

    expect(transcript.getText()).toBe('面试官：新问题。')
  })

  it('finalizes partial text when the same speakers are set again', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '新问题。')
    transcript.confirm('interviewer', true)
    transcript.updatePartial('interviewer', '还没说完')
    transcript.setSpeakers(['interviewer', 'me'])

    expect(transcript.getText()).toBe('面试官：新问题。还没说完')
    expect(transcript.getLines()).toEqual([
      { speaker: 'interviewer', confirmedText: '新问题。还没说完', partialText: '' }
    ])
  })

  it('finalizes partial text of the single source when it is set again', () => {
    const transcript = new SpeakerTranscript()

    transcript.updatePartial(null, '你好')
    transcript.setSpeakers([null])

    expect(transcript.getText()).toBe('你好')
    expect(transcript.getLines()).toEqual([
      { speaker: null, confirmedText: '你好', partialText: '' }
    ])
  })

  it('keeps labeled text when switching back to a single source', () => {
    const transcript = createDualTranscript()

    transcript.finishSentence('interviewer', '问题。')
    transcript.confirm('interviewer', true)
    transcript.updatePartial('me', '回答')
    transcript.setSpeakers([null])
    transcript.updatePartial(null, '补充')

    expect(transcript.getText()).toBe('面试官：问题。\n我：回答\n补充')
  })
})
