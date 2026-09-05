import { useEffect, useMemo, useState } from 'react'
import { Image, ChevronDown, ChevronRight } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useSettingsStore } from '@/lib/store/settings'
import { createStreamBatch } from '@/lib/stream-batch'
import { useShortcutsStore } from '@/lib/store/shortcuts'
import { useSolutionStore } from '@/lib/store/solution'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import ShortcutRenderer from '@/components/ShortcutRenderer'
import { KnowledgeSources } from '@/components/KnowledgeSources'
import { useKnowledgeStore } from '@/lib/store/knowledge'

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
  const { screenshotsCollapsed, updateSetting } = useSettingsStore()
  const batch = useMemo(() => createStreamBatch(addSolutionChunk), [addSolutionChunk])
  const visionContext = useKnowledgeStore((state) => state.visionContext)
  const clearVisionContext = useKnowledgeStore((state) => state.clearVisionContext)

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
      {/* Error Banner */}
      {errorMessage && (
        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-lg flex items-start gap-3">
          <svg
            className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <div className="flex-1 min-w-0">
            <p className="text-red-400 font-medium text-sm">API 调用失败</p>
            <p className="text-red-300/80 text-sm mt-0.5 break-words">{errorMessage}</p>
          </div>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-red-400/80 hover:text-red-300 flex-shrink-0"
            aria-label="关闭错误提示"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
      )}

      {/* Screenshot Gallery */}
      {(recentScreenshots.length > 0 || screenshotData) && (
        <button
          type="button"
          className="mb-2 flex items-center gap-2 text-xs text-neutral-300"
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
                    className="h-20 w-32 object-contain border border-white/15 rounded bg-black/20"
                  />
                </button>
              ))}
            </div>
          ) : screenshotData ? (
            <div className="mb-4">
              <img
                src={`data:image/png;base64,${screenshotData}`}
                alt="Screenshot"
                className="w-40 h-auto border border-gray-600 rounded-lg shadow-lg"
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
      <MarkdownRenderer>{solutionChunks.join('')}</MarkdownRenderer>
    </div>
  )
}

function ShortcutTip() {
  const { shortcuts } = useShortcutsStore()
  return (
    <div className="flex items-center justify-center h-full text-xl text-gray-400 select-none">
      请按下快捷键
      <ShortcutRenderer
        shortcut={shortcuts.takeScreenshot.key}
        className="mx-1 font-bold text-black"
      />
      抓取屏幕进行分析
    </div>
  )
}
