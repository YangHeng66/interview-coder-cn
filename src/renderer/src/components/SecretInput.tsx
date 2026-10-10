import { useState } from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'

export function SecretInput({
  id,
  value,
  onChange,
  placeholder,
  label,
  className
}: {
  id: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  /** Names the secret in the reveal toggle, e.g. "API Key" */
  label: string
  className?: string
}) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className={cn('flex w-60 items-center', className)}>
      <Input
        id={id}
        type={revealed ? 'text' : 'password'}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onBlur={(event) => onChange(event.target.value.trim())}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck={false}
        className="rounded-r-none bg-background"
      />
      <IconButton
        size="lg"
        className="shrink-0 rounded-l-none border border-l-0 border-input bg-background"
        onClick={() => setRevealed(!revealed)}
        aria-label={revealed ? `隐藏 ${label}` : `显示 ${label}`}
      >
        {revealed ? <EyeOff /> : <Eye />}
      </IconButton>
    </div>
  )
}
