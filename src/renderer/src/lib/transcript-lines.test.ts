import { describe, expect, it } from 'vitest'
import { formatTranscriptionLines } from '../../../main/transcription-speakers'
import { parseSpeakerLines } from './transcript-lines'

describe('parseSpeakerLines', () => {
  it('reverses formatTranscriptionLines for labeled speakers', () => {
    const lines = [
      { speaker: 'me' as const, text: '共性还是啥？还是你再看看。' },
      { speaker: 'interviewer' as const, text: '问佢天几高，心中知比天更高。' }
    ]
    expect(parseSpeakerLines(formatTranscriptionLines(lines))).toEqual(lines)
  })

  it('keeps unlabeled lines mixed in with labeled ones', () => {
    const lines = [
      { speaker: null, text: '单声道时说的话' },
      { speaker: 'interviewer' as const, text: '请介绍一下你自己' }
    ]
    expect(parseSpeakerLines(formatTranscriptionLines(lines))).toEqual(lines)
  })

  it('returns null for single-source text', () => {
    expect(parseSpeakerLines(formatTranscriptionLines([{ speaker: null, text: '你好' }]))).toBe(
      null
    )
  })

  it('does not treat a label without the full-width colon as a speaker', () => {
    expect(parseSpeakerLines('我觉得可以')).toBe(null)
  })
})
