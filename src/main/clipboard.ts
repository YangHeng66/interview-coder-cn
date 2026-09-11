import { clipboard, ipcMain } from 'electron'

ipcMain.handle('writeClipboardText', (_event, text: string): void => {
  clipboard.writeText(text)
})
