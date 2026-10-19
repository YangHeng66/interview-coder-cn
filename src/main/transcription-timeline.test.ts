import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { TimelineWriter } from './transcription-timeline'

let directory = ''

beforeEach(() => {
  directory = mkdtempSync(join(tmpdir(), 'timeline-'))
})

afterEach(() => {
  rmSync(directory, { recursive: true, force: true })
})

function readLines(path: string): Record<string, unknown>[] {
  return readFileSync(path, 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
}

describe('TimelineWriter', () => {
  it('writes one JSON line per event with time relative to the first event', () => {
    let now = 1_000
    const path = join(directory, 'nested', 'run.jsonl')
    const writer = new TimelineWriter(path, () => now)

    writer.log('asr', { channel: 'system', text: '你好' })
    now = 1_850
    writer.log('silence-final', { channel: 'system' })
    writer.close()

    expect(readLines(path)).toEqual([
      { t: 0, type: 'asr', channel: 'system', text: '你好' },
      { t: 850, type: 'silence-final', channel: 'system' }
    ])
  })

  it('does not create the file before the first event', () => {
    const path = join(directory, 'run.jsonl')
    const writer = new TimelineWriter(path)
    writer.close()
    expect(existsSync(path)).toBe(false)
  })

  it('stops writing after a failure instead of throwing into the caller', () => {
    // A directory cannot be opened as a file
    const writer = new TimelineWriter(directory)
    expect(() => writer.log('asr')).not.toThrow()
    expect(() => writer.log('asr')).not.toThrow()
    writer.close()
  })
})
