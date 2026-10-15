import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ desktopCapturer: {}, screen: {} }))

const { getCaptureSize, pickCaptureSource } = await import('./take-screenshot')

describe('screenshot capture planning', () => {
  it('captures in physical pixels when within the size limit', () => {
    const display = { size: { width: 1280, height: 720 }, scaleFactor: 1.5 }
    expect(getCaptureSize(display, 2560)).toEqual({ width: 1920, height: 1080 })
  })

  it('scales the long edge down to the limit, keeping the aspect ratio', () => {
    const display = { size: { width: 2560, height: 1440 }, scaleFactor: 2 }
    expect(getCaptureSize(display, 2560)).toEqual({ width: 2560, height: 1440 })
    const portrait = { size: { width: 1080, height: 1920 }, scaleFactor: 2 }
    expect(getCaptureSize(portrait, 1920)).toEqual({ width: 1080, height: 1920 })
  })

  it('picks the source of the target display, falling back to the first source', () => {
    const sources = [{ display_id: '1' }, { display_id: '2' }]
    expect(pickCaptureSource(sources, 2)).toBe(sources[1])
    expect(pickCaptureSource([{ display_id: '' }], 2)).toEqual({ display_id: '' })
  })
})
