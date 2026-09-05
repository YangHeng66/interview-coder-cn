import { ipcMain } from 'electron'
import { autoUpdater } from 'electron-updater'
import { flushConversations } from './conversations'

let updateStatus: 'available' | 'downloaded' | null = null
function publishUpdate(status: 'available' | 'downloaded') {
  updateStatus = status
  global.mainWindow?.webContents.send('update-status', status)
}

ipcMain.handle('getUpdateStatus', () => updateStatus)
ipcMain.handle('downloadAppUpdate', () => autoUpdater.downloadUpdate())
ipcMain.handle('installAppUpdate', async () => {
  await flushConversations()
  autoUpdater.quitAndInstall(false, true)
})

export function initAutoUpdater(): void {
  if (process.platform === 'darwin') {
    return
  }

  try {
    autoUpdater.autoDownload = false

    autoUpdater.on('update-available', () => publishUpdate('available'))

    autoUpdater.on('error', (error) => {
      console.error('Auto update error:', error)
    })

    autoUpdater.on('update-not-available', () => {
      // no-op
    })

    autoUpdater.on('update-downloaded', () => publishUpdate('downloaded'))

    // Trigger the check after window creation
    autoUpdater.checkForUpdates().catch((err) => console.error(err))
  } catch (e) {
    console.error('Failed to initialize auto-updater:', e)
  }
}
