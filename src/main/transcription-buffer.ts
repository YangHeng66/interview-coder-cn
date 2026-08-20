export class TranscriptionBuffer {
  private finalizedText = ''
  private currentPartial = ''
  private consumedPartialLength = 0

  updatePartial(text: string): void {
    this.currentPartial = text
  }

  finishSentence(text: string): void {
    this.finalizedText += text.slice(this.consumedPartialLength)
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
