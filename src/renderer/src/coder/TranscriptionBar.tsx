import { useEffect, useRef } from 'react'
import { Mic, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranscriptionStore } from '@/lib/store/transcription'

export function TranscriptionBar({
  isPaused,
  onPause,
  onResume
}: {
  isPaused: boolean
  onPause: () => void
  onResume: () => void
}) {
  const { isTranscribing, transcriptionText } = useTranscriptionStore()
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [transcriptionText])

  if (!isTranscribing && !isPaused && !transcriptionText) return null

  return (
    <div className="absolute top-10 left-0 right-0 px-6 pb-2 z-10">
      <div className="flex items-start gap-2 bg-gray-700/80 rounded-lg pl-2 pr-0 py-1">
        <Mic
          className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
            isTranscribing ? 'animate-pulse text-green-400' : 'text-amber-300'
          }`}
        />
        <div
          ref={scrollRef}
          className="transcription-scroll text-sm text-gray-300 max-h-[4.2em] overflow-y-auto leading-[1.4em] flex-1 whitespace-pre-wrap break-words"
        >
          {transcriptionText || (isPaused ? '语音识别已暂停' : '等待语音输入...')}
        </div>
        {(isTranscribing || isPaused) && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="mr-1 size-7 shrink-0 text-gray-100 hover:bg-white/10 hover:text-white"
            onClick={isPaused ? onResume : onPause}
            aria-label={isPaused ? '继续语音识别' : '暂停语音识别'}
            title={isPaused ? '继续语音识别' : '暂停语音识别'}
          >
            {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
          </Button>
        )}
      </div>
    </div>
  )
}
