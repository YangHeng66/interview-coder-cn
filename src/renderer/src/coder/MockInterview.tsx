import { useState } from 'react'
import { Flag, UserRoundSearch } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { applyConversationViews } from '@/lib/conversations'
import { useChatStore } from '@/lib/store/chat'
import { useKnowledgeStore } from '@/lib/store/knowledge'
import { useSettingsStore } from '@/lib/store/settings'
import {
  MOCK_INTERVIEW_FOCUS_LABELS,
  MOCK_INTERVIEW_QUESTION_COUNTS,
  type MockInterviewFocus
} from '../../../preload/contracts'

const FOCUS_OPTIONS = Object.entries(MOCK_INTERVIEW_FOCUS_LABELS) as [MockInterviewFocus, string][]

function ChoiceButton({
  selected,
  onClick,
  children
}: {
  selected: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={selected ? 'default' : 'outline'}
      aria-pressed={selected}
      onClick={onClick}
    >
      {children}
    </Button>
  )
}

export function MockInterviewDialog({
  open,
  onOpenChange
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [questionCount, setQuestionCount] = useState<number>(5)
  const [focus, setFocus] = useState<MockInterviewFocus>('mixed')
  const [starting, setStarting] = useState(false)
  const profileName = useKnowledgeStore(
    (state) => state.snapshot.profiles.find((p) => p.id === state.snapshot.activeProfileId)?.name
  )
  const audioSource = useSettingsStore((state) => state.transcriptionAudioSource)
  const autoReply = useSettingsStore((state) => state.transcriptionAutoReply)
  const updateSetting = useSettingsStore((state) => state.updateSetting)

  const start = async () => {
    setStarting(true)
    try {
      const result = await window.api.startMockInterview({ questionCount, focus })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      applyConversationViews(result.views)
      onOpenChange(false)
    } finally {
      setStarting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogTitle>模拟面试</DialogTitle>
        <p className="text-sm text-muted-foreground">
          {profileName
            ? `将根据当前岗位「${profileName}」的 JD 与重点资料出题。`
            : '未选择岗位，将按通用前端开发岗位出题。'}
          AI 每次提一个问题，你作答后它会点评并继续下一题。
        </p>

        <div className="space-y-2">
          <div className="text-sm font-medium">题目数量</div>
          <div className="flex gap-2">
            {MOCK_INTERVIEW_QUESTION_COUNTS.map((count) => (
              <ChoiceButton
                key={count}
                selected={questionCount === count}
                onClick={() => setQuestionCount(count)}
              >
                {count} 题
              </ChoiceButton>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="text-sm font-medium">侧重</div>
          <div className="flex flex-wrap gap-2">
            {FOCUS_OPTIONS.map(([value, label]) => (
              <ChoiceButton key={value} selected={focus === value} onClick={() => setFocus(value)}>
                {label}
              </ChoiceButton>
            ))}
          </div>
        </div>

        {(audioSource === 'system' || !autoReply) && (
          <div className="space-y-2 rounded-md border border-border p-3 text-xs text-muted-foreground">
            <p>语音作答建议：</p>
            {audioSource === 'system' && (
              <div className="flex items-center justify-between gap-2">
                <span>当前语音来源为系统音频，录不到你的回答</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateSetting('transcriptionAudioSource', 'microphone')}
                >
                  改为麦克风
                </Button>
              </div>
            )}
            {!autoReply && (
              <div className="flex items-center justify-between gap-2">
                <span>开启语音自动回答后，说完会自动提交作答</span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => updateSetting('transcriptionAutoReply', true)}
                >
                  开启
                </Button>
              </div>
            )}
            <p>也可以直接在输入框里打字作答。</p>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button disabled={starting} onClick={() => void start()}>
            开始面试
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

/** Progress strip shown above a mock interview conversation */
export function MockInterviewBar() {
  const mockInterview = useChatStore((state) => state.mockInterview)
  const asked = useChatStore(
    (state) => state.messages.filter((message) => message.role === 'assistant').length
  )
  const [ending, setEnding] = useState(false)
  if (!mockInterview) return null
  const ended = Boolean(mockInterview.endedAt)

  const end = async () => {
    setEnding(true)
    try {
      const result = await window.api.endMockInterview()
      if (!result.ok) toast.error(result.error)
      else applyConversationViews(result.views)
    } finally {
      setEnding(false)
    }
  }

  return (
    <div className="mr-auto flex items-center gap-2 text-xs text-primary">
      <UserRoundSearch className="size-3.5" />
      <span>
        模拟面试 · {MOCK_INTERVIEW_FOCUS_LABELS[mockInterview.focus]} ·{' '}
        {ended
          ? '已结束'
          : `第 ${Math.min(Math.max(asked, 1), mockInterview.questionCount)} / ${mockInterview.questionCount} 题`}
      </span>
      {!ended && (
        <Button
          size="sm"
          variant="outline"
          className="h-6 px-2 text-xs"
          disabled={ending}
          onClick={() => void end()}
        >
          <Flag className="size-3" />
          结束并评分
        </Button>
      )}
    </div>
  )
}
