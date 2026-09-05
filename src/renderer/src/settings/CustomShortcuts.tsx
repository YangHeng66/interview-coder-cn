import { useState, useEffect } from 'react'
import { Pencil, RotateCcw, X, Keyboard } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import ShortcutRenderer from '@/components/ShortcutRenderer'
import { getShortcutAccelerator, isModifierKey } from '@/lib/utils/keyboard'
import { shortcutDefinitions, useShortcutsStore } from '@/lib/store/shortcuts'

export function CustomShortcuts() {
  const { shortcuts, registrations, setRegistrations, updateShortcut, setRecording } =
    useShortcutsStore()
  const [recordingAction, setRecordingAction] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    void window.api.getShortcuts().then(setRegistrations)
    return () => {
      setRecording(false)
      void window.api.setShortcutRecording(false).then(setRegistrations)
    }
  }, [setRegistrations, setRecording])

  const finishRecording = async () => {
    setRecordingAction(null)
    setRecording(false)
    setRegistrations(await window.api.setShortcutRecording(false))
  }

  const apply = async (action: string, key: string) => {
    setRecordingAction(null)
    const shortcut = { ...shortcuts[action], key }
    updateShortcut(action, shortcut)
    setRegistrations(await window.api.updateShortcuts([shortcut]))
    await finishRecording()
  }

  useEffect(() => {
    if (!recordingAction) return
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (event.repeat || isModifierKey(event.code)) return
      if (event.code === 'Escape') {
        void finishRecording()
        return
      }
      const key = getShortcutAccelerator(event)
      if (!key) {
        setMessage('此按键组合不可用')
        return
      }
      void apply(recordingAction, key)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  })

  return (
    <div className="shortcut-editor">
      <input
        aria-label="搜索快捷键操作"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="搜索操作"
        className="shortcut-search"
      />
      <div className="shortcut-table-head">
        <span>操作</span>
        <span>快捷键</span>
        <span>状态 / 范围</span>
        <span />
      </div>
      {Object.entries(shortcutDefinitions)
        .filter(([, value]) => value.label.includes(search) || value.category.includes(search))
        .map(([action, definition]) => {
          const shortcut = shortcuts[action]
          const registration = registrations[action]
          const isRecording = recordingAction === action
          const status = registration?.status
          const statusText = !shortcut.key
            ? '未绑定'
            : status === 'registered'
              ? '已生效'
              : status === 'failed'
                ? '注册失败'
                : status === 'conflict'
                  ? '按键重复'
                  : '待注册'
          const conflict = registration?.conflictAction
          return (
            <div className="shortcut-row" key={action}>
              <div>
                <div className="font-medium">{definition.label}</div>
                <div className="text-xs text-neutral-500">{definition.category}</div>
              </div>
              <button
                type="button"
                className={`shortcut-binding ${isRecording ? 'is-recording' : ''}`}
                aria-label={`修改${definition.label}快捷键`}
                onClick={async () => {
                  if (isRecording) {
                    await finishRecording()
                    return
                  }
                  setMessage('')
                  setRecording(true)
                  await window.api.setShortcutRecording(true)
                  setRecordingAction(action)
                }}
              >
                {isRecording ? (
                  <>
                    <Keyboard className="size-4" />
                    录制中
                  </>
                ) : shortcut.key ? (
                  <ShortcutRenderer shortcut={shortcut.key} />
                ) : (
                  <>
                    <Pencil className="size-3" />
                    设置
                  </>
                )}
              </button>
              <div className="min-w-0 text-xs">
                <div
                  className={
                    status === 'failed' || status === 'conflict'
                      ? 'text-red-700'
                      : 'text-emerald-700'
                  }
                >
                  {statusText}
                </div>
                <div className="text-neutral-500">
                  {definition.scope === 'global' ? '全局' : '应用内'}
                </div>
                {conflict && (
                  <div className="break-words text-red-700">
                    {shortcutDefinitions[conflict as keyof typeof shortcutDefinitions].label}
                  </div>
                )}
              </div>
              <div className="flex items-center justify-end gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`恢复${definition.label}默认快捷键`}
                  onClick={() => void apply(action, shortcut.defaultKey)}
                >
                  <RotateCcw className="size-3.5" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={`清除${definition.label}快捷键`}
                  disabled={!shortcut.key && !isRecording}
                  onClick={() => void apply(action, '')}
                >
                  <X className="size-3.5" />
                </Button>
              </div>
            </div>
          )
        })}
      {recordingAction && (
        <div className="flex items-center justify-between text-sm">
          <span>{message || '等待按键'}</span>
          <Button size="sm" variant="outline" onClick={() => void finishRecording()}>
            <X className="size-3" />
            取消
          </Button>
        </div>
      )}
    </div>
  )
}

export function ResetDefaultShortcuts() {
  return (
    <Button
      variant="outline"
      size="sm"
      onClick={async () => {
        const store = useShortcutsStore.getState()
        store.resetShortcuts()
        store.setRegistrations(
          await window.api.updateShortcuts(Object.values(useShortcutsStore.getState().shortcuts))
        )
        toast.success('已恢复默认配置')
      }}
    >
      <RotateCcw className="size-3.5" />
      恢复默认
    </Button>
  )
}
