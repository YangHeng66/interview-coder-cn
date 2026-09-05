/* global AudioWorkletProcessor, registerProcessor */
class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super()
    this.frameSamples = options.processorOptions.frameSamples
    this.frame = new Int16Array(this.frameSamples)
    this.offset = 0
    this.energy = 0
    this.stopped = false
    this.port.onmessage = ({ data }) => {
      if (data === 'flush') {
        this.stopped = true
        if (this.offset) this.sendFrame()
        this.port.postMessage({ type: 'flushed' })
      }
    }
  }

  sendFrame() {
    const pcm = this.offset === this.frameSamples ? this.frame : this.frame.slice(0, this.offset)
    this.port.postMessage(
      { type: 'audio', pcm: pcm.buffer, rms: Math.sqrt(this.energy / this.offset) },
      [pcm.buffer]
    )
    this.frame = new Int16Array(this.frameSamples)
    this.offset = 0
    this.energy = 0
  }

  process(inputs) {
    if (this.stopped) return false
    const samples = inputs[0]?.[0]
    if (!samples) return true
    for (const value of samples) {
      const sample = Math.max(-1, Math.min(1, value))
      this.frame[this.offset++] = sample < 0 ? sample * 0x8000 : sample * 0x7fff
      this.energy += sample * sample
      if (this.offset === this.frameSamples) this.sendFrame()
    }
    return true
  }
}

registerProcessor('pcm-capture', PcmCaptureProcessor)
