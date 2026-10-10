import { useEffect, useMemo, useState } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronRight, Copy, Image, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { IconButton } from '@/components/ui/icon-button'
import { useSettingsStore } from '@/lib/store/settings'
import { createStreamBatch } from '@/lib/stream-batch'
import { useShortcutsStore } from '@/lib/store/shortcuts'
import { useSolutionStore } from '@/lib/store/solution'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import ShortcutRenderer from '@/components/ShortcutRenderer'
import { KnowledgeSources } from '@/components/KnowledgeSources'
import { useKnowledgeStore } from '@/lib/store/knowledge'
import { toast } from 'sonner'

const SCROLL_OFFSET = 120

export function AppContent() {
  const {
    screenshotData,
    recentScreenshots,
    setRecentScreenshots,
    solutionChunks,
    errorMessage,
    setScreenshotData,
    setIsLoading,
    addSolutionChunk,
    setErrorMessage,
    clearSolution
  } = useSolutionStore()

  const [preview, setPreview] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const { screenshotsCollapsed, updateSetting } = useSettingsStore()
  const batch = useMemo(() => createStreamBatch(addSolutionChunk), [addSolutionChunk])
  const visionContext = useKnowledgeStore((state) => state.visionContext)
  const clearVisionContext = useKnowledgeStore((state) => state.clearVisionContext)

  const copySolution = async () => {
    const solution = solutionChunks.join('').trim()
    if (!solution) return
    try {
      await window.api.writeClipboardText(solution)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      toast.error(`复制回答失败：${String(error)}`)
    }
  }

  useEffect(() => {
    window.addEventListener('conversation-restored', batch.clear)
    // Listen for screenshot events (latest)
    window.api.onScreenshotTaken((data: string) => {
      setScreenshotData(data)
    })

    // Listen for screenshots-updated events (gallery)
    window.api.onScreenshotsUpdated((screenshots: string[]) => {
      setRecentScreenshots(screenshots)
    })

    // New session clear (pictures + answers)
    window.api.onSolutionClear(() => {
      batch.clear()
      clearSolution()
      setRecentScreenshots([])
      setScreenshotData(null)
      setErrorMessage(null)
      clearVisionContext()
    })

    // Listen for solution chunks
    window.api.onSolutionChunk((chunk: string) => {
      batch.push(chunk)
    })

    // AI loading
    window.api.onAiLoadingStart(() => {
      setIsLoading(true)
      setErrorMessage(null) // Clear error when new request starts
    })
    window.api.onAiLoadingEnd(() => {
      batch.flush()
      setIsLoading(false)
    })

    // Cleanup listeners on unmount
    return () => {
      batch.clear()
      window.removeEventListener('conversation-restored', batch.clear)
      window.api.removeScreenshotListener()
      window.api.removeScreenshotsUpdatedListener()
      window.api.removeSolutionChunkListener()
      window.api.removeAiLoadingStartListener()
      window.api.removeAiLoadingEndListener()
      window.api.removeSolutionClearListener()
    }
  }, [
    setScreenshotData,
    clearSolution,
    setIsLoading,
    addSolutionChunk,
    setErrorMessage,
    clearVisionContext,
    batch,
    setRecentScreenshots
  ])

  useEffect(() => {
    window.api.onSolutionComplete(() => {
      batch.flush()
      setIsLoading(false)
    })
    window.api.onSolutionStopped(() => {
      batch.flush()
      setIsLoading(false)
    })
    window.api.onSolutionError((message: string) => {
      batch.flush()
      setIsLoading(false)
      setErrorMessage(message)
    })
    return () => {
      window.api.removeSolutionCompleteListener()
      window.api.removeSolutionStoppedListener()
      window.api.removeSolutionErrorListener()
    }
  }, [setIsLoading, setErrorMessage, batch])

  useEffect(() => {
    window.api.onScrollPageUp(() => {
      const container = document.getElementById('app-content')
      if (!container) return
      container.scrollTo({
        top: container.scrollTop - window.innerHeight + SCROLL_OFFSET,
        behavior: 'smooth'
      })
    })
    return () => {
      window.api.removeScrollPageUpListener()
    }
  }, [])

  useEffect(() => {
    window.api.onScrollPageDown(() => {
      const container = document.getElementById('app-content')
      if (!container) return
      container.scrollTo({
        top: container.scrollTop + window.innerHeight - SCROLL_OFFSET,
        behavior: 'smooth'
      })
    })
    return () => {
      window.api.removeScrollPageDownListener()
    }
  }, [])

  return (
    <div id="app-content" className="px-6 py-4">
      <div className="mx-auto w-full max-w-3xl">
        {/* Error Banner */}
        {errorMessage && (
          <div
            role="alert"
            className="mb-4 flex items-start gap-3 rounded-lg border border-red-400/40 bg-red-500/15 p-3"
          >
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-red-300" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-red-200">API 调用失败</p>
              <p className="mt-0.5 text-sm break-words text-red-100/85">{errorMessage}</p>
            </div>
            <IconButton
              size="sm"
              className="text-red-200 hover:bg-red-400/20 hover:text-red-50 dark:hover:bg-red-400/20"
              onClick={() => setErrorMessage(null)}
              aria-label="关闭错误提示"
            >
              <X />
            </IconButton>
          </div>
        )}

        {/* Screenshot Gallery */}
        {(recentScreenshots.length > 0 || screenshotData) && (
          <button
            type="button"
            className="mb-2 flex items-center gap-2 rounded text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={!screenshotsCollapsed}
            onClick={() => updateSetting('screenshotsCollapsed', !screenshotsCollapsed)}
          >
            {screenshotsCollapsed ? (
              <ChevronRight className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            <Image className="size-3.5" />
            截图 {recentScreenshots.length || 1}
          </button>
        )}
        {!screenshotsCollapsed && (
          <>
            {recentScreenshots.length > 0 ? (
              <div className="mb-4 flex gap-2 overflow-x-auto pb-2">
                {recentScreenshots.map((data, index) => (
                  <button
                    type="button"
                    key={index}
                    className="shrink-0"
                    aria-label={`查看第 ${index + 1} 张截图`}
                    onClick={() => setPreview(data)}
                  >
                    <img
                      key={index}
                      src={`data:image/png;base64,${data}`}
                      alt={`Screenshot ${index + 1}`}
                      className="h-20 w-32 rounded border border-border bg-black/20 object-contain transition-colors hover:border-primary"
                    />
                  </button>
                ))}
              </div>
            ) : screenshotData ? (
              <div className="mb-4">
                <img
                  src={`data:image/png;base64,${screenshotData}`}
                  alt="Screenshot"
                  className="h-auto w-40 rounded-lg border border-border shadow-lg"
                />
              </div>
            ) : (
              <ShortcutTip />
            )}
          </>
        )}
        {screenshotsCollapsed && !screenshotData && <ShortcutTip />}
        <Dialog
          open={preview !== null}
          onOpenChange={(open) => {
            if (!open) setPreview(null)
          }}
        >
          <DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl">
            <DialogTitle>截图</DialogTitle>
            {preview && (
              <img
                src={`data:image/png;base64,${preview}`}
                alt="截图原图"
                className="h-auto w-full"
              />
            )}
          </DialogContent>
        </Dialog>

        {/* Solution Display */}
        <KnowledgeSources context={visionContext} className="mb-2" />
        {solutionChunks.join('').trim() && (
          <div className="mb-1 flex justify-end">
            <IconButton
              size="sm"
              onClick={() => void copySolution()}
              aria-label={copied ? '已复制回答' : '复制回答'}
            >
              {copied ? <Check className="text-primary" /> : <Copy />}
            </IconButton>
          </div>
        )}
        <MarkdownRenderer>{solutionChunks.join('')}</MarkdownRenderer>
      </div>
    </div>
  )
}

function ShortcutTip() {
  const { shortcuts } = useShortcutsStore()
  return (
    <div className="flex h-full min-h-40 flex-wrap items-center justify-center gap-2 text-base text-muted-foreground select-none">
      请按下快捷键
      <ShortcutRenderer shortcut={shortcuts.takeScreenshot.key} />
      抓取屏幕进行分析
    </div>
  )
}
