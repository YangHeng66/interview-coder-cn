import { useSettingsStore } from '@/lib/store/settings'

export type AudioCaptureSource = 'system' | 'microphone'

export type AudioCaptureResult = {
  activeSources: AudioCaptureSource[]
  warnings: string[]
}

let mediaStreams: MediaStream[] = []
let audioContext: AudioContext | null = null
let processor: ScriptProcessorNode | null = null
let mixer: GainNode | null = null
let sourceNodes: MediaStreamAudioSourceNode[] = []

function downsampleAndSend(float32: Float32Array): void {
  const int16 = new Int16Array(float32.length)
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]))
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  window.api.sendTranscriptionAudioChunk(int16.buffer)
}

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

export async function startAudioCapture(): Promise<AudioCaptureResult> {
  stopAudioCapture()

  const { audioInputDeviceId, audioOutputDeviceId, transcriptionAudioSource } =
    useSettingsStore.getState()
  const source =
    transcriptionAudioSource === 'microphone' || transcriptionAudioSource === 'mixed'
      ? transcriptionAudioSource
      : 'system'
  const { streams, warnings } = await openRequestedStreams(
    source,
    audioInputDeviceId
  )

  mediaStreams = streams.map(({ stream }) => stream)

  try {
    audioContext = new AudioContext({ sampleRate: 16000, latencyHint: 'interactive' })

    if (audioOutputDeviceId && 'setSinkId' in audioContext) {
      try {
        await (
          audioContext as AudioContext & { setSinkId: (id: string) => Promise<void> }
        ).setSinkId(audioOutputDeviceId)
      } catch (error) {
        console.warn('Failed to set audio output device:', error)
      }
    }

    mixer = audioContext.createGain()
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

    processor = audioContext.createScriptProcessor(2048, 1, 1)
    processor.onaudioprocess = (event) => {
      downsampleAndSend(event.inputBuffer.getChannelData(0))
      event.outputBuffer.getChannelData(0).fill(0)
    }
    mixer.connect(processor)
    // ScriptProcessorNode must be connected to run in Chromium. The output is
    // explicitly muted above, so captured audio is never played back locally.
    processor.connect(audioContext.destination)
    await audioContext.resume()
  } catch (error) {
    stopAudioCapture()
    throw error
  }

  return {
    activeSources: streams.map(({ source }) => source),
    warnings
  }
}

export function stopAudioCapture(): void {
  if (processor) {
    processor.disconnect()
    processor.onaudioprocess = null
    processor = null
  }
  sourceNodes.forEach((sourceNode) => sourceNode.disconnect())
  sourceNodes = []
  if (mixer) {
    mixer.disconnect()
    mixer = null
  }
  if (audioContext) {
    void audioContext.close()
    audioContext = null
  }
  mediaStreams.forEach((stream) => stream.getTracks().forEach((track) => track.stop()))
  mediaStreams = []
}
