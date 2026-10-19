import {
  TRANSCRIPTION_SPEAKER_LABELS,
  type TranscriptionChannel,
  type TranscriptionLine,
  type TranscriptionSpeaker
} from '../preload/contracts'
import { TranscriptionBuffer } from './transcription-buffer'

type Speaker = TranscriptionSpeaker | null

const SPEAKER_BY_CHANNEL: Record<TranscriptionChannel, TranscriptionSpeaker> = {
  system: 'interviewer',
  microphone: 'me'
}

export function speakerForChannel(channel: TranscriptionChannel | null): Speaker {
  return channel ? SPEAKER_BY_CHANNEL[channel] : null
}

/** Unlabeled text keeps the single-source format: plain concatenation */
export function formatTranscriptionLines(lines: { speaker: Speaker; text: string }[]): string {
  const filled = lines.filter((line) => line.text)
  if (filled.every((line) => line.speaker === null)) {
    return filled.map((line) => line.text).join('')
  }
  return filled
    .map((line) =>
      line.speaker ? `${TRANSCRIPTION_SPEAKER_LABELS[line.speaker]}：${line.text}` : line.text
    )
    .join('\n')
}

type Channel = { buffer: TranscriptionBuffer; order: number | null }
type HistoryEntry = { speaker: Speaker; text: string; order: number }

function createChannel(): Channel {
  return { buffer: new TranscriptionBuffer(), order: null }
}

/**
 * One TranscriptionBuffer per speaker, ordered by when each utterance started.
 * A single source (speaker null) behaves exactly like one TranscriptionBuffer;
 * labeled speakers freeze final text into history, so whatever either speaker
 * says next sorts after it.
 */
export class SpeakerTranscript {
  private history: HistoryEntry[] = []
  private channels = new Map<Speaker, Channel>([[null, createChannel()]])
  private nextOrder = 0

  /** Earlier text is kept: a new capture may use different sources than the last one */
  setSpeakers(speakers: Speaker[]): void {
    for (const speaker of this.channels.keys()) this.finalizePartial(speaker)
    const current = [...this.channels.keys()]
    if (
      current.length === speakers.length &&
      current.every((speaker, index) => speaker === speakers[index])
    ) {
      return
    }

    for (const [speaker, channel] of this.channels) {
      const order = channel.order
      const text = channel.buffer.consume()
      if (text && order !== null) this.history.push({ speaker, text, order })
    }
    this.channels = new Map(speakers.map((speaker) => [speaker, createChannel()]))
  }

  updatePartial(speaker: Speaker, text: string): void {
    this.update(speaker, (buffer) => buffer.updatePartial(text))
  }

  finishSentence(speaker: Speaker, text: string): void {
    this.update(speaker, (buffer) => buffer.finishSentence(text))
  }

  confirm(speaker: Speaker, final: boolean): void {
    this.update(speaker, (buffer) => buffer.confirmPartial())
    if (final && speaker !== null) this.freeze(speaker)
  }

  finalizePartial(speaker: Speaker): void {
    this.update(speaker, (buffer) => buffer.finalizeCurrentPartial())
    if (speaker !== null) this.freeze(speaker)
  }

  getSpeakerText(speaker: Speaker): string {
    return this.channels.get(speaker)?.buffer.getText() ?? ''
  }

  getLines(): TranscriptionLine[] {
    return this.collectLines(true)
  }

  getText(): string {
    return formatTranscriptionLines(
      this.collectLines(true).map((line) => ({
        speaker: line.speaker,
        text: line.confirmedText + line.partialText
      }))
    )
  }

  consume(): string {
    const text = this.getText()
    this.history = []
    this.forEachChannel((buffer) => buffer.consume())
    return text
  }

  consumeConfirmed(): string {
    const text = formatTranscriptionLines(
      this.collectLines(false).map((line) => ({ speaker: line.speaker, text: line.confirmedText }))
    )
    this.history = []
    this.forEachChannel((buffer) => buffer.consumeConfirmed())
    return text
  }

  clear(): void {
    this.history = []
    this.forEachChannel((buffer) => buffer.clear())
  }

  private update(speaker: Speaker, mutate: (buffer: TranscriptionBuffer) => void): void {
    const channel = this.channels.get(speaker)
    if (!channel) return
    mutate(channel.buffer)
    this.refreshOrder(channel)
  }

  private forEachChannel(action: (buffer: TranscriptionBuffer) => void): void {
    for (const channel of this.channels.values()) {
      action(channel.buffer)
      this.refreshOrder(channel)
    }
  }

  /** An utterance gets its position when the channel goes from empty to non-empty */
  private refreshOrder(channel: Channel): void {
    if (!channel.buffer.getText()) channel.order = null
    else if (channel.order === null) channel.order = this.nextOrder++
  }

  private freeze(speaker: TranscriptionSpeaker): void {
    const channel = this.channels.get(speaker)
    if (!channel) return
    const order = channel.order
    const text = channel.buffer.consumeConfirmed()
    if (text && order !== null) this.history.push({ speaker, text, order })
    this.refreshOrder(channel)
  }

  private collectLines(includePartial: boolean): TranscriptionLine[] {
    const live = [...this.channels].flatMap(([speaker, channel]) => {
      if (channel.order === null) return []
      const { confirmedText, partialText } = channel.buffer.getSegments()
      return [
        {
          speaker,
          text: confirmedText,
          partialText: includePartial ? partialText : '',
          order: channel.order
        }
      ]
    })
    // Stable sort keeps history ahead of live text that shares its order
    const entries = [...this.history.map((entry) => ({ ...entry, partialText: '' })), ...live].sort(
      (a, b) => a.order - b.order
    )

    const lines: TranscriptionLine[] = []
    for (const { speaker, text, partialText } of entries) {
      if (!text && !partialText) continue
      const last = lines.at(-1)
      if (last && last.speaker === speaker && !last.partialText) {
        last.confirmedText += text
        last.partialText = partialText
      } else {
        lines.push({ speaker, confirmedText: text, partialText })
      }
    }
    return lines
  }
}
