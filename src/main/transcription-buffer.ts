const NON_CONTENT = /[\s\p{P}\p{S}]/u

/** Lowercased characters without punctuation or spaces, each with the raw index just after it */
function indexContent(text: string): { content: string; ends: number[] } {
  let content = ''
  const ends: number[] = []
  let index = 0
  for (const char of text) {
    index += char.length
    if (NON_CONTENT.test(char)) continue
    content += char.toLowerCase()
    ends.push(index)
  }
  return { content, ends }
}

/**
 * The prefix of `content` with the smallest edit distance to `target`; ties go
 * to the prefix closest to `target` in length.
 */
function closestPrefix(target: string, content: string): { length: number; distance: number } {
  let row = Array.from({ length: content.length + 1 }, (_, index) => index)
  for (let i = 1; i <= target.length; i++) {
    const next = [i]
    for (let j = 1; j <= content.length; j++) {
      const substitution = row[j - 1] + (target[i - 1] === content[j - 1] ? 0 : 1)
      next[j] = Math.min(row[j] + 1, next[j - 1] + 1, substitution)
    }
    row = next
  }
  let length = 0
  for (let j = 1; j <= content.length; j++) {
    const closer = Math.abs(j - target.length) < Math.abs(length - target.length)
    if (row[j] < row[length] || (row[j] === row[length] && closer)) length = j
  }
  return { length, distance: row[length] }
}

/**
 * Where `consumed` ends inside `text`, a later version of the partial it was
 * taken from. Providers revise partials (punctuation, number formatting,
 * misheard words), so the match ignores punctuation and case and follows
 * edits by alignment. Returns 0 when `text` reads like a different utterance.
 */
export function locateConsumedEnd(consumed: string, text: string): number {
  if (!consumed) return 0
  if (text.startsWith(consumed)) return consumed.length

  const target = indexContent(consumed).content
  if (!target) return 0
  const { content, ends } = indexContent(text)
  const { length, distance } = closestPrefix(target, content)
  // A revision keeps most of what was said; a third or more changed is new speech
  if (distance * 3 >= target.length) return 0
  return length === 0 ? 0 : ends[length - 1]
}

export class TranscriptionBuffer {
  private finalizedText = ''
  private currentPartial = ''
  private consumedPartialLength = 0
  private confirmedPartialLength = 0

  updatePartial(text: string): void {
    this.consumedPartialLength = this.locate(this.consumedPartialLength, text)
    this.confirmedPartialLength = this.locate(this.confirmedPartialLength, text)
    this.currentPartial = text
  }

  finishSentence(text: string): void {
    this.finalizedText += text.slice(this.locate(this.consumedPartialLength, text))
    this.currentPartial = ''
    this.consumedPartialLength = 0
    this.confirmedPartialLength = 0
  }

  finalizeCurrentPartial(): void {
    this.finalizedText += this.currentPartial.slice(this.consumedPartialLength)
    this.currentPartial = ''
    this.consumedPartialLength = 0
    this.confirmedPartialLength = 0
  }

  confirmPartial(): void {
    this.confirmedPartialLength = this.currentPartial.length
  }

  getSegments(): { confirmedText: string; partialText: string } {
    const boundary = Math.max(this.consumedPartialLength, this.confirmedPartialLength)
    return {
      confirmedText:
        this.finalizedText + this.currentPartial.slice(this.consumedPartialLength, boundary),
      partialText: this.currentPartial.slice(boundary)
    }
  }

  getText(): string {
    return this.finalizedText + this.currentPartial.slice(this.consumedPartialLength)
  }

  consume(): string {
    const text = this.getText()
    this.finalizedText = ''
    this.consumedPartialLength = this.currentPartial.length
    return text
  }

  consumeConfirmed(): string {
    const { confirmedText } = this.getSegments()
    this.finalizedText = ''
    this.consumedPartialLength = Math.max(this.consumedPartialLength, this.confirmedPartialLength)
    return confirmedText
  }

  clear(): void {
    this.finalizedText = ''
    this.consumedPartialLength = this.currentPartial.length
  }

  /** Moves a cursor in the current partial to the matching place in its revision */
  private locate(cursor: number, text: string): number {
    return locateConsumedEnd(this.currentPartial.slice(0, cursor), text)
  }
}
