import { useState } from 'react'
import {
  Check,
  ClipboardList,
  Download,
  History,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  X
} from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store/app'
import { applyConversationViews } from '@/lib/conversations'
import type { ConversationSummary } from '../../../preload/contracts'

type Selection = { purpose: 'review' | 'delete'; ids: Set<string> }

export function ConversationHistory() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<ConversationSummary[]>([])
  const [activeIds, setActiveIds] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const [title, setTitle] = useState('')
  const [deleting, setDeleting] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  /** null when not picking conversations for a review report or a batch delete */
  const [selection, setSelection] = useState<Selection | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const mode = useAppStore((state) => state.assistantMode)
  const visibleItems = items.filter((item) =>
    item.title.toLowerCase().includes(search.toLowerCase())
  )
  const selectedVisible = visibleItems.filter((item) => selection?.ids.has(item.id)).length
  const allVisibleSelected = visibleItems.length > 0 && selectedVisible === visibleItems.length
  const deletingActive = activeIds.some((id) => selection?.ids.has(id))
  const refresh = async () => {
    const result = await window.api.getConversations()
    setItems(result.conversations)
    setActiveIds(Object.values(result.active).filter((id) => id !== null))
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
  const startSelection = (purpose: Selection['purpose']) => {
    setEditing(null)
    setDeleting(null)
    setSelection({ purpose, ids: new Set() })
  }
  const toggleItem = (id: string) =>
    setSelection((current) => {
      if (!current) return current
      const ids = new Set(current.ids)
      if (ids.has(id)) ids.delete(id)
      else ids.add(id)
      return { ...current, ids }
    })
  const toggleAllVisible = () =>
    setSelection((current) => {
      if (!current) return current
      const ids = new Set(current.ids)
      visibleItems.forEach((item) => (allVisibleSelected ? ids.delete(item.id) : ids.add(item.id)))
      return { ...current, ids }
    })
  const generateReview = () =>
    perform(async () => {
      const result = await window.api.generateReviewReport([...(selection?.ids ?? [])])
      if (!result.ok) {
        setMessage(result.error)
        return
      }
      applyConversationViews(result.views)
      setSelection(null)
      setOpen(false)
    })
  const deleteSelected = () => {
    const ids = [...(selection?.ids ?? [])]
    setConfirmingDelete(false)
    return perform(async () => {
      applyConversationViews(await window.api.deleteConversations(ids))
      setSelection(null)
      await refresh()
    })
  }
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
          if (!next) {
            setSelection(null)
            setConfirmingDelete(false)
          }
        }}
      >
        <DialogContent className="conversation-dialog sm:max-w-2xl">
          <div className="flex items-center justify-between gap-2 pr-8">
            <DialogTitle>历史会话</DialogTitle>
            {selection?.purpose === 'delete' ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelection(null)}>
                  退出多选
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  disabled={busy || selection.ids.size === 0}
                  onClick={() => setConfirmingDelete(true)}
                >
                  <Trash2 className="size-3.5" />
                  删除所选（{selection.ids.size}）
                </Button>
              </div>
            ) : selection ? (
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setSelection(null)}>
                  取消
                </Button>
                <Button
                  size="sm"
                  disabled={busy || selection.ids.size === 0}
                  onClick={() => void generateReview()}
                >
                  生成复盘（{selection.ids.size}）
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !items.length}
                  onClick={() => startSelection('delete')}
                >
                  <ListChecks className="size-3.5" />
                  批量删除
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={busy || !items.length}
                  onClick={() => startSelection('review')}
                >
                  <ClipboardList className="size-3.5" />
                  面试复盘
                </Button>
              </div>
            )}
          </div>
          {selection?.purpose === 'review' && (
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
          {selection?.purpose === 'delete' && (
            <div className="flex items-center justify-between gap-2 text-xs">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 shrink-0 accent-primary"
                  ref={(element) => {
                    if (element) element.indeterminate = selectedVisible > 0 && !allVisibleSelected
                  }}
                  checked={allVisibleSelected}
                  disabled={!visibleItems.length}
                  onChange={toggleAllVisible}
                />
                {allVisibleSelected ? '取消全选' : '全选'}
              </label>
              <span className="text-muted-foreground">已选 {selection.ids.size} 条</span>
            </div>
          )}
          <div className="max-h-[55vh] overflow-y-auto">
            {visibleItems.map((item) => (
              <div key={item.id} className="conversation-row">
                {selection && (
                  <input
                    type="checkbox"
                    className="size-4 shrink-0 accent-primary"
                    aria-label={`选择${item.title}`}
                    checked={selection.ids.has(item.id)}
                    onChange={() => toggleItem(item.id)}
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
                        selection
                          ? toggleItem(item.id)
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
                <div className={selection ? 'hidden' : 'flex shrink-0 gap-1'}>
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
          <Dialog open={confirmingDelete} onOpenChange={setConfirmingDelete}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>删除 {selection?.ids.size ?? 0} 条会话？</DialogTitle>
                <DialogDescription>
                  删除后无法恢复，会话中的截图等资源会一并删除。
                  {deletingActive && '所选会话包含当前打开的会话，删除后将切换到新会话。'}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setConfirmingDelete(false)}>
                  取消
                </Button>
                <Button variant="destructive" disabled={busy} onClick={() => void deleteSelected()}>
                  删除
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </>
  )
}
