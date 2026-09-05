import { ipcMain } from 'electron'
import { generateText, streamText } from 'ai'
import {
  createLanguageModel,
  getProviderOptions,
  supportsThinkingSwitch,
  type ConnectionSettings
} from './ai'
import appConfig from '../../app.config.json'
import {
  getApiEndpoint,
  normalizeThinkingLevelForModel,
  type ModelDiagnosticInput,
  type ModelDiagnosticResult
} from '../preload/contracts'

ipcMain.handle(
  'diagnoseModel',
  async (_event, input: ModelDiagnosticInput): Promise<ModelDiagnosticResult> => {
    const startedAt = performance.now()
    const result: ModelDiagnosticResult = {
      ok: false,
      endpoint: getApiEndpoint(input.apiBaseURL, input.apiProtocol),
      elapsedMs: 0,
      firstTextMs: null,
      status: null,
      text: '',
      error: null
    }
    const requestFetch: typeof fetch = async (url, init) => {
      const response = await fetch(url, init)
      result.status = response.status
      return response
    }
    const connection: ConnectionSettings = {
      ...input,
      thinkingLevel: normalizeThinkingLevelForModel(input.model, input.thinkingLevel),
      enableThinkingSwitch: supportsThinkingSwitch(input.apiBaseURL)
    }
    const model = createLanguageModel(connection, requestFetch)
    const options = {
      model,
      maxRetries: 0,
      maxOutputTokens:
        input.apiProtocol === 'messages' &&
        connection.thinkingLevel !== 'auto' &&
        connection.thinkingLevel !== 'none'
          ? appConfig.messagesMaxOutputTokens
          : appConfig.diagnostics.maxOutputTokens,
      providerOptions: getProviderOptions(connection),
      abortSignal: AbortSignal.timeout(appConfig.diagnostics.timeoutMs)
    }
    try {
      if (input.kind === 'stream') {
        const response = streamText({ ...options, prompt: appConfig.diagnostics.textPrompt })
        for await (const part of response.fullStream) {
          if (part.type === 'error') throw part.error
          if (part.type === 'text-delta') {
            if (result.firstTextMs === null)
              result.firstTextMs = Math.round(performance.now() - startedAt)
            result.text += part.text
          }
        }
      } else if (input.kind === 'image') {
        const response = await generateText({
          ...options,
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: appConfig.diagnostics.imagePrompt },
                { type: 'image', image: input.image! }
              ]
            }
          ]
        })
        result.text = response.text
      } else {
        result.text = (
          await generateText({ ...options, prompt: appConfig.diagnostics.textPrompt })
        ).text
      }
      result.ok = result.text.trim().length > 0
      if (!result.ok) result.error = '接口已响应，但没有返回文本'
    } catch (error) {
      result.error = error instanceof Error ? error.message : String(error)
    }
    result.elapsedMs = Math.round(performance.now() - startedAt)
    return result
  }
)
