import type { ChatEvent } from '../../preload/contracts'
import { recordChatEvent, recordVisionEvent } from '../conversations'

/** Forward to the renderer and record into the active conversation */
export function sendChatEvent(event: ChatEvent) {
  recordChatEvent(event)
  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('chat-event', event)
  }
}

export function sendVisionEvent(channel: string, value?: string | string[]) {
  recordVisionEvent(channel, value)
  global.mainWindow?.webContents.send(channel, value)
}
