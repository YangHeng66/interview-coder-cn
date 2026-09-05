import type { KeyboardEvent } from 'react'

export function navigateKnowledgeTabs(event: KeyboardEvent<HTMLDivElement>): void {
  const tabs = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]'))
  const current = tabs.indexOf(event.target as HTMLButtonElement)
  let next: number
  switch (event.key) {
    case 'ArrowRight':
      next = (current + 1) % tabs.length
      break
    case 'ArrowLeft':
      next = (current - 1 + tabs.length) % tabs.length
      break
    case 'Home':
      next = 0
      break
    case 'End':
      next = tabs.length - 1
      break
    default:
      return
  }
  event.preventDefault()
  tabs[next].focus()
  tabs[next].click()
}
