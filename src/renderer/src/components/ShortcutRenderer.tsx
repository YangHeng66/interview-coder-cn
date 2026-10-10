import { cn } from '@renderer/lib/utils'
import { getShortcutAcceleratorDisplay } from '@/lib/utils/keyboard'

export default function ShortcutRenderer({
  shortcut,
  className
}: {
  shortcut: string
  className?: string
}) {
  if (!shortcut) return <span className="text-xs text-muted-foreground">未绑定</span>
  const keys = getShortcutAcceleratorDisplay(shortcut).split('+')
  return (
    <span className={cn('inline-flex items-center gap-0.5 align-middle', className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-b-2 border-input bg-muted px-1 font-mono text-[11px] leading-none font-medium text-foreground"
        >
          {key}
        </kbd>
      ))}
    </span>
  )
}
