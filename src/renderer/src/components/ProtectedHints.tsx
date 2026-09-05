import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

export function ProtectedHints() {
  const [hint, setHint] = useState<{ text: string; x: number; y: number } | null>(null)
  useEffect(() => {
    const show = (event: PointerEvent | FocusEvent) => {
      const element =
        event.target instanceof Element
          ? event.target.closest<HTMLElement>('[data-tooltip],button[aria-label]')
          : null
      const text = element?.dataset.tooltip ?? element?.getAttribute('aria-label')
      if (!element || !text) {
        setHint(null)
        return
      }
      const rect = element.getBoundingClientRect()
      setHint({ text, x: rect.left + rect.width / 2, y: rect.bottom })
    }
    const hide = () => setHint(null)
    document.addEventListener('pointerover', show)
    document.addEventListener('focusin', show)
    document.addEventListener('pointerout', hide)
    document.addEventListener('focusout', hide)
    document.addEventListener('pointerdown', hide)
    document.addEventListener('scroll', hide, true)
    return () => {
      document.removeEventListener('pointerover', show)
      document.removeEventListener('focusin', show)
      document.removeEventListener('pointerout', hide)
      document.removeEventListener('focusout', hide)
      document.removeEventListener('pointerdown', hide)
      document.removeEventListener('scroll', hide, true)
    }
  }, [])
  if (!hint) return null
  return createPortal(
    <div
      role="tooltip"
      className="protected-hint"
      style={{
        left: Math.max(8, Math.min(hint.x - 120, window.innerWidth - 248)),
        top: Math.min(hint.y + 4, window.innerHeight - 54)
      }}
    >
      {hint.text}
    </div>,
    document.body
  )
}
