export class TranscriptionBuffer {
  private finalizedText = ''
  private currentPartial = ''
  private consumedPartialLength = 0

  updatePartial(text: string): void {
    // Providers differ on whether a new partial result contains the whole
    // utterance or only the latest utterance. Reset the cursor when the
    // result no longer carries the already-consumed prefix.
    const consumedPrefix = this.currentPartial.slice(0, this.consumedPartialLength)
    if (consumedPrefix && !text.startsWith(consumedPrefix)) {
      this.consumedPartialLength = 0
    }
    this.currentPartial = text
  }

  finishSentence(text: string): void {
    const consumedPrefix = this.currentPartial.slice(0, this.consumedPartialLength)
    const offset =
      consumedPrefix && !text.startsWith(consumedPrefix) ? 0 : this.consumedPartialLength
    this.finalizedText += text.slice(offset)
    this.currentPartial = ''
    this.consumedPartialLength = 0
  }

  finalizeCurrentPartial(): void {
    this.finalizedText += this.currentPartial.slice(this.consumedPartialLength)
    this.currentPartial = ''
    this.consumedPartialLength = 0
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

  clear(): void {
    this.finalizedText = ''
    this.consumedPartialLength = this.currentPartial.length
  }
}
