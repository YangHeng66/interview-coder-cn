import { TRANSCRIPTION_SPEAKER_LABELS, type TranscriptionSpeaker } from '../../../preload/contracts'

export type SpeakerLine = { speaker: TranscriptionSpeaker | null; text: string }

const SPEAKER_PREFIXES = (
  Object.entries(TRANSCRIPTION_SPEAKER_LABELS) as [TranscriptionSpeaker, string][]
).map(([speaker, label]) => ({ speaker, prefix: `${label}：` }))

/** Inverse of `formatTranscriptionLines` (main); null when no line carries a speaker label */
export function parseSpeakerLines(content: string): SpeakerLine[] | null {
  const lines = content.split('\n').map((line): SpeakerLine => {
    const match = SPEAKER_PREFIXES.find(({ prefix }) => line.startsWith(prefix))
    return match
      ? { speaker: match.speaker, text: line.slice(match.prefix.length) }
      : { speaker: null, text: line }
  })
  return lines.some((line) => line.speaker) ? lines : null
}
