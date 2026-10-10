import { useState } from 'react'
import { Loader2, Pointer, PointerOff, OctagonX, MessageCircle } from 'lucide-react'
import { useSolutionStore } from '@/lib/store/solution'
import { useShortcutsStore } from '@/lib/store/shortcuts'
import { useAppStore } from '@/lib/store/app'
import ShortcutRenderer from '@/components/ShortcutRenderer'
import { Button } from '@/components/ui/button'
import { Dialog, DialogTitle, DialogContent, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

export function AppStatusBar() {
  const {
    isLoading: isReceivingSolution,
    setIsLoading,
    screenshotData,
    solutionChunks
  } = useSolutionStore()
  const { ignoreMouse } = useAppStore()
  const { shortcuts } = useShortcutsStore()
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [questionInput, setQuestionInput] = useState('')

  const handleStop = () => {
    setIsLoading(false)
    void window.api.stopSolutionStream()
  }

  const handleFollowUpClick = () => {
    setIsDialogOpen(true)
  }

  const handleDialogClose = () => {
    setIsDialogOpen(false)
    setQuestionInput('')
  }

  const handleSubmitQuestion = async () => {
    if (!questionInput.trim()) return

    setIsLoading(true)
    setIsDialogOpen(false)
    const question = questionInput.trim()
    setQuestionInput('')

    try {
      await window.api.sendFollowUpQuestion(question)
    } catch (error) {
      console.error('Error sending follow-up question:', error)
      setIsLoading(false)
    }
  }

  const hasActiveConversation = screenshotData && solutionChunks.length > 0

  return (
    <div className="screenshot-status flex shrink-0 flex-wrap items-center justify-between gap-2 border-t border-border px-4 py-2 text-sm text-muted-foreground">
      <div>
        {isReceivingSolution ? (
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-2 text-foreground" role="status">
              <Loader2 className="size-4 animate-spin" />
              正在生成…
            </span>
            <Button variant="secondary" size="sm" onClick={handleStop}>
              <OctagonX />
              停止生成
              <ShortcutRenderer shortcut={shortcuts.stopSolutionStream.key} />
            </Button>
          </div>
        ) : hasActiveConversation ? (
          <div className="flex items-center gap-4 select-none">
            <span className="flex items-center gap-1.5">
              <ShortcutRenderer shortcut={shortcuts.appendScreenshot.key} />
              追加截图
            </span>
            <span className="flex items-center gap-1.5">
              <ShortcutRenderer shortcut={shortcuts.takeScreenshot.key} />
              新开对话
            </span>
          </div>
        ) : null}
      </div>
      <div className="flex items-center gap-3 select-none">
        {hasActiveConversation && !isReceivingSolution && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleFollowUpClick}
            className="text-foreground hover:bg-accent dark:hover:bg-accent"
          >
            <MessageCircle />
            追问问题
          </Button>
        )}
        {ignoreMouse ? (
          <span className="flex items-center gap-1.5 text-xs text-amber-200">
            <PointerOff className="size-4" />
            鼠标透传中，按
            <ShortcutRenderer shortcut={shortcuts.ignoreOrEnableMouse.key} />
            取消
          </span>
        ) : (
          <Pointer className="size-4" aria-hidden />
        )}
      </div>

      {/* Follow-up Question Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogTitle className="sr-only">追问问题</DialogTitle>
        <DialogContent>
          <div className="py-4">
            <Textarea
              placeholder="请输入追问内容，按 Ctrl+Enter 提交..."
              value={questionInput}
              className="min-h-24"
              onChange={(e) => setQuestionInput(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault()
                  handleSubmitQuestion()
                }
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={handleDialogClose}>
              取消
            </Button>
            <Button onClick={handleSubmitQuestion} disabled={!questionInput.trim()}>
              提交
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
