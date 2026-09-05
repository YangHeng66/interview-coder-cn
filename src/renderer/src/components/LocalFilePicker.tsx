import { useEffect, useState } from 'react'
import { usePicker } from '@/lib/local-file-picker'
import { ArrowUp, FileText, Folder, Home, ArrowRight } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import type { LocalDirectory } from '../../../preload/contracts'

export function LocalFilePicker() {
  const { request, resolve } = usePicker()
  const [directory, setDirectory] = useState<LocalDirectory | null>(null)
  const [path, setPath] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const browse = async (target: string | null) => {
    setLoading(true)
    setError('')
    try {
      const next = await window.api.browseLocalDirectory(target)
      setDirectory(next)
      setPath(next.path)
      setSelected([])
    } catch (error) {
      setError(String(error))
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    if (request) {
      setSelected([])
      void browse(null)
    }
  }, [request])
  const finish = (paths: string[]) => {
    resolve!(paths)
    usePicker.setState({ request: null, resolve: null })
  }
  return (
    <Dialog
      open={request !== null}
      onOpenChange={(open) => {
        if (!open) finish([])
      }}
    >
      <DialogContent className="sm:max-w-2xl">
        <DialogTitle>{request?.title}</DialogTitle>
        <form
          className="flex min-w-0 items-center gap-1"
          onSubmit={(event) => {
            event.preventDefault()
            void browse(path)
          }}
        >
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="上级目录"
            disabled={loading || !directory || directory.path === directory.parent}
            onClick={() => void browse(directory!.parent)}
          >
            <ArrowUp className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="文档目录"
            disabled={loading}
            onClick={() => void browse(null)}
          >
            <Home className="size-4" />
          </Button>
          <input
            aria-label="目录路径"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            className="min-w-0 flex-1 rounded border px-2 py-1.5 text-sm"
          />
          <Button
            type="submit"
            size="icon"
            variant="ghost"
            disabled={loading || !path.trim()}
            aria-label="打开目录"
          >
            <ArrowRight className="size-4" />
          </Button>
        </form>
        <div className="h-72 overflow-auto rounded border" aria-busy={loading}>
          {directory?.entries
            .filter(
              (entry) =>
                entry.directory ||
                (request?.mode === 'files' &&
                  request.extensions.some((extension) =>
                    entry.name.toLowerCase().endsWith(extension)
                  ))
            )
            .map((entry) =>
              entry.directory ? (
                <button
                  type="button"
                  key={entry.path}
                  disabled={loading}
                  onClick={() => void browse(entry.path)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-100"
                >
                  <Folder className="size-4 shrink-0 text-amber-600" />
                  <span className="break-all">{entry.name}</span>
                </button>
              ) : (
                <label
                  key={entry.path}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-neutral-100"
                >
                  <input
                    type="checkbox"
                    disabled={loading}
                    checked={selected.includes(entry.path)}
                    onChange={(event) =>
                      setSelected((current) =>
                        event.target.checked
                          ? request!.multiple
                            ? [...current, entry.path]
                            : [entry.path]
                          : current.filter((path) => path !== entry.path)
                      )
                    }
                  />
                  <FileText className="size-4 shrink-0 text-neutral-500" />
                  <span className="break-all">{entry.name}</span>
                </label>
              )
            )}
        </div>
        {error && (
          <p role="alert" className="break-all text-sm text-red-700">
            {error}
          </p>
        )}
        <DialogFooter>
          <span className="mr-auto min-w-0 break-all text-xs text-neutral-500">
            {request?.mode === 'files' ? `已选 ${selected.length} 个文件` : directory?.path}
          </span>
          <Button variant="outline" onClick={() => finish([])}>
            取消
          </Button>
          <Button
            disabled={loading || !directory || (request?.mode === 'files' && !selected.length)}
            onClick={() => finish(request?.mode === 'directory' ? [directory!.path] : selected)}
          >
            选择
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
