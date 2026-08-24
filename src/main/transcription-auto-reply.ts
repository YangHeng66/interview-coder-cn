export const AUTO_REPLY_MERGE_DELAY_MS = 800
export const AUTO_REPLY_MAX_BATCHES = 10
export const AUTO_REPLY_MAX_CHARACTERS = 20_000

type Timer = ReturnType<typeof setTimeout>

/**
 * Collects finalized speech into short conversational batches. The queue does
 * not know about Electron or AI streams; the owner decides when a batch can be
 * started and calls flush through the callback.
 */
export class TranscriptionAutoReplyQueue {
  private pendingText = ''
  private batches: string[] = []
  private mergeTimer: Timer | null = null

  constructor(private readonly onReady: () => void) {}

  canAccept(text: string): boolean {
    const normalized = text.trim()
    if (!normalized) return true

    const currentCharacters = this.batches.reduce((total, batch) => total + batch.length, 0)
    const separatorCharacters = this.pendingText ? 1 : 0
    const projectedCharacters =
      currentCharacters + this.pendingText.length + separatorCharacters + normalized.length
    if (projectedCharacters > AUTO_REPLY_MAX_CHARACTERS) return false

    const projectedBatches = this.batches.length + (this.pendingText ? 0 : 1)
    return projectedBatches <= AUTO_REPLY_MAX_BATCHES
  }

  add(text: string): boolean {
    const normalized = text.trim()
    if (!normalized) return true
    if (!this.canAccept(normalized)) return false

    this.pendingText = this.pendingText ? `${this.pendingText}\n${normalized}` : normalized
    this.scheduleFlush()
    return true
  }

  flush(): void {
    this.clearTimer()
    if (!this.pendingText) return

    this.batches.push(this.pendingText)
    this.pendingText = ''
    this.onReady()
  }

  peek(): string | null {
    return this.batches[0] ?? null
  }

  removeFirst(): string | null {
    return this.batches.shift() ?? null
  }

  clear(): void {
    this.clearTimer()
    this.pendingText = ''
    this.batches = []
  }

  get hasPendingWork(): boolean {
    return Boolean(this.pendingText || this.batches.length)
  }

  private scheduleFlush(): void {
    this.clearTimer()
    this.mergeTimer = setTimeout(() => {
      this.mergeTimer = null
      this.flush()
    }, AUTO_REPLY_MERGE_DELAY_MS)
  }

  private clearTimer(): void {
    if (!this.mergeTimer) return
    clearTimeout(this.mergeTimer)
    this.mergeTimer = null
  }
}
