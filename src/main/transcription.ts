import { ipcMain } from 'electron'
import { gunzipSync, gzipSync } from 'node:zlib'
import WebSocket from 'ws'
import {
  getTranscriptionConfigError,
  type TranscriptionConfig,
  type TranscriptionStatus
} from '../preload/contracts'
import { TranscriptionBuffer } from './transcription-buffer'
import appConfig from '../../app.config.json'

const config = appConfig.transcription
const FINISH_TIMEOUT_MS = config.finishTimeoutMs
const PARTIAL_IDLE_TIMEOUT_MS = config.partialIdleMs
const VOLCENGINE_FULL_REQUEST_HEADER = Buffer.from([0x11, 0x10, 0x11, 0x00])
const VOLCENGINE_AUDIO_REQUEST_HEADER = Buffer.from([0x11, 0x20, 0x01, 0x00])
const VOLCENGINE_FINAL_AUDIO_REQUEST_HEADER = Buffer.from([0x11, 0x22, 0x01, 0x00])

type TranscriptionSession = {
  id: string
  config: TranscriptionConfig
  socket: WebSocket
  ready: boolean
  taskStarted: boolean
  finishing: boolean
  stoppedNotified: boolean
  pendingAudio: Buffer | null
  finishTimer: NodeJS.Timeout | null
  partialTimer: NodeJS.Timeout | null
  partialSnapshot: string
  startupAudio: Buffer[]
  startupBytes: number
  connectionTimer: NodeJS.Timeout | null
  completion: Promise<void>
  complete: () => void
}

export type TranscriptionEventReason = 'provider' | 'silence' | 'stopped'

export type TranscriptionEvent = {
  text: string
  isPartial: boolean
  reason?: TranscriptionEventReason
}

type VolcengineFrame = {
  messageType: number
  isFinal: boolean
  errorCode: number | null
  payload: unknown
  payloadText: string
}

let activeSession: TranscriptionSession | null = null
let isTranscribing = false
const transcriptionBuffer = new TranscriptionBuffer()
const transcriptionListeners = new Set<(event: TranscriptionEvent) => void>()

export function subscribeTranscription(listener: (event: TranscriptionEvent) => void): () => void {
  transcriptionListeners.add(listener)
  return () => transcriptionListeners.delete(listener)
}

function sendToRenderer(channel: string, ...args: unknown[]) {
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function publishTranscription(isPartial: boolean, reason?: TranscriptionEventReason): void {
  if (!isPartial) transcriptionBuffer.confirmPartial()
  const event: TranscriptionEvent = {
    text: getTranscriptionText(),
    isPartial,
    reason
  }
  sendToRenderer('transcription-text', {
    text: event.text,
    isPartial: event.isPartial,
    ...transcriptionBuffer.getSegments()
  })
  transcriptionListeners.forEach((listener) => {
    try {
      listener(event)
    } catch (error) {
      console.error('Transcription listener failed:', error)
    }
  })
}

function clearPartialTimer(session: TranscriptionSession): void {
  if (!session.partialTimer) return
  clearTimeout(session.partialTimer)
  session.partialTimer = null
}

function schedulePartialFinalization(session: TranscriptionSession): void {
  const snapshot = getTranscriptionText()
  if (session.partialTimer && session.partialSnapshot === snapshot) return
  clearPartialTimer(session)
  if (!snapshot.trim()) return
  session.partialSnapshot = snapshot

  session.partialTimer = setTimeout(() => {
    session.partialTimer = null
    if (activeSession !== session || session.finishing || getTranscriptionText() !== snapshot) {
      return
    }
    publishTranscription(false, 'silence')
  }, PARTIAL_IDLE_TIMEOUT_MS)
}

function publishStatus(session: TranscriptionSession, status: TranscriptionStatus): void {
  sendToRenderer('transcription-status', { sessionId: session.id, status })
}

function markReady(session: TranscriptionSession): void {
  session.taskStarted = true
  if (session.connectionTimer) clearTimeout(session.connectionTimer)
  session.connectionTimer = null
  publishStatus(session, 'listening')
  for (const audio of session.startupAudio) sendAudio(session, audio)
  session.startupAudio = []
  session.startupBytes = 0
}

function notifyStopped(session: TranscriptionSession): void {
  if (session.stoppedNotified) return
  session.stoppedNotified = true
  sendToRenderer('transcription-stopped')
}

function disposeSocket(socket: WebSocket): void {
  socket.removeAllListeners()
  socket.on('error', () => {})
  try {
    if (socket.readyState === WebSocket.OPEN) {
      socket.close()
    } else if (socket.readyState === WebSocket.CONNECTING) {
      socket.terminate()
    }
  } catch {
    // The socket may already be closing after a provider-side failure.
  }
}

function finishSession(session: TranscriptionSession, notify = true): void {
  if (activeSession !== session) return

  if (session.finishTimer) {
    clearTimeout(session.finishTimer)
    session.finishTimer = null
  }
  clearPartialTimer(session)
  if (session.connectionTimer) clearTimeout(session.connectionTimer)
  session.startupAudio = []
  const shouldPublishFinal = session.finishing
  transcriptionBuffer.finalizeCurrentPartial()
  if (shouldPublishFinal && getTranscriptionText().trim()) {
    publishTranscription(false, 'stopped')
  }
  activeSession = null
  isTranscribing = false
  disposeSocket(session.socket)
  if (notify) publishStatus(session, 'stopped')
  if (notify) notifyStopped(session)
  session.complete()
}

function failSession(session: TranscriptionSession, message: string): void {
  if (activeSession !== session) return
  console.error(`[Transcription:${session.config.provider}] ${message}`)
  sendToRenderer('transcription-error', message)
  publishStatus(session, 'error')
  finishSession(session, false)
  notifyStopped(session)
}

function scheduleFinishTimeout(session: TranscriptionSession): void {
  if (session.finishTimer) clearTimeout(session.finishTimer)
  session.finishTimer = setTimeout(() => finishSession(session), FINISH_TIMEOUT_MS)
}

function normalizeTranscriptionConfig(value: unknown): TranscriptionConfig {
  if (!value || typeof value !== 'object') throw new Error('语音转录配置无效')
  const input = value as Record<string, unknown>
  const readString = (key: string) => (typeof input[key] === 'string' ? input[key].trim() : '')

  let config: TranscriptionConfig
  if (input.provider === 'dashscope') {
    config = {
      provider: 'dashscope',
      apiKey: readString('apiKey'),
      model: readString('model'),
      wsUrl: readString('wsUrl')
    }
  } else if (input.provider === 'volcengine') {
    config = {
      provider: 'volcengine',
      apiKey: readString('apiKey'),
      model: readString('model'),
      resourceId: readString('resourceId'),
      wsUrl: readString('wsUrl')
    }
  } else {
    throw new Error('不支持的语音服务商')
  }

  const configError = getTranscriptionConfigError(config)
  if (configError) throw new Error(configError)

  try {
    const url = new URL(config.wsUrl)
    if (url.protocol !== 'ws:' && url.protocol !== 'wss:') throw new Error()
  } catch {
    throw new Error('语音服务 WebSocket 地址格式无效')
  }

  return config
}

function sendSocketData(
  session: TranscriptionSession,
  data: string | Buffer,
  errorMessage: string
): void {
  if (activeSession !== session || session.socket.readyState !== WebSocket.OPEN) return
  try {
    session.socket.send(data, (error) => {
      if (error) failSession(session, `${errorMessage}：${error.message}`)
    })
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    failSession(session, `${errorMessage}：${detail}`)
  }
}

function attachCommonSocketHandlers(session: TranscriptionSession): void {
  session.socket.on('error', (error) => {
    failSession(session, error.message || '语音服务 WebSocket 连接失败')
  })

  session.socket.on('unexpected-response', (_request, response) => {
    failSession(session, `语音服务连接失败（HTTP ${response.statusCode ?? '未知'}）`)
  })

  session.socket.on('close', () => {
    if (session.finishing) finishSession(session)
    else failSession(session, '语音服务连接已断开')
  })
}

function attachDashScopeHandlers(session: TranscriptionSession): void {
  session.socket.on('open', () => {
    if (activeSession !== session) return
    session.ready = true
    sendSocketData(
      session,
      JSON.stringify({
        header: {
          action: 'run-task',
          task_id: session.id,
          streaming: 'duplex'
        },
        payload: {
          task_group: 'audio',
          task: 'asr',
          function: 'recognition',
          model: session.config.model,
          parameters: {
            format: 'pcm',
            sample_rate: config.sampleRate
          },
          input: {}
        }
      }),
      '启动百炼语音识别失败'
    )
  })

  session.socket.on('message', (data: WebSocket.Data) => {
    if (activeSession !== session) return
    try {
      const message = JSON.parse(data.toString())
      const event = message.header?.event

      if (event === 'task-started') {
        markReady(session)
        return
      }

      if (event === 'result-generated') {
        const sentence = message.payload?.output?.sentence
        if (!sentence || sentence.heartbeat === true) return

        const text = typeof sentence.text === 'string' ? sentence.text : ''
        const sentenceEnd = sentence.sentence_end === true
        if (sentenceEnd) {
          clearPartialTimer(session)
          transcriptionBuffer.finishSentence(text)
          publishTranscription(false, 'provider')
        } else {
          transcriptionBuffer.updatePartial(text)
          publishTranscription(true)
          schedulePartialFinalization(session)
        }
        return
      }

      if (event === 'task-failed') {
        failSession(session, message.header?.error_message || '百炼语音识别失败')
        return
      }

      if (event === 'task-finished') {
        finishSession(session)
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      failSession(session, `解析百炼语音识别结果失败：${detail}`)
    }
  })
}

function createVolcengineFrame(header: Buffer, payload: Buffer): Buffer {
  const compressedPayload = gzipSync(payload)
  const payloadSize = Buffer.allocUnsafe(4)
  payloadSize.writeUInt32BE(compressedPayload.length)
  return Buffer.concat([header, payloadSize, compressedPayload])
}

function createVolcengineFullRequest(config: TranscriptionConfig, sessionId: string): Buffer {
  if (config.provider !== 'volcengine') throw new Error('豆包语音配置无效')
  const request = Buffer.from(
    JSON.stringify({
      user: { uid: sessionId },
      audio: {
        format: 'pcm',
        codec: 'raw',
        rate: appConfig.transcription.sampleRate,
        bits: 16,
        channel: 1
      },
      request: {
        model_name: config.model,
        enable_nonstream: true,
        show_utterances: true,
        enable_itn: true,
        enable_punc: true,
        enable_ddc: true,
        end_window_size: appConfig.transcription.volcengineEndWindowMs
      }
    })
  )
  return createVolcengineFrame(VOLCENGINE_FULL_REQUEST_HEADER, request)
}

function createVolcengineAudioRequest(audio: Buffer, isFinal: boolean): Buffer {
  return createVolcengineFrame(
    isFinal ? VOLCENGINE_FINAL_AUDIO_REQUEST_HEADER : VOLCENGINE_AUDIO_REQUEST_HEADER,
    audio
  )
}

function toBuffer(data: WebSocket.Data): Buffer {
  if (Array.isArray(data)) return Buffer.concat(data)
  if (Buffer.isBuffer(data)) return data
  if (typeof data === 'string') return Buffer.from(data)
  return Buffer.from(data as ArrayBuffer)
}

function parseVolcengineFrame(data: WebSocket.Data): VolcengineFrame {
  const frame = toBuffer(data)
  if (frame.length < 4) throw new Error('响应帧长度不足')

  const headerSize = (frame[0] & 0x0f) * 4
  const messageType = frame[1] >> 4
  const flags = frame[1] & 0x0f
  const serialization = frame[2] >> 4
  const compression = frame[2] & 0x0f
  if (headerSize < 4 || frame.length < headerSize) throw new Error('响应帧头无效')

  let offset = headerSize
  let sequence: number | null = null
  if ((flags & 0x01) !== 0) {
    if (frame.length < offset + 4) throw new Error('响应序号缺失')
    sequence = frame.readInt32BE(offset)
    offset += 4
  }

  let errorCode: number | null = null
  if (messageType === 0x0f) {
    if (frame.length < offset + 4) throw new Error('错误码缺失')
    errorCode = frame.readUInt32BE(offset)
    offset += 4
  }

  if (frame.length < offset + 4) throw new Error('响应负载长度缺失')
  const payloadSize = frame.readUInt32BE(offset)
  offset += 4
  if (frame.length < offset + payloadSize) throw new Error('响应负载不完整')

  const encodedPayload = frame.subarray(offset, offset + payloadSize)
  const decodedPayload = compression === 0x01 ? gunzipSync(encodedPayload) : encodedPayload
  const payloadText = decodedPayload.toString('utf8')
  let payload: unknown = payloadText
  if (serialization === 0x01 && payloadText) {
    payload = JSON.parse(payloadText)
  }

  return {
    messageType,
    isFinal: flags === 0x02 || flags === 0x03 || (sequence !== null && sequence < 0),
    errorCode,
    payload,
    payloadText
  }
}

function getVolcengineErrorMessage(frame: VolcengineFrame): string {
  if (frame.payload && typeof frame.payload === 'object') {
    const payload = frame.payload as Record<string, unknown>
    const message = payload.message ?? payload.error
    if (typeof message === 'string' && message) return message
  }
  return frame.payloadText || '未知错误'
}

function handleVolcengineMessage(session: TranscriptionSession, data: WebSocket.Data): void {
  const frame = parseVolcengineFrame(data)
  if (frame.messageType === 0x0f) {
    const code = frame.errorCode === null ? '' : `（${frame.errorCode}）`
    failSession(session, `豆包语音识别失败${code}：${getVolcengineErrorMessage(frame)}`)
    return
  }
  if (frame.messageType !== 0x09) return

  if (frame.payload && typeof frame.payload === 'object') {
    const payload = frame.payload as Record<string, unknown>
    const result = payload.result
    if (result && typeof result === 'object') {
      const resultRecord = result as Record<string, unknown>
      if (typeof resultRecord.text === 'string') {
        transcriptionBuffer.updatePartial(resultRecord.text)
        const utterances = Array.isArray(resultRecord.utterances) ? resultRecord.utterances : []
        const lastUtterance = utterances.at(-1)
        const lastIsDefinite =
          !!lastUtterance &&
          typeof lastUtterance === 'object' &&
          (lastUtterance as Record<string, unknown>).definite === true
        const isPartial = !frame.isFinal && !lastIsDefinite
        if (isPartial) {
          publishTranscription(true)
          schedulePartialFinalization(session)
        } else {
          clearPartialTimer(session)
          publishTranscription(false, 'provider')
        }
      }
    }
  }

  if (frame.isFinal && session.finishing) {
    finishSession(session)
  }
}

function attachVolcengineHandlers(session: TranscriptionSession): void {
  session.socket.on('open', () => {
    if (activeSession !== session) return
    session.ready = true
    sendSocketData(
      session,
      createVolcengineFullRequest(session.config, session.id),
      '启动豆包语音识别失败'
    )
    markReady(session)
  })

  session.socket.on('message', (data: WebSocket.Data) => {
    if (activeSession !== session) return
    try {
      handleVolcengineMessage(session, data)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      failSession(session, `解析豆包语音识别结果失败：${detail}`)
    }
  })
}

function startTranscription(value: unknown, sessionId: string): void {
  const config = normalizeTranscriptionConfig(value)
  if (activeSession) {
    finishSession(activeSession, false)
  } else {
    transcriptionBuffer.finalizeCurrentPartial()
  }

  const headers =
    config.provider === 'dashscope'
      ? { Authorization: `bearer ${config.apiKey}` }
      : {
          'X-Api-Key': config.apiKey,
          'X-Api-Resource-Id': config.resourceId,
          'X-Api-Connect-Id': sessionId
        }
  const socket = new WebSocket(config.wsUrl, { headers })
  let complete!: () => void
  const completion = new Promise<void>((resolve) => {
    complete = resolve
  })
  const session: TranscriptionSession = {
    id: sessionId,
    config,
    socket,
    ready: false,
    taskStarted: false,
    finishing: false,
    stoppedNotified: false,
    pendingAudio: null,
    finishTimer: null,
    partialTimer: null,
    partialSnapshot: '',
    startupAudio: [],
    startupBytes: 0,
    connectionTimer: null,
    completion,
    complete
  }

  activeSession = session
  isTranscribing = true
  publishStatus(session, 'connecting')
  session.connectionTimer = setTimeout(
    () => failSession(session, '语音服务连接超时'),
    appConfig.transcription.connectionTimeoutMs
  )
  attachCommonSocketHandlers(session)
  if (config.provider === 'dashscope') {
    attachDashScopeHandlers(session)
  } else {
    attachVolcengineHandlers(session)
  }
}

function stopTranscription(): Promise<void> {
  const session = activeSession
  if (!session) return Promise.resolve()
  if (session.finishing) return session.completion

  isTranscribing = false
  session.finishing = true
  publishStatus(session, 'finishing')
  notifyStopped(session)

  if (session.socket.readyState !== WebSocket.OPEN || !session.taskStarted) {
    finishSession(session)
    return session.completion
  }

  if (session.config.provider === 'dashscope') {
    sendSocketData(
      session,
      JSON.stringify({
        header: {
          action: 'finish-task',
          task_id: session.id,
          streaming: 'duplex'
        },
        payload: { input: {} }
      }),
      '结束百炼语音识别失败'
    )
  } else {
    const finalAudio = session.pendingAudio ?? Buffer.alloc(0)
    session.pendingAudio = null
    sendSocketData(session, createVolcengineAudioRequest(finalAudio, true), '结束豆包语音识别失败')
  }

  scheduleFinishTimeout(session)
  return session.completion
}

function handleAudioChunk(sessionId: string, chunk: ArrayBuffer): void {
  const session = activeSession
  if (!session || session.id !== sessionId || !isTranscribing) return

  const audio = Buffer.from(chunk)
  if (audio.length === 0) return

  if (!session.taskStarted) {
    session.startupBytes += audio.length
    if (session.startupBytes > (config.sampleRate * 2 * config.startupBufferMs) / 1000) {
      failSession(session, '语音服务尚未就绪，启动音频缓存已满，请重新开始识别')
      return
    }
    session.startupAudio.push(audio)
    return
  }
  sendAudio(session, audio)
}

function sendAudio(session: TranscriptionSession, audio: Buffer): void {
  if (session.config.provider === 'dashscope') {
    sendSocketData(session, audio, '发送百炼语音数据失败')
    return
  }

  if (session.pendingAudio) {
    sendSocketData(
      session,
      createVolcengineAudioRequest(session.pendingAudio, false),
      '发送豆包语音数据失败'
    )
  }
  session.pendingAudio = audio
}

export function getTranscriptionText(): string {
  return transcriptionBuffer.getText()
}

export function consumeTranscriptionText(): string {
  const text = transcriptionBuffer.consume()
  sendToRenderer('transcription-text', {
    text: transcriptionBuffer.getText(),
    isPartial: false,
    ...transcriptionBuffer.getSegments()
  })
  return text
}

export function clearTranscriptionText(): void {
  transcriptionBuffer.clear()
}

ipcMain.handle('start-transcription', (_event, config: unknown, sessionId: string) => {
  startTranscription(config, sessionId)
})

ipcMain.handle('stop-transcription', () => {
  return stopTranscription()
})

ipcMain.on('transcription-audio-chunk', (_event, sessionId: string, chunk: ArrayBuffer) => {
  handleAudioChunk(sessionId, chunk)
})

ipcMain.handle('get-transcription-text', () => {
  return getTranscriptionText()
})

ipcMain.handle('clear-transcription-text', () => {
  clearTranscriptionText()
})
