import { ipcMain } from 'electron'
import WebSocket from 'ws'
import { randomUUID } from 'node:crypto'
import { TranscriptionBuffer } from './transcription-buffer'

const WS_URL = 'wss://dashscope.aliyuncs.com/api-ws/v1/inference/'

let ws: WebSocket | null = null
let taskId: string | null = null
let isTranscribing = false
let taskStarted = false
const transcriptionBuffer = new TranscriptionBuffer()

function sendToRenderer(channel: string, ...args: unknown[]) {
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args)
  }
}

function cleanup() {
  if (ws) {
    ws.removeAllListeners()
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close()
    }
    ws = null
  }
  taskId = null
  isTranscribing = false
  taskStarted = false
}

function startTranscription(apiKey: string) {
  if (isTranscribing) return

  transcriptionBuffer.finalizeCurrentPartial()
  cleanup()
  isTranscribing = true
  taskId = randomUUID()

  ws = new WebSocket(WS_URL, {
    headers: { Authorization: `bearer ${apiKey}` }
  })

  ws.on('open', () => {
    const runTask = {
      header: {
        action: 'run-task',
        task_id: taskId,
        streaming: 'duplex'
      },
      payload: {
        task_group: 'audio',
        task: 'asr',
        function: 'recognition',
        model: 'fun-asr-realtime',
        parameters: {
          format: 'pcm',
          sample_rate: 16000
        },
        input: {}
      }
    }
    ws!.send(JSON.stringify(runTask))
  })

  ws.on('message', (data: WebSocket.Data) => {
    try {
      const msg = JSON.parse(data.toString())
      const event = msg.header?.event

      if (event === 'task-started') {
        taskStarted = true
        return
      }

      if (event === 'result-generated') {
        const sentence = msg.payload?.output?.sentence
        if (!sentence) return

        const text: string = sentence.text || ''
        const sentenceEnd: boolean = sentence.sentence_end === true

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
        const errorMsg = msg.header?.error_message || '语音识别失败'
        console.error('Transcription task failed:', errorMsg)
        sendToRenderer('transcription-error', errorMsg)
        cleanup()
        sendToRenderer('transcription-stopped')
        return
      }

      if (event === 'task-finished') {
        cleanup()
        sendToRenderer('transcription-stopped')
      }
    } catch (e) {
      console.error('Failed to parse transcription message:', e)
    }
  })

  ws.on('error', (err) => {
    console.error('Transcription WebSocket error:', err)
    sendToRenderer('transcription-error', err.message || 'WebSocket 连接失败')
    cleanup()
    sendToRenderer('transcription-stopped')
  })

  ws.on('close', () => {
    if (isTranscribing) {
      isTranscribing = false
      sendToRenderer('transcription-stopped')
    }
    ws = null
    taskStarted = false
  })
}

function stopTranscription() {
  if (!isTranscribing) return

  if (ws && ws.readyState === WebSocket.OPEN && taskId && taskStarted) {
    const finishTask = {
      header: {
        action: 'finish-task',
        task_id: taskId,
        streaming: 'duplex'
      },
      payload: {
        input: {}
      }
    }
    ws.send(JSON.stringify(finishTask))
  }

  transcriptionBuffer.finalizeCurrentPartial()
  isTranscribing = false
  cleanup()
  sendToRenderer('transcription-stopped')
}

function handleAudioChunk(chunk: ArrayBuffer) {
  if (!ws || ws.readyState !== WebSocket.OPEN || !taskStarted) return
  ws.send(Buffer.from(chunk))
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

export function clearTranscriptionText() {
  transcriptionBuffer.clear()
}

ipcMain.handle('start-transcription', (_event, apiKey: string) => {
  startTranscription(apiKey)
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
