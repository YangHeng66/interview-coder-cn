import { useMemo, useState } from 'react'
import { History, X } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export function ApiBaseUrlInput({
  id,
  value,
  history,
  placeholder,
  disabled,
  onChange,
  onCommit,
  onRemoveHistory
}: {
  id: string
  value: string
  history: string[]
  placeholder: string
  disabled?: boolean
  onChange: (value: string) => void
  onCommit: (value: string) => void
  onRemoveHistory: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const historyItems = useMemo(
    () => [...new Set(history.map((item) => item.trim()).filter(Boolean))],
    [history]
  )

  const commit = (nextValue: string) => {
    onCommit(nextValue.trim())
  }

  return (
    <div className="flex w-60 items-center">
      <input
        id={id}
        type="text"
        disabled={disabled}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => commit(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== 'Enter') return
          commit(event.currentTarget.value)
          event.currentTarget.blur()
        }}
        className="h-9 min-w-0 flex-1 rounded-l-md border border-r-0 border-gray-300 bg-white px-3 text-sm focus:z-10 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100 disabled:text-gray-500"
        placeholder={placeholder}
      />
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            disabled={disabled || historyItems.length === 0}
            aria-label="选择历史 API Base URL"
            data-tooltip={historyItems.length === 0 ? '暂无历史地址' : '历史地址'}
            className="flex size-9 shrink-0 items-center justify-center rounded-r-md border border-gray-300 bg-white text-gray-500 transition-colors hover:bg-gray-50 hover:text-gray-900 focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-not-allowed disabled:bg-gray-100 disabled:opacity-50"
          >
            <History className="size-4" />
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-72 p-1.5">
          <div className="px-2 py-1.5 text-xs font-medium text-gray-500">历史地址</div>
          <div className="max-h-52 overflow-y-auto">
            {historyItems.map((item) => (
              <div
                key={item}
                className="group flex min-w-0 items-center rounded-sm hover:bg-gray-100"
              >
                <button
                  type="button"
                  data-tooltip={item}
                  className="min-w-0 flex-1 truncate px-2 py-2 text-left text-xs"
                  onClick={() => {
                    onChange(item)
                    commit(item)
                    setOpen(false)
                  }}
                >
                  {item}
                </button>
                <button
                  type="button"
                  aria-label={`删除历史地址 ${item}`}
                  data-tooltip="删除历史地址"
                  className={cn(
                    'mr-1 flex size-7 shrink-0 items-center justify-center rounded-sm text-gray-400',
                    'hover:bg-white hover:text-red-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500'
                  )}
                  onClick={() => onRemoveHistory(item)}
                >
                  <X className="size-3.5" />
                </button>
              </div>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  )
}
