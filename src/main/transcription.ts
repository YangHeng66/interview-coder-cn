import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import WebSocket from 'ws'
import { getTranscriptionConfigError, type TranscriptionConfig } from '../preload/contracts'
import { TranscriptionBuffer } from './transcription-buffer'

const FINISH_TIMEOUT_MS = 5000
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

function sendToRenderer(channel: string, ...args: unknown[]) {
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
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
  transcriptionBuffer.finalizeCurrentPartial()
  activeSession = null
  isTranscribing = false
  disposeSocket(session.socket)
  if (notify) notifyStopped(session)
}

function failSession(session: TranscriptionSession, message: string): void {
  if (activeSession !== session) return
  console.error(`[Transcription:${session.config.provider}] ${message}`)
  sendToRenderer('transcription-error', message)
  finishSession(session)
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
    finishSession(session)
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
            sample_rate: 16000
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
        session.taskStarted = true
        return
      }

      if (event === 'result-generated') {
        const sentence = message.payload?.output?.sentence
        if (!sentence) return

        const text = typeof sentence.text === 'string' ? sentence.text : ''
        const sentenceEnd = sentence.sentence_end === true
        if (sentenceEnd) {
          transcriptionBuffer.finishSentence(text)
        } else {
          transcriptionBuffer.updatePartial(text)
        }
        sendToRenderer('transcription-text', {
          text: getTranscriptionText(),
          isPartial: !sentenceEnd
        })
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
        rate: 16000,
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
        end_window_size: 1000
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
        sendToRenderer('transcription-text', {
          text: getTranscriptionText(),
          isPartial: !frame.isFinal && !lastIsDefinite
        })
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
    session.taskStarted = true
    sendSocketData(
      session,
      createVolcengineFullRequest(session.config, session.id),
      '启动豆包语音识别失败'
    )
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

function startTranscription(value: unknown): void {
  const config = normalizeTranscriptionConfig(value)
  if (activeSession) {
    finishSession(activeSession, false)
  } else {
    transcriptionBuffer.finalizeCurrentPartial()
  }

  const sessionId = randomUUID()
  const headers =
    config.provider === 'dashscope'
      ? { Authorization: `bearer ${config.apiKey}` }
      : {
          'X-Api-Key': config.apiKey,
          'X-Api-Resource-Id': config.resourceId,
          'X-Api-Connect-Id': sessionId
        }
  const socket = new WebSocket(config.wsUrl, { headers })
  const session: TranscriptionSession = {
    id: sessionId,
    config,
    socket,
    ready: false,
    taskStarted: false,
    finishing: false,
    stoppedNotified: false,
    pendingAudio: null,
    finishTimer: null
  }

  activeSession = session
  isTranscribing = true
  attachCommonSocketHandlers(session)
  if (config.provider === 'dashscope') {
    attachDashScopeHandlers(session)
  } else {
    attachVolcengineHandlers(session)
  }
}

function stopTranscription(): void {
  const session = activeSession
  if (!session || !isTranscribing) return

  isTranscribing = false
  session.finishing = true
  notifyStopped(session)

  if (session.socket.readyState !== WebSocket.OPEN || !session.taskStarted) {
    finishSession(session)
    return
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
}

function handleAudioChunk(chunk: ArrayBuffer): void {
  const session = activeSession
  if (
    !session ||
    !isTranscribing ||
    !session.ready ||
    !session.taskStarted ||
    session.socket.readyState !== WebSocket.OPEN
  ) {
    return
  }

  const audio = Buffer.from(chunk)
  if (audio.length === 0) return

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
    isPartial: false
  })
  return text
}

export function clearTranscriptionText(): void {
  transcriptionBuffer.clear()
}

ipcMain.handle('start-transcription', (_event, config: unknown) => {
  startTranscription(config)
})

ipcMain.handle('stop-transcription', () => {
  stopTranscription()
})

ipcMain.on('transcription-audio-chunk', (_event, chunk: ArrayBuffer) => {
  handleAudioChunk(chunk)
})

ipcMain.handle('get-transcription-text', () => {
  return getTranscriptionText()
})

ipcMain.handle('clear-transcription-text', () => {
  clearTranscriptionText()
})
