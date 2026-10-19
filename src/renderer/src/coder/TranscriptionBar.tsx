import { useEffect, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { ArrowDown, Mic, Pause, Play, Send, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useTranscriptionStore } from '@/lib/store/transcription'
import appConfig from '../../../../app.config.json'
import {
  TRANSCRIPTION_SPEAKER_LABELS,
  type TranscriptionLine,
  type TranscriptionSpeaker
} from '../../../preload/contracts'

const speakerColors: Record<TranscriptionSpeaker, string> = {
  interviewer: 'text-sky-300',
  me: 'text-emerald-300'
}

function TranscriptLines({ lines }: { lines: TranscriptionLine[] }) {
  if (!lines.some((line) => line.speaker)) {
    return lines.map((line, index) => (
      <span key={index}>
        <span>{line.confirmedText}</span>
        <span className="text-amber-100/70">{line.partialText}</span>
      </span>
    ))
  }
  return lines.map((line, index) => (
    <div key={index}>
      {line.speaker && (
        <span className={`font-medium ${speakerColors[line.speaker]}`}>
          {TRANSCRIPTION_SPEAKER_LABELS[line.speaker]}：
        </span>
      )}
      <span>{line.confirmedText}</span>
      <span className="text-amber-100/70">{line.partialText}</span>
    </div>
  ))
}

const labels = {
  idle: '待发送',
  connecting: '连接中',
  listening: '正在识别',
  finishing: '正在结束',
  stopped: '已停止',
  error: '连接失败'
}

function AudioLevel() {
  const level = useTranscriptionStore((s) => s.audioLevel)
  return (
    <meter
      aria-label="音频输入电平"
      min={0}
      max={1}
      value={level}
      className="transcription-meter"
    />
  )
}

export function TranscriptionBar({
  isPaused,
  onPause,
  onResume
}: {
  isPaused: boolean
  onPause: () => void
  onResume: () => void
}) {
  const { isTranscribing, transcriptionText, status, lines } = useTranscriptionStore(
    useShallow((s) => ({
      isTranscribing: s.isTranscribing,
      transcriptionText: s.transcriptionText,
      status: s.status,
      lines: s.lines
    }))
  )
  const hasPartial = lines.some((line) => line.partialText)
  const scrollRef = useRef<HTMLDivElement>(null)
  const following = useRef(true)
  const [detached, setDetached] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (el && following.current) el.scrollTop = el.scrollHeight
  }, [transcriptionText])

  if (
    !isTranscribing &&
    !isPaused &&
    !transcriptionText &&
    status !== 'error' &&
    status !== 'finishing'
  )
    return null
  const finishing = status === 'finishing'

  return (
    <div className="transcription-panel">
      <div className="transcription-heading">
        <Mic
          className={`size-3.5 shrink-0 ${isTranscribing ? 'text-emerald-300' : 'text-amber-200'}`}
        />
        <span role="status">
          {finishing ? labels.finishing : isPaused ? '已暂停' : labels[status]}
        </span>
        <AudioLevel />
        {hasPartial && <span className="text-amber-200/80">识别中</span>}
        {!hasPartial && transcriptionText && <span className="text-emerald-200/80">已确认</span>}
        <div className="ml-auto flex shrink-0 gap-0.5">
          {detached && (
            <Button
              size="icon"
              variant="ghost"
              aria-label="回到最新转录"
              onClick={() => {
                following.current = true
                setDetached(false)
                scrollRef.current!.scrollTop = scrollRef.current!.scrollHeight
              }}
            >
              <ArrowDown className="size-3.5" />
            </Button>
          )}
          {(isTranscribing || isPaused) && (
            <Button
              size="icon"
              variant="ghost"
              disabled={finishing}
              onClick={isPaused ? onResume : onPause}
              aria-label={isPaused ? '继续语音识别' : '暂停语音识别'}
            >
              {isPaused ? <Play className="size-3.5" /> : <Pause className="size-3.5" />}
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            aria-label="发送语音转录"
            disabled={!transcriptionText.trim() || finishing}
            onClick={() => void window.api.sendTranscriptionToChat()}
          >
            <Send className="size-3.5" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label="清除语音转录"
            disabled={!transcriptionText || finishing}
            onClick={() => void window.api.triggerAction('clearTranscription')}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </div>
      <div
        ref={scrollRef}
        className="transcription-scroll transcription-caption"
        onScroll={(event) => {
          const el = event.currentTarget
          following.current =
            el.scrollHeight - el.scrollTop - el.clientHeight <=
            appConfig.transcription.scrollFollowThresholdPx
          setDetached(!following.current)
        }}
      >
        <TranscriptLines lines={lines} />
        {!transcriptionText && (
          <span className="text-muted-foreground">
            {isPaused ? '语音识别已暂停' : '等待语音输入...'}
          </span>
        )}
      </div>
    </div>
  )
}
