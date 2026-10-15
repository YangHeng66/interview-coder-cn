import { useState } from 'react'
import { Check, ClipboardList, Download, History, Pencil, Plus, Trash2, X } from 'lucide-react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store/app'
import { applyConversationViews } from '@/lib/conversations'
import type { ConversationSummary } from '../../../preload/contracts'

export function ConversationHistory() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ConversationSummary[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  /** null when not picking conversations for a review report */
  const [reviewSelection, setReviewSelection] = useState<Set<string> | null>(null)
  const mode = useAppStore((state) => state.assistantMode)
  const refresh = async () => {
    const result = await window.api.getConversations()
    setItems(result.conversations)
    if (result.error) setMessage(result.error)
  }
  const perform = async (action: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await action()
    } catch (error) {
      setMessage(String(error))
    } finally {
      setBusy(false)
    }
  }
  const toggleReviewItem = (id: string) =>
    setReviewSelection((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  const generateReview = () =>
    perform(async () => {
      const result = await window.api.generateReviewReport([...(reviewSelection ?? [])])
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      applyConversationViews(result.views)
      setReviewSelection(null)
      setOpen(false)
    })
  return (
    <>
      <button
        type="button"
        aria-label="历史会话"
        onClick={() => {
          setOpen(true)
          void perform(refresh)
        }}
      >
        <History className="size-4" />
      </button>
      <button
        type="button"
        aria-label="新建会话"
        disabled={busy}
        onClick={() =>
          void perform(async () => {
            applyConversationViews(await window.api.newConversation(mode))
          })
        }
      >
        <Plus className="size-4" />
      </button>
      {message && !open && (
        <span role="status" className="max-w-48 truncate text-xs text-red-300">
          {message}
        </span>
      )}
      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next)
          if (!next) setReviewSelection(null)
        }}
      >
        <DialogContent className="conversation-dialog sm:max-w-2xl">
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle>历史会话</DialogTitle>
            {reviewSelection ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setReviewSelection(null)}>
                  取消
                </Button>
                <Button
                  size="sm"
                  disabled={busy || reviewSelection.size === 0}
                  onClick={() => void generateReview()}
                >
                  生成复盘（{reviewSelection.size}）
                </Button>
              </div>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={busy || !items.length}
                onClick={() => setReviewSelection(new Set())}
              >
                <ClipboardList className="size-3.5" />
                面试复盘
              </Button>
            )}
          </div>
          {reviewSelection && (
            <p className="text-xs text-muted-foreground">
              勾选同一场面试的会话，AI 会汇总问答生成复盘报告（使用文字对话模型）
            </p>
          )}
          <input
            aria-label="搜索历史会话"
            placeholder="搜索会话标题"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="rounded border px-3 py-2 text-sm"
          />
          <div className="max-h-[55vh] overflow-y-auto">
            {items
              .filter((item) => item.title.toLowerCase().includes(search.toLowerCase()))
              .map((item) => (
                <div key={item.id} className="conversation-row">
                  {reviewSelection && (
                    <input
                      type="checkbox"
                      className="size-4 shrink-0 accent-primary"
                      aria-label={`选择${item.title}`}
                      checked={reviewSelection.has(item.id)}
                      onChange={() => toggleReviewItem(item.id)}
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    {editing === item.id ? (
                      <div className="flex gap-1">
                        <input
                          aria-label="会话名称"
                          value={title}
                          onChange={(event) => setTitle(event.target.value)}
                          className="min-w-0 flex-1 rounded border px-2 py-1 text-sm"
                        />
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="保存会话名称"
                          disabled={busy || !title.trim()}
                          onClick={() =>
                            void perform(async () => {
                              await window.api.renameConversation(item.id, title)
                              setEditing(null)
                              await refresh()
                            })
                          }
                        >
                          <Check className="size-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="取消重命名"
                          onClick={() => setEditing(null)}
                        >
                          <X className="size-4" />
                        </Button>
                      </div>
                    ) : (
                      <button
                        className="block w-full truncate text-left text-sm font-medium"
                        disabled={busy}
                        onClick={() =>
                          reviewSelection
                            ? toggleReviewItem(item.id)
                            : void perform(async () => {
                                applyConversationViews(await window.api.openConversation(item.id))
                                setOpen(false)
                              })
                        }
                      >
                        {item.title}
                      </button>
                    )}
                    <div className="mt-1 text-xs text-muted-foreground">
                      {item.mode === 'chat' ? '文字' : '截图'} ·{' '}
                      {new Date(item.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className={reviewSelection ? 'hidden' : 'flex shrink-0 gap-1'}>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`重命名${item.title}`}
                      disabled={busy}
                      onClick={() => {
                        setEditing(item.id)
                        setTitle(item.title)
                      }}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`导出${item.title}`}
                      disabled={busy}
                      onClick={() =>
                        void perform(async () => {
                          const path = await window.api.exportConversation(item.id)
                          setMessage(`已导出：${path}`)
                        })
                      }
                    >
                      <Download className="size-3.5" />
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`删除${item.title}`}
                      disabled={busy}
                      onClick={() => setDeleting(item.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                  {deleting === item.id && (
                    <div className="flex w-full items-center justify-end gap-2 text-xs">
                      <span>删除此会话？</span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy}
                        onClick={() => setDeleting(null)}
                      >
                        取消
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        disabled={busy}
                        onClick={() =>
                          void perform(async () => {
                            applyConversationViews(await window.api.deleteConversation(item.id))
                            setDeleting(null)
                            await refresh()
                          })
                        }
                      >
                        删除
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            {!items.length && (
              <p className="py-10 text-center text-sm text-muted-foreground">暂无历史会话</p>
            )}
          </div>
          {message && (
            <p role="status" className="break-all text-xs">
              {message}
            </p>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
