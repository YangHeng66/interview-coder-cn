import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: {}, safeStorage: {} }))

const { decodeSecrets, encodeSecrets } = await import('./secrets')

const reversingCipher = {
  isAvailable: () => true,
  encrypt: (text: string) => Buffer.from([...text].reverse().join(''), 'utf8'),
  decrypt: (data: Buffer) => [...data.toString('utf8')].reverse().join('')
}

const unavailableCipher = {
  isAvailable: () => false,
  encrypt: () => {
    throw new Error('encryption unavailable')
  },
  decrypt: () => {
    throw new Error('encryption unavailable')
  }
}

describe('secret file encoding', () => {
  it('round-trips values through the cipher without storing plaintext', () => {
    const file = encodeSecrets({ apiKey: 'sk-vision', chatApiKey: '' }, reversingCipher)
    expect(file.encrypted).toBe(true)
    expect(JSON.stringify(file)).not.toContain('sk-vision')
    expect(decodeSecrets(file, reversingCipher)).toEqual({ apiKey: 'sk-vision', chatApiKey: '' })
  })

  it('falls back to plaintext when the OS cannot encrypt', () => {
    const file = encodeSecrets({ apiKey: 'sk-vision' }, unavailableCipher)
    expect(file.encrypted).toBe(false)
    expect(decodeSecrets(file, unavailableCipher)).toEqual({ apiKey: 'sk-vision' })
  })

  it('ignores unknown keys in a stored file', () => {
    const file = encodeSecrets({ apiKey: 'a' }, unavailableCipher)
    const tampered = { ...file, values: { ...file.values, model: 'x' } }
    expect(decodeSecrets(tampered, unavailableCipher)).toEqual({ apiKey: 'a' })
  })
})
