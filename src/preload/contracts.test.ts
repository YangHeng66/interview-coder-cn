import { describe, expect, it } from 'vitest'
import {
  getImageExtension,
  getImageMediaType,
  omitSecretSettings,
  pickSecretSettings
} from './contracts'

describe('secret settings helpers', () => {
  const settings = {
    apiKey: 'sk-vision',
    chatApiKey: 'sk-chat',
    dashscopeApiKey: '',
    volcengineAsrApiKey: 'volc',
    model: 'gpt-5-mini',
    opacity: 0.8
  }

  it('picks only string secret fields, keeping empty values so clearing a key persists', () => {
    expect(pickSecretSettings(settings)).toEqual({
      apiKey: 'sk-vision',
      chatApiKey: 'sk-chat',
      dashscopeApiKey: '',
      volcengineAsrApiKey: 'volc'
    })
    expect(pickSecretSettings({ apiKey: 42, model: 'x' })).toEqual({})
  })

  it('omits every secret field and keeps the rest', () => {
    expect(omitSecretSettings(settings)).toEqual({ model: 'gpt-5-mini', opacity: 0.8 })
  })
})

describe('screenshot image type detection', () => {
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).toString('base64')
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64')

  it('detects the format from base64 magic bytes', () => {
    expect(getImageMediaType(png)).toBe('image/png')
    expect(getImageMediaType(jpeg)).toBe('image/jpeg')
    expect(getImageExtension(png)).toBe('.png')
    expect(getImageExtension(jpeg)).toBe('.jpg')
  })
})
