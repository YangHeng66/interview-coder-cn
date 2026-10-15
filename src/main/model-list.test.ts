import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const { describeModelListError, getModelListRequest, parseModelList } = await import('./model-list')

describe('getModelListRequest', () => {
  it('appends /models to an OpenAI-compatible base URL with a bearer token', () => {
    expect(
      getModelListRequest({
        apiProtocol: 'chat-completions',
        apiBaseURL: ' https://api.siliconflow.cn/v1/ ',
        apiKey: ' sk-1 '
      })
    ).toEqual({
      url: 'https://api.siliconflow.cn/v1/models',
      headers: { Authorization: 'Bearer sk-1' }
    })
  })

  it('uses Anthropic headers and a large page for the Messages protocol', () => {
    const request = getModelListRequest({
      apiProtocol: 'messages',
      apiBaseURL: 'https://api.anthropic.com/v1',
      apiKey: 'sk-ant'
    })
    expect(request.url).toBe('https://api.anthropic.com/v1/models?limit=1000')
    expect(request.headers).toMatchObject({
      'x-api-key': 'sk-ant',
      'anthropic-version': '2023-06-01'
    })
  })
})

describe('parseModelList', () => {
  it('returns sorted unique ids from a data array', () => {
    expect(
      parseModelList({ data: [{ id: 'b' }, { id: 'a' }, { id: 'b' }, { id: '' }, { name: 'x' }] })
    ).toEqual(['a', 'b'])
  })

  it('rejects responses without a data array', () => {
    expect(() => parseModelList({ error: 'nope' })).toThrow()
    expect(() => parseModelList('html')).toThrow()
  })
})

describe('describeModelListError', () => {
  it('maps HTTP statuses to actionable messages', () => {
    expect(describeModelListError(401)).toContain('API Key')
    expect(describeModelListError(404)).toContain('手动输入')
    expect(describeModelListError(500)).toContain('HTTP 500')
  })
})
