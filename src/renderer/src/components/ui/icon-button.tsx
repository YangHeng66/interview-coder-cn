import * as React from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const SIZES = {
  sm: 'size-7 [&_svg:not([class*="size-"])]:size-3.5',
  md: 'size-8',
  lg: 'size-9'
}

type IconButtonProps = Omit<
  React.ComponentProps<typeof Button>,
  'title' | 'size' | 'variant' | 'aria-label'
> & {
  /**
   * Required: ProtectedHints shows it as an in-window tooltip. A native `title`
   * tooltip is drawn by the OS outside the protected window and would leak into
   * screen sharing, so it is deliberately not accepted.
   */
  'aria-label': string
  size?: keyof typeof SIZES
  active?: boolean
}

export function IconButton({ className, size = 'md', active, ...props }: IconButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-pressed={active}
      className={cn(
        SIZES[size],
        'text-muted-foreground hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent',
        active && 'bg-primary-soft text-primary hover:bg-primary-soft hover:text-primary',
        className
      )}
      {...props}
    />
  )
}
