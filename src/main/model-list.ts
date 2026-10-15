import { ipcMain } from 'electron'
import appConfig from '../../app.config.json'
import type { ModelListInput, ModelListResult } from '../preload/contracts'

export function getModelListRequest(input: ModelListInput): {
  url: string
  headers: Record<string, string>
} {
  // The Base URL already carries the version segment (…/v1), same as the chat endpoints
  const base = input.apiBaseURL.trim().replace(/\/+$/, '')
  const apiKey = input.apiKey.trim()
  if (input.apiProtocol === 'messages') {
    return {
      url: `${base}/models?limit=1000`,
      // Anthropic-compatible relays differ on the auth header, so send both
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        Authorization: `Bearer ${apiKey}`
      }
    }
  }
  return { url: `${base}/models`, headers: { Authorization: `Bearer ${apiKey}` } }
}

/** OpenAI and Anthropic both answer `{ data: [{ id }] }` */
export function parseModelList(body: unknown): string[] {
  const data = (body as { data?: unknown } | null)?.data
  if (!Array.isArray(data)) throw new Error('返回内容不是模型列表')
  const ids = data
    .map((item) => (item as { id?: unknown })?.id)
    .filter((id): id is string => typeof id === 'string' && Boolean(id.trim()))
  return [...new Set(ids)].sort((a, b) => a.localeCompare(b))
}

export function describeModelListError(status: number): string {
  if (status === 401 || status === 403) return 'API Key 无效或无权访问模型列表'
  if (status === 404) return '该服务未提供模型列表接口，请手动输入模型名'
  return `获取模型列表失败（HTTP ${status}）`
}

ipcMain.handle('listModels', async (_event, input: ModelListInput): Promise<ModelListResult> => {
  if (!input?.apiBaseURL?.trim() || !input.apiKey?.trim()) {
    return { ok: false, error: '请先填写 API Base URL 和 API Key' }
  }
  const { url, headers } = getModelListRequest(input)
  try {
    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(appConfig.modelList.timeoutMs)
    })
    if (!response.ok) return { ok: false, error: describeModelListError(response.status) }
    const models = parseModelList(await response.json())
    if (!models.length) return { ok: false, error: '服务返回的模型列表为空' }
    return { ok: true, models }
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      return { ok: false, error: '获取模型列表超时，请检查 Base URL 和网络' }
    }
    if (error instanceof SyntaxError) return { ok: false, error: '返回内容不是模型列表' }
    return {
      ok: false,
      error: `获取模型列表失败：${error instanceof Error ? error.message : String(error)}`
    }
  }
})
