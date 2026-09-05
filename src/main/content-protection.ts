import { BrowserWindow } from 'electron'

let enabled = true

export function applyContentProtection(window: BrowserWindow): void {
  if (!window || window.isDestroyed()) return
  window.setContentProtection(enabled)
}

export function setContentProtectionEnabled(nextEnabled: boolean): void {
  enabled = nextEnabled
  if (global.mainWindow && !global.mainWindow.isDestroyed()) {
    applyContentProtection(global.mainWindow)
  }
}
