import { useEffect, useState } from 'react'
import { ChevronLeft, ChevronRight, LoaderCircle } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { KnowledgePassage } from '../../../preload/contracts'

export function DocumentPreview({
  document,
  onClose
}: {
  document: { id: string; name: string } | null
  onClose: () => void
}) {
  const [passages, setPassages] = useState<KnowledgePassage[]>([])
  const [selected, setSelected] = useState(0)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    if (!document) return
    let active = true
    setBusy(true)
    setError('')
    setPassages([])
    setSelected(0)
    void window.api
      .previewKnowledgeDocument(document.id)
      .then((result) => {
        if (!active) return
        if (result.ok) setPassages(result.data)
        else setError(result.error)
      })
      .catch((error) => {
        if (active) setError(String(error))
      })
      .finally(() => {
        if (active) setBusy(false)
      })
    return () => {
      active = false
    }
  }, [document])
  const move = (step: number) =>
    setSelected((index) => Math.min(passages.length - 1, Math.max(0, index + step)))
  return (
    <Dialog
      open={document !== null}
      onOpenChange={(open) => {
        if (!open) onClose()
      }}
    >
      <DialogContent
        className="knowledge-preview-dialog sm:max-w-3xl"
        onKeyDown={(event) => {
          if (
            event.target instanceof HTMLInputElement ||
            event.target instanceof HTMLTextAreaElement ||
            !passages.length
          )
            return
          if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
            event.preventDefault()
            move(event.key === 'ArrowLeft' ? -1 : 1)
          }
        }}
      >
        <DialogTitle className="pr-6 break-all">{document?.name}</DialogTitle>
        <div className="flex items-center gap-2">
          <Button
            size="icon"
            variant="outline"
            aria-label="上一片段"
            disabled={selected === 0 || !passages.length}
            onClick={() => move(-1)}
          >
            <ChevronLeft className="size-4" />
          </Button>
          <output className="text-xs text-neutral-500">
            {passages.length ? selected + 1 : 0} / {passages.length}
          </output>
          <Button
            size="icon"
            variant="outline"
            aria-label="下一片段"
            disabled={selected >= passages.length - 1}
            onClick={() => move(1)}
          >
            <ChevronRight className="size-4" />
          </Button>
        </div>
        {busy ? (
          <LoaderCircle className="mx-auto size-5 animate-spin" />
        ) : error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : (
          <pre className="knowledge-passage-text max-h-[55vh] overflow-auto">
            {passages[selected]?.text ?? '暂无可预览片段'}
          </pre>
        )}
      </DialogContent>
    </Dialog>
  )
}
