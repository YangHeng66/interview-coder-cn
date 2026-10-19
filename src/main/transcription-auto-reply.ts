import appConfig from '../../app.config.json'
import {
  TRANSCRIPTION_SPEAKER_LABELS,
  type ConversationPersona,
  type TranscriptionSpeaker
} from '../preload/contracts'
import { joinTranscriptionText } from './transcription-speakers'

export const AUTO_REPLY_TURN_GAP_MS = appConfig.transcription.autoReplyTurnGapMs
export const AUTO_REPLY_MAX_CHARACTERS = appConfig.transcription.autoReplyMaxCharacters

type Timer = ReturnType<typeof setTimeout>

const SPEAKER_LABELS = new RegExp(
  `^(?:${Object.values(TRANSCRIPTION_SPEAKER_LABELS).join('|')})：`,
  'gm'
)
const NON_CONTENT = /[\s\p{P}\p{S}]/gu
/** Punctuation the provider adds to the end of the last turn arrives at the start of the next */
const LEADING_PUNCTUATION = new RegExp(
  `^((?:${Object.values(TRANSCRIPTION_SPEAKER_LABELS).join('|')})：)?[\\s\\p{P}]+`,
  'u'
)
/** Content characters a turn must gain before it is worth interrupting the answer again */
const MIN_RESEND_GROWTH = 2
const FILLERS =
  /^(?:嗯|啊|哦|噢|呃|额|唔|哈|对|好|是|行|ok|okay|好的|是的|对的|可以|明白|了解|没错|没问题)+$/

/** What was said, without speaker labels, punctuation, spaces or case */
function spokenContent(text: string): string {
  return text.replace(SPEAKER_LABELS, '').replace(NON_CONTENT, '').toLowerCase()
}

/** Punctuation and acknowledgements such as "嗯" or "好的" are not worth an answer */
export function isMeaningfulSpeech(text: string): boolean {
  const content = spokenContent(text)
  return content.length > 0 && !FILLERS.test(content)
}

/** My speech answers the interviewer, except in a mock interview where my answers are the input */
export function shouldTriggerAutoReply(
  speaker: TranscriptionSpeaker | null | undefined,
  persona: ConversationPersona | undefined
): boolean {
  return speaker !== 'me' || persona === 'mock-interview'
}

/**
 * What was said since the speaker last went quiet for the turn gap. Every
 * request carries the whole turn, so speech after a pause resends the complete
 * question and replaces the answer to its first half instead of answering a
 * fragment. The owner decides when a request can go out.
 */
export class AutoReplyTurn {
  private text = ''
  private sentContent = ''
  private sentRequestId: string | null = null
  private gapTimer: Timer | null = null
  /** Last change in what is being said; null until speech is seen in this turn */
  private lastSpeechAt: number | null = null

  /** Speech still coming in keeps the turn open */
  touch(): void {
    this.lastSpeechAt = Date.now()
    if (this.text) this.scheduleGap(this.lastSpeechAt)
  }

  append(fragment: string): void {
    if (!fragment.trim()) return
    if (this.text.length + fragment.length > AUTO_REPLY_MAX_CHARACTERS) this.clear()
    this.text = this.text
      ? joinTranscriptionText(this.text, fragment)
      : fragment.replace(LEADING_PUNCTUATION, '$1')
    // A silence fallback arrives well after the speech it finalizes; the gap counts from the speech
    this.scheduleGap(this.lastSpeechAt ?? Date.now())
  }

  /** The whole turn, when it says something new worth answering */
  get pendingRequest(): string | null {
    if (!isMeaningfulSpeech(this.text)) return null
    // Turns only grow, so the growth since the last request is the new content
    const growth = spokenContent(this.text).length - this.sentContent.length
    return growth >= (this.sentContent ? MIN_RESEND_GROWTH : 1) ? this.text.trim() : null
  }

  /** The last request that carried this turn; a resend replaces it on screen */
  get requestId(): string | null {
    return this.sentRequestId
  }

  markSent(requestId: string | null = null): void {
    this.sentContent = spokenContent(this.text)
    this.sentRequestId = requestId
  }

  clear(): void {
    if (this.gapTimer) clearTimeout(this.gapTimer)
    this.gapTimer = null
    this.text = ''
    this.sentContent = ''
    this.sentRequestId = null
    this.lastSpeechAt = null
  }

  private scheduleGap(from: number): void {
    if (this.gapTimer) clearTimeout(this.gapTimer)
    this.gapTimer = setTimeout(
      () => {
        this.gapTimer = null
        // A turn waiting for a busy stream stays open until it goes out
        if (this.pendingRequest) this.scheduleGap(Date.now())
        else this.clear()
      },
      Math.max(0, from + AUTO_REPLY_TURN_GAP_MS - Date.now())
    )
  }
}
