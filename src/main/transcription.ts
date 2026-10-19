import { ipcMain } from 'electron'
import { randomUUID } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import WebSocket from 'ws'
import {
  getTranscriptionConfigError,
  type TranscriptionChannel,
  type TranscriptionConfig,
  type TranscriptionSpeaker,
  type TranscriptionStatus
} from '../preload/contracts'
import { SpeakerTranscript, speakerForChannel } from './transcription-speakers'
import { logTimeline } from './transcription-timeline'
import { parseVolcengineUtterances, VolcengineUtteranceTracker } from './transcription-volcengine'
import appConfig from '../../app.config.json'

const config = appConfig.transcription
const FINISH_TIMEOUT_MS = config.finishTimeoutMs
const PARTIAL_IDLE_TIMEOUT_MS = config.partialIdleMs
const VOLCENGINE_FULL_REQUEST_HEADER = Buffer.from([0x11, 0x10, 0x11, 0x00])
const VOLCENGINE_AUDIO_REQUEST_HEADER = Buffer.from([0x11, 0x20, 0x01, 0x00])
const VOLCENGINE_FINAL_AUDIO_REQUEST_HEADER = Buffer.from([0x11, 0x22, 0x01, 0x00])
const TRANSCRIPTION_CHANNELS: TranscriptionChannel[] = ['system', 'microphone']
const CHANNEL_LABELS: Record<TranscriptionChannel, string> = {
  system: '系统音频',
  microphone: '麦克风'
}

type TranscriptionSession = {
  /** Provider task / connect id, unique per connection */
  id: string
  run: TranscriptionRun
  /** null when the run captures a single audio source */
  channel: TranscriptionChannel | null
  config: TranscriptionConfig
  socket: WebSocket
  ready: boolean
  taskStarted: boolean
  finishing: boolean
  pendingAudio: Buffer | null
  finishTimer: NodeJS.Timeout | null
  partialTimer: NodeJS.Timeout | null
  partialSnapshot: string
  startupAudio: Buffer[]
  startupBytes: number
  connectionTimer: NodeJS.Timeout | null
  /** Volcengine only: which utterances of the cumulative result are already finished */
  utterances: VolcengineUtteranceTracker
  completion: Promise<void>
  complete: () => void
}

/** One start/stop cycle requested by the renderer; mixed capture runs one session per channel */
type TranscriptionRun = {
  id: string
  sessions: TranscriptionSession[]
  listening: boolean
  stoppedNotified: boolean
  completion: Promise<void> | null
}

export type TranscriptionEventReason = 'provider' | 'silence' | 'stopped'

export type TranscriptionEvent = {
  text: string
  isPartial: boolean
  reason?: TranscriptionEventReason
  speaker?: TranscriptionSpeaker | null
}

type VolcengineFrame = {
  messageType: number
  isFinal: boolean
  errorCode: number | null
  payload: unknown
  payloadText: string
}

let activeRun: TranscriptionRun | null = null
let isTranscribing = false
const transcript = new SpeakerTranscript()
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

function isActive(session: TranscriptionSession): boolean {
  return activeRun?.sessions.includes(session) ?? false
}

function speakerOf(session: TranscriptionSession): TranscriptionSpeaker | null {
  return speakerForChannel(session.channel)
}

function sendTranscriptText(isPartial: boolean): void {
  sendToRenderer('transcription-text', {
    text: transcript.getText(),
    isPartial,
    lines: transcript.getLines()
  })
}

function publishTranscription(
  speaker: TranscriptionSpeaker | null,
  isPartial: boolean,
  reason?: TranscriptionEventReason
): void {
  // A silence fallback may still be revised by the provider, so only provider
  // results and the final flush are frozen into the ordered speaker history.
  if (!isPartial) transcript.confirm(speaker, reason !== 'silence')
  const event: TranscriptionEvent = {
    text: getTranscriptionText(),
    isPartial,
    reason,
    speaker
  }
  sendTranscriptText(isPartial)
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
  // Compare only this channel's text: the other channel keeps changing the
  // combined transcript and would otherwise prevent the silence fallback.
  const speaker = speakerOf(session)
  const snapshot = transcript.getSpeakerText(speaker)
  if (session.partialTimer && session.partialSnapshot === snapshot) return
  clearPartialTimer(session)
  if (!snapshot.trim()) return
  session.partialSnapshot = snapshot

  session.partialTimer = setTimeout(() => {
    session.partialTimer = null
    if (
      !isActive(session) ||
      session.finishing ||
      transcript.getSpeakerText(speaker) !== snapshot
    ) {
      return
    }
    logTimeline('silence-final', { channel: session.channel, text: snapshot })
    publishTranscription(speaker, false, 'silence')
  }, PARTIAL_IDLE_TIMEOUT_MS)
}

/** Providers repeat unchanged results during silence; only a change counts as speech */
function publishPartial(session: TranscriptionSession, text: string): void {
  const speaker = speakerOf(session)
  const before = transcript.getSpeakerText(speaker)
  transcript.updatePartial(speaker, text)
  if (transcript.getSpeakerText(speaker) !== before) publishTranscription(speaker, true)
  schedulePartialFinalization(session)
}

function publishStatus(run: TranscriptionRun, status: TranscriptionStatus): void {
  sendToRenderer('transcription-status', { sessionId: run.id, status })
}

function publishListeningIfReady(run: TranscriptionRun): void {
  if (run.listening || !run.sessions.every((session) => session.taskStarted)) return
  run.listening = true
  publishStatus(run, 'listening')
}

function markReady(session: TranscriptionSession): void {
  session.taskStarted = true
  logTimeline('session-ready', { channel: session.channel })
  if (session.connectionTimer) clearTimeout(session.connectionTimer)
  session.connectionTimer = null
  publishListeningIfReady(session.run)
  for (const audio of session.startupAudio) sendAudio(session, audio)
  session.startupAudio = []
  session.startupBytes = 0
}

function notifyStopped(run: TranscriptionRun): void {
  if (run.stoppedNotified) return
  run.stoppedNotified = true
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
  if (!isActive(session)) return
  const run = session.run

  if (session.finishTimer) {
    clearTimeout(session.finishTimer)
    session.finishTimer = null
  }
  clearPartialTimer(session)
  if (session.connectionTimer) clearTimeout(session.connectionTimer)
  session.startupAudio = []
  const speaker = speakerOf(session)
  logTimeline('session-finish', {
    channel: session.channel,
    graceful: session.finishing,
    pending: transcript.getSpeakerText(speaker)
  })
  transcript.finalizePartial(speaker)
  if (session.finishing && getTranscriptionText().trim()) {
    publishTranscription(speaker, false, 'stopped')
  }
  run.sessions = run.sessions.filter((item) => item !== session)
  disposeSocket(session.socket)
  session.complete()
  if (run.sessions.length > 0) return

  if (activeRun === run) activeRun = null
  isTranscribing = false
  if (notify) publishStatus(run, 'stopped')
  if (notify) notifyStopped(run)
}

function finishRun(run: TranscriptionRun): void {
  for (const session of [...run.sessions]) finishSession(session, false)
}

/** A failed channel stops the whole run: a silently dead interviewer channel would stop auto replies */
function failSession(session: TranscriptionSession, message: string): void {
  if (!isActive(session)) return
  const run = session.run
  const prefix =
    session.channel && run.sessions.length > 1 ? `${CHANNEL_LABELS[session.channel]}：` : ''
  console.error(
    `[Transcription:${session.config.provider}${session.channel ? `:${session.channel}` : ''}] ${message}`
  )
  logTimeline('session-error', { channel: session.channel, message })
  sendToRenderer('transcription-error', `${prefix}${message}`)
  publishStatus(run, 'error')
  finishRun(run)
  notifyStopped(run)
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

/** Speakers are only told apart when both channels are captured */
function normalizeChannels(value: unknown): (TranscriptionChannel | null)[] {
  if (!Array.isArray(value)) return [null]
  const channels = TRANSCRIPTION_CHANNELS.filter((channel) => value.includes(channel))
  return channels.length > 1 ? channels : [null]
}

function sendSocketData(
  session: TranscriptionSession,
  data: string | Buffer,
  errorMessage: string
): void {
  if (!isActive(session) || session.socket.readyState !== WebSocket.OPEN) return
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
    if (!isActive(session)) return
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
    if (!isActive(session)) return
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
        const speaker = speakerOf(session)
        logTimeline('asr', {
          channel: session.channel,
          final: sentenceEnd,
          sentenceId: sentence.sentence_id,
          begin: sentence.begin_time,
          end: sentence.end_time,
          text
        })
        if (sentenceEnd) {
          clearPartialTimer(session)
          transcript.finishSentence(speaker, text)
          publishTranscription(speaker, false, 'provider')
        } else {
          publishPartial(session, text)
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
        const rawUtterances = Array.isArray(resultRecord.utterances) ? resultRecord.utterances : []
        const parsed = parseVolcengineUtterances(rawUtterances)
        // show_utterances is requested; without it the cumulative text is one open utterance
        const utterances = parsed.length ? parsed : [{ text: resultRecord.text, definite: false }]
        const { finished, partial } = session.utterances.update(utterances, frame.isFinal)
        // result.text is cumulative, so only the tail is logged to keep the file linear in size
        logTimeline('asr', {
          channel: session.channel,
          final: finished.length > 0,
          frameFinal: frame.isFinal,
          textLength: resultRecord.text.length,
          utteranceCount: rawUtterances.length,
          tail: rawUtterances.slice(-2).map(summarizeVolcengineUtterance)
        })

        const speaker = speakerOf(session)
        if (finished.length) {
          clearPartialTimer(session)
          // One call: the partial these came from may already span several of them
          transcript.finishSentence(speaker, finished.join(''))
          publishTranscription(speaker, false, 'provider')
        }
        if (partial) publishPartial(session, partial)
      }
    }
  }

  if (frame.isFinal && session.finishing) {
    finishSession(session)
  }
}

function summarizeVolcengineUtterance(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object') return {}
  const utterance = value as Record<string, unknown>
  return {
    text: utterance.text,
    begin: utterance.start_time,
    end: utterance.end_time,
    definite: utterance.definite === true
  }
}

function attachVolcengineHandlers(session: TranscriptionSession): void {
  session.socket.on('open', () => {
    if (!isActive(session)) return
    session.ready = true
    sendSocketData(
      session,
      createVolcengineFullRequest(session.config, session.id),
      '启动豆包语音识别失败'
    )
    markReady(session)
  })

  session.socket.on('message', (data: WebSocket.Data) => {
    if (!isActive(session)) return
    try {
      handleVolcengineMessage(session, data)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      failSession(session, `解析豆包语音识别结果失败：${detail}`)
    }
  })
}

function createSession(
  run: TranscriptionRun,
  config: TranscriptionConfig,
  channel: TranscriptionChannel | null,
  sessionId: string
): TranscriptionSession {
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
    run,
    channel,
    config,
    socket,
    ready: false,
    taskStarted: false,
    finishing: false,
    pendingAudio: null,
    finishTimer: null,
    partialTimer: null,
    partialSnapshot: '',
    startupAudio: [],
    startupBytes: 0,
    connectionTimer: null,
    utterances: new VolcengineUtteranceTracker(),
    completion,
    complete
  }

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
  return session
}

function startTranscription(value: unknown, runId: string, channels: unknown): void {
  const config = normalizeTranscriptionConfig(value)
  const sessionChannels = normalizeChannels(channels)
  if (activeRun) finishRun(activeRun)
  transcript.setSpeakers(sessionChannels.map(speakerForChannel))

  const run: TranscriptionRun = {
    id: runId,
    sessions: [],
    listening: false,
    stoppedNotified: false,
    completion: null
  }
  activeRun = run
  isTranscribing = true
  logTimeline('run-start', {
    runId,
    provider: config.provider,
    model: config.model,
    channels: sessionChannels
  })
  publishStatus(run, 'connecting')
  sessionChannels.forEach((channel, index) => {
    // Each connection needs its own task id; the first reuses the renderer's id
    run.sessions.push(createSession(run, config, channel, index === 0 ? runId : randomUUID()))
  })
}

function finishSessionGracefully(session: TranscriptionSession): void {
  session.finishing = true

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

function stopTranscription(): Promise<void> {
  const run = activeRun
  if (!run) return Promise.resolve()
  if (run.completion) return run.completion

  run.completion = Promise.all(run.sessions.map((session) => session.completion)).then(
    () => undefined
  )
  isTranscribing = false
  logTimeline('run-stop', { runId: run.id })
  publishStatus(run, 'finishing')
  notifyStopped(run)
  for (const session of [...run.sessions]) finishSessionGracefully(session)
  return run.completion
}

/** Mixed capture can lose one source; the remaining channel then behaves like a single source */
function setTranscriptionChannels(runId: string, channels: unknown): void {
  const run = activeRun
  if (!run || run.id !== runId || run.sessions.length < 2 || !Array.isArray(channels)) return
  const remaining = run.sessions.filter(
    (session) => session.channel && channels.includes(session.channel)
  )
  if (remaining.length !== 1) return
  logTimeline('channels-changed', { remaining: remaining[0].channel })

  for (const session of [...run.sessions]) {
    if (session !== remaining[0]) finishSession(session, false)
  }
  remaining[0].channel = null
  transcript.setSpeakers([null])
  publishListeningIfReady(run)
}

function handleAudioChunk(runId: string, chunk: ArrayBuffer, channel: unknown): void {
  const run = activeRun
  if (!run || run.id !== runId || !isTranscribing) return
  const session = run.sessions.find((item) => item.channel === null || item.channel === channel)
  if (!session) return

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

/** False as soon as a stop is requested, before the provider delivers its last result */
export function isTranscriptionListening(): boolean {
  return isTranscribing
}

export function getTranscriptionText(): string {
  return transcript.getText()
}

export function consumeTranscriptionText(): string {
  const text = transcript.consume()
  logTimeline('consume', { mode: 'all', text })
  sendTranscriptText(false)
  return text
}

/** Takes confirmed text of every speaker and leaves unconfirmed partials in place */
export function consumeConfirmedTranscriptionText(): string {
  const text = transcript.consumeConfirmed()
  logTimeline('consume', { mode: 'confirmed', text, remaining: transcript.getText() })
  sendTranscriptText(false)
  return text
}

/** reason only labels the timeline log: a screenshot takes the text, a manual clear drops it */
export function clearTranscriptionText(reason: 'screenshot' | 'manual'): void {
  logTimeline('consume', { mode: reason, text: transcript.getText() })
  transcript.clear()
}

ipcMain.handle(
  'start-transcription',
  (_event, config: unknown, sessionId: string, channels?: unknown) => {
    startTranscription(config, sessionId, channels)
  }
)

ipcMain.handle('stop-transcription', () => {
  return stopTranscription()
})

ipcMain.handle('set-transcription-channels', (_event, sessionId: string, channels: unknown) => {
  setTranscriptionChannels(sessionId, channels)
})

ipcMain.on(
  'transcription-audio-chunk',
  (_event, sessionId: string, chunk: ArrayBuffer, channel?: unknown) => {
    handleAudioChunk(sessionId, chunk, channel)
  }
)

ipcMain.handle('get-transcription-text', () => {
  return getTranscriptionText()
})

ipcMain.handle('clear-transcription-text', () => {
  clearTranscriptionText('manual')
})
