import { app } from 'electron'
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs'
import { dirname, join } from 'node:path'
import appConfig from '../../app.config.json'

/**
 * Appends events as JSON lines. Writes are synchronous so a crash mid-interview
 * still leaves every event before it on disk.
 */
export class TimelineWriter {
  private fd: number | null = null
  private failed = false
  private startedAt = 0

  constructor(
    private readonly path: string,
    private readonly now: () => number = Date.now
  ) {}

  log(type: string, data: Record<string, unknown> = {}): void {
    if (this.failed) return
    try {
      if (this.fd === null) {
        mkdirSync(dirname(this.path), { recursive: true })
        this.fd = openSync(this.path, 'a')
        this.startedAt = this.now()
      }
      writeSync(this.fd, `${JSON.stringify({ t: this.now() - this.startedAt, type, ...data })}\n`)
    } catch (error) {
      // Logging must never break transcription; give up for the rest of the launch
      this.failed = true
      console.error('Transcription timeline disabled:', error)
    }
  }

  close(): void {
    if (this.fd === null) return
    closeSync(this.fd)
    this.fd = null
  }
}

let writer: TimelineWriter | null = null

/** Raw event timeline for tuning sentence / turn thresholds; one file per app launch */
export function logTimeline(type: string, data?: Record<string, unknown>): void {
  if (!appConfig.transcription.timelineLog) return
  if (!writer) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const path = join(app.getPath('userData'), 'logs', 'transcription-timeline', `${stamp}.jsonl`)
    console.log(`[Transcription] timeline log: ${path}`)
    writer = new TimelineWriter(path)
    writer.log('timeline-start', { at: new Date().toISOString(), config: appConfig.transcription })
  }
  writer.log(type, data)
}
