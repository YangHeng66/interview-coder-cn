import { useSettingsStore } from '@/lib/store/settings'
import { useTranscriptionStore } from '@/lib/store/transcription'
import appConfig from '../../../../app.config.json'
import workletSource from './pcm-worklet.js?raw'

export type AudioCaptureSource = 'system' | 'microphone'

export type AudioCaptureResult = {
  activeSources: AudioCaptureSource[]
  warnings: string[]
}

let mediaStreams: MediaStream[] = []
let audioContext: AudioContext | null = null
let processor: AudioWorkletNode | null = null
let mixer: GainNode | null = null
let sourceNodes: MediaStreamAudioSourceNode[] = []
let generation = 0
let acknowledgeFlush: (() => void) | null = null

async function openMicrophoneStream(deviceId: string): Promise<MediaStream> {
  const audio: MediaTrackConstraints = {
    channelCount: 1,
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true
  }
  if (deviceId) audio.deviceId = { exact: deviceId }

  const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false })
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error('麦克风没有可用音轨')
  }
  return stream
}

async function openSystemAudioStream(): Promise<MediaStream> {
  const stream = await navigator.mediaDevices.getDisplayMedia({
    audio: true,
    video: true
  })
  stream.getVideoTracks().forEach((track) => track.stop())
  if (stream.getAudioTracks().length === 0) {
    stream.getTracks().forEach((track) => track.stop())
    throw new Error('系统音频没有可用音轨')
  }
  return stream
}

function getErrorDetail(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

async function openRequestedStreams(
  source: 'system' | 'microphone' | 'mixed',
  microphoneDeviceId: string
): Promise<{ streams: { source: AudioCaptureSource; stream: MediaStream }[]; warnings: string[] }> {
  const requests: {
    source: AudioCaptureSource
    promise: Promise<MediaStream>
  }[] = []

  if (source === 'system' || source === 'mixed') {
    requests.push({ source: 'system', promise: openSystemAudioStream() })
  }
  if (source === 'microphone' || source === 'mixed') {
    requests.push({
      source: 'microphone',
      promise: openMicrophoneStream(microphoneDeviceId)
    })
  }

  const results = await Promise.allSettled(requests.map((request) => request.promise))
  const streams: { source: AudioCaptureSource; stream: MediaStream }[] = []
  const failures: { source: AudioCaptureSource; detail: string }[] = []

  results.forEach((result, index) => {
    const request = requests[index]
    if (result.status === 'fulfilled') {
      streams.push({ source: request.source, stream: result.value })
    } else {
      failures.push({ source: request.source, detail: getErrorDetail(result.reason) })
    }
  })

  if (streams.length === 0) {
    const detail = failures.map((failure) => `${failure.source}: ${failure.detail}`).join('；')
    throw new Error(`没有可用的音频输入${detail ? `：${detail}` : ''}`)
  }

  if (source !== 'mixed' || failures.length === 0) {
    return { streams, warnings: [] }
  }

  const warnings = failures.map((failure) => {
    const failedName = failure.source === 'microphone' ? '麦克风' : '系统音频'
    const activeName = failure.source === 'microphone' ? '系统音频' : '麦克风'
    return `${failedName}不可用，已仅使用${activeName}（${failure.detail}）`
  })
  return { streams, warnings }
}

export async function startAudioCapture(sessionId: string): Promise<AudioCaptureResult> {
  await stopAudioCapture()
  const captureGeneration = generation

  const { audioInputDeviceId, audioOutputDeviceId, transcriptionAudioSource } =
    useSettingsStore.getState()
  const source =
    transcriptionAudioSource === 'microphone' || transcriptionAudioSource === 'mixed'
      ? transcriptionAudioSource
      : 'system'
  const { streams, warnings } = await openRequestedStreams(source, audioInputDeviceId)

  if (generation !== captureGeneration) {
    streams.forEach(({ stream }) => stream.getTracks().forEach((track) => track.stop()))
    throw new DOMException('音频采集已取消', 'AbortError')
  }

  mediaStreams = streams.map(({ stream }) => stream)

  try {
    const context = new AudioContext({
      sampleRate: appConfig.transcription.sampleRate,
      latencyHint: 'interactive'
    })
    audioContext = context

    if (audioOutputDeviceId && 'setSinkId' in audioContext) {
      try {
        await (
          audioContext as AudioContext & { setSinkId: (id: string) => Promise<void> }
        ).setSinkId(audioOutputDeviceId)
      } catch (error) {
        console.warn('Failed to set audio output device:', error)
      }
    }

    const workletUrl = URL.createObjectURL(new Blob([workletSource], { type: 'text/javascript' }))
    try {
      await context.audioWorklet.addModule(workletUrl)
    } finally {
      URL.revokeObjectURL(workletUrl)
    }
    if (generation !== captureGeneration) throw new DOMException('音频采集已取消', 'AbortError')
    mixer = context.createGain()
    mixer.channelCount = 1
    mixer.channelCountMode = 'explicit'
    mixer.gain.value = mediaStreams.length > 1 ? 0.5 : 1

    sourceNodes = mediaStreams.map((stream) => {
      const audioOnlyStream = new MediaStream(stream.getAudioTracks())
      const sourceNode = audioContext!.createMediaStreamSource(audioOnlyStream)
      sourceNode.channelCount = 1
      sourceNode.channelCountMode = 'explicit'
      sourceNode.connect(mixer!)
      return sourceNode
    })

    processor = new AudioWorkletNode(context, 'pcm-capture', {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      processorOptions: {
        frameSamples: Math.round(
          (context.sampleRate * appConfig.transcription.frameDurationMs) / 1000
        )
      }
    })
    processor.port.onmessage = ({ data }) => {
      if (data.type === 'flushed') {
        acknowledgeFlush?.()
        return
      }
      window.api.sendTranscriptionAudioChunk(sessionId, data.pcm)
      const floor = appConfig.transcription.meterFloorDb
      const db = data.rms > 0 ? 20 * Math.log10(data.rms) : floor
      useTranscriptionStore
        .getState()
        .setAudioLevel(Math.max(0, Math.min(1, (db - floor) / -floor)))
    }
    mixer.connect(processor)
    // The worklet leaves its output silent; captured audio is never played locally.
    processor.connect(context.destination)
    await context.resume()
  } catch (error) {
    if (generation === captureGeneration) await stopAudioCapture()
    throw error
  }

  return {
    activeSources: streams.map(({ source }) => source),
    warnings
  }
}

export async function stopAudioCapture(): Promise<void> {
  generation++
  const closingProcessor = processor
  const closingContext = audioContext
  processor = null
  audioContext = null
  sourceNodes.forEach((sourceNode) => sourceNode.disconnect())
  sourceNodes = []
  if (mixer) {
    mixer.disconnect()
    mixer = null
  }
  mediaStreams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
  mediaStreams = []
  if (closingProcessor && closingContext?.state === 'running') {
    await new Promise<void>((resolve) => {
      acknowledgeFlush = resolve
      closingProcessor.port.postMessage('flush')
    })
    acknowledgeFlush = null
  }
  closingProcessor?.disconnect()
  closingProcessor?.port.close()
  if (closingContext && closingContext.state !== 'closed') await closingContext.close()
  useTranscriptionStore.getState().setAudioLevel(0)
}
