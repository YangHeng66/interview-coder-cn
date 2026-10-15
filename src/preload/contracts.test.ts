import { describe, expect, it } from 'vitest'
import { omitSecretSettings, pickSecretSettings } from './contracts'

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
