import appConfig from '../../../../app.config.json'

export function createStreamBatch(deliver: (text: string) => void) {
  let pending = ''
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (timer !== null) clearTimeout(timer)
    timer = null
    pending = ''
  }
  const flush = () => {
    const text = pending
    clear()
    if (text) deliver(text)
  }
  return {
    push(text: string) {
      pending += text
      if (timer === null) timer = setTimeout(flush, appConfig.performance.streamFlushIntervalMs)
    },
    flush,
    clear
  }
}
