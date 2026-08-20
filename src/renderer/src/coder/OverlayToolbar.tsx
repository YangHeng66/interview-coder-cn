import { useCallback, useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { TOOLBAR_ACTIONS, type ToolbarActionName } from '@/lib/toolbar-actions'
import type { LucideIcon } from 'lucide-react'

/**
 * Toolbar rendered in its own always-on-top window above the main window.
 * Buttons carry no `title`: a native tooltip would be drawn outside the window
 * and would therefore not be covered by the window's content protection.
 */
export function OverlayToolbar() {
  const [hoverDelay, setHoverDelay] = useState(0)

  // This window has its own settings store copy, so main pushes the live value
  useEffect(() => {
    window.api.getAppSettings().then((settings) => {
      setHoverDelay(settings.toolbarHoverDelay || 0)
    })
    window.api.onSyncToolbarSettings(({ hoverDelay }) => {
      setHoverDelay(hoverDelay || 0)
    })
    return () => {
      window.api.removeSyncToolbarSettingsListener()
    }
  }, [])

  return (
    <div className="overlay-toolbar overlay-toolbar-root">
      {TOOLBAR_ACTIONS.map(({ action, Icon, label }) => (
        <ToolbarButton
          key={action}
          action={action}
          Icon={Icon}
          label={label}
          hoverDelay={hoverDelay}
        />
      ))}
    </div>
  )
}

/**
 * Fires on click, and — when a dwell time is configured — on hovering the button
 * for that long, which triggers the action without ever emitting a mouse click.
 */
function ToolbarButton({
  action,
  Icon,
  label,
  hoverDelay
}: {
  action: ToolbarActionName
  Icon: LucideIcon
  label: string
  hoverDelay: number
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [isDwelling, setIsDwelling] = useState(false)

  const cancelDwell = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
    setIsDwelling(false)
  }, [])

  // Drop a pending dwell when the setting changes or the toolbar goes away
  useEffect(() => cancelDwell, [cancelDwell, hoverDelay])

  const handleMouseEnter = () => {
    if (!hoverDelay) return
    setIsDwelling(true)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      // Stays inert until the cursor leaves and comes back, so parking the
      // mouse on a button cannot fire it over and over
      setIsDwelling(false)
      void window.api.triggerAction(action)
    }, hoverDelay)
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={cancelDwell}
      onClick={() => {
        cancelDwell()
        void window.api.triggerAction(action)
      }}
      aria-label={label}
    >
      <Icon />
      {isDwelling && (
        <span className="dwell-progress" style={{ animationDuration: `${hoverDelay}ms` }} />
      )}
    </Button>
  )
}
