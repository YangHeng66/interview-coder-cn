import { describe, expect, it, vi } from 'vitest'
import { AUTO_REPLY_MAX_BATCHES, TranscriptionAutoReplyQueue } from './transcription-auto-reply'

describe('TranscriptionAutoReplyQueue', () => {
  it('merges speech received within the debounce window', () => {
    vi.useFakeTimers()
    const onReady = vi.fn()
    const queue = new TranscriptionAutoReplyQueue(onReady)

    expect(queue.add('第一句')).toBe(true)
    vi.advanceTimersByTime(400)
    expect(queue.add('第二句')).toBe(true)
    vi.advanceTimersByTime(799)
    expect(onReady).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(onReady).toHaveBeenCalledTimes(1)
    expect(queue.peek()).toBe('第一句\n第二句')

    queue.removeFirst()
    queue.clear()
    vi.useRealTimers()
  })

  it('keeps batches ordered while the consumer is busy', () => {
    vi.useFakeTimers()
    const queue = new TranscriptionAutoReplyQueue(vi.fn())

    queue.add('先问的问题')
    vi.advanceTimersByTime(800)
    queue.add('后问的问题')
    vi.advanceTimersByTime(800)

    expect(queue.removeFirst()).toBe('先问的问题')
    expect(queue.removeFirst()).toBe('后问的问题')
    expect(queue.removeFirst()).toBeNull()

    queue.clear()
    vi.useRealTimers()
  })

  it('protects the queue from unbounded batches', () => {
    const queue = new TranscriptionAutoReplyQueue(vi.fn())
    for (let index = 0; index < AUTO_REPLY_MAX_BATCHES; index += 1) {
      expect(queue.add(`问题 ${index}`)).toBe(true)
      queue.flush()
    }

    expect(queue.add('超出容量的问题')).toBe(false)
  })

  it('cancels a pending merge when the conversation is cleared', () => {
    vi.useFakeTimers()
    const onReady = vi.fn()
    const queue = new TranscriptionAutoReplyQueue(onReady)

    queue.add('不会发送的问题')
    queue.clear()
    vi.advanceTimersByTime(800)

    expect(onReady).not.toHaveBeenCalled()
    expect(queue.peek()).toBeNull()
    vi.useRealTimers()
  })
})
