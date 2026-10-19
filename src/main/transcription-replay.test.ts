import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fixture from './__fixtures__/volcengine-mock-interview.json'

const handlers = vi.hoisted(() => new Map<string, (...args: unknown[]) => unknown>())
const sockets = vi.hoisted(() => [] as { emit: (event: string, ...args: unknown[]) => void }[])

vi.mock('electron', () => ({
  ipcMain: {
    handle: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler),
    on: (channel: string, handler: (...args: unknown[]) => unknown) =>
      handlers.set(channel, handler)
  }
}))

vi.mock('ws', async () => {
  const { EventEmitter } = await import('node:events')
  class FakeSocket extends EventEmitter {
    static CONNECTING = 0
    static OPEN = 1
    readyState = 1
    constructor() {
      super()
      sockets.push(this)
    }
    send(_data: unknown, callback?: (error?: Error) => void) {
      callback?.()
    }
    close() {
      this.readyState = 3
    }
    terminate() {
      this.readyState = 3
    }
  }
  return { default: FakeSocket }
})

vi.mock('./transcription-timeline', () => ({ logTimeline: () => {} }))

type Utterance = { text: string; definite: boolean }
type Transcription = typeof import('./transcription')

const VOLCENGINE_CONFIG = {
  provider: 'volcengine',
  apiKey: 'test-key',
  model: 'bigmodel',
  resourceId: 'volc.bigasr.sauc.duration',
  wsUrl: 'wss://asr.example.test/api'
}

/** Server response frame: full-response type, gzip JSON, final flag on the last packet */
function volcengineFrame(utterances: Utterance[], final: boolean): Buffer {
  const payload = {
    result: {
      text: utterances.map((utterance) => utterance.text).join(''),
      utterances
    }
  }
  const body = gzipSync(Buffer.from(JSON.stringify(payload)))
  const size = Buffer.alloc(4)
  size.writeUInt32BE(body.length)
  return Buffer.concat([Buffer.from([0x11, 0x90 | (final ? 0x02 : 0x00), 0x11, 0x00]), size, body])
}

/** The recording stores only utterances that changed; rebuild the full list per frame */
function recordedFrames(): { t: number; final: boolean; utterances: Utterance[] }[] {
  const known: Utterance[] = []
  return fixture.frames.map((frame) => {
    for (const [index, utterance] of Object.entries(frame.changed)) {
      known[Number(index)] = utterance
    }
    return { t: frame.t, final: frame.final, utterances: known.slice(0, frame.count) }
  })
}

const finalTranscript = recordedFrames()
  .at(-1)!
  .utterances.map((utterance) => utterance.text)
  .join('')

function normalize(text: string): string {
  return text.replace(/[\s\p{P}\p{S}]/gu, '').toLowerCase()
}

function count(text: string, phrase: string): number {
  return text.split(phrase).length - 1
}

async function loadTranscription(): Promise<Transcription> {
  vi.resetModules()
  handlers.clear()
  sockets.length = 0
  return import('./transcription')
}

/** Plays the recorded frames through the real provider handler on the recorded timeline */
function replay(): void {
  handlers.get('start-transcription')!({}, VOLCENGINE_CONFIG, 'replay-run', undefined)
  const socket = sockets.at(-1)!
  socket.emit('open')
  let now = 0
  for (const frame of recordedFrames()) {
    vi.advanceTimersByTime(frame.t - now)
    now = frame.t
    socket.emit('message', volcengineFrame(frame.utterances, frame.final))
  }
  vi.advanceTimersByTime(10_000)
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('Volcengine replay of the scripted mock interview', () => {
  it('hands every spoken character to auto replies once', async () => {
    const transcription = await loadTranscription()
    const consumed: string[] = []
    transcription.subscribeTranscription((event) => {
      if (event.isPartial) return
      const text = transcription.consumeConfirmedTranscriptionText()
      if (text.trim()) consumed.push(text)
    })

    replay()

    const sent = consumed.join('')
    // Revisions (e.g. "BO3" corrected to "Vue 3") may shift a few characters, never whole sentences
    expect(normalize(sent).length).toBeGreaterThan(normalize(finalTranscript).length * 0.95)
    expect(normalize(sent).length).toBeLessThan(normalize(finalTranscript).length * 1.05)
    expect(count(sent, '欢迎参加今天的面试')).toBe(1)
    expect(count(sent, '有什么区别')).toBe(1)
    expect(count(sent, '怎么减少回流')).toBe(1)
    expect(count(sent, '好在哪里')).toBe(1)
    expect(count(sent, '优化方案')).toBe(1)
  })
})
