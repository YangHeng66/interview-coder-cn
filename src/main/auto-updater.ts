import { dialog } from 'electron'
import { autoUpdater } from 'electron-updater'

export function initAutoUpdater(): void {
  if (process.platform === 'darwin') {
    return
  }

  try {
    autoUpdater.autoDownload = false

    autoUpdater.on('update-available', async () => {
      const result = await dialog.showMessageBox({
        type: 'info',
        buttons: ['立即下载', '稍后'],
        defaultId: 0,
        cancelId: 1,
        title: '发现新版本',
        message: '检测到新版本可用。',
        detail: '现在下载并安装更新吗？'
      })
      if (result.response === 0) {
        autoUpdater.downloadUpdate().catch((err) => console.error(err))
      }
    })

    autoUpdater.on('error', (error) => {
      console.error('Auto update error:', error)
    })

    autoUpdater.on('update-not-available', () => {
      // no-op
    })

    autoUpdater.on('update-downloaded', async () => {
      const res = await dialog.showMessageBox({
        type: 'info',
        buttons: ['立即重启', '稍后'],
        defaultId: 0,
        cancelId: 1,
        title: '更新已就绪',
        message: '更新已下载完成。',
        detail: '是否立即重启以应用更新？'
      })
      if (res.response === 0) {
        setImmediate(() => autoUpdater.quitAndInstall(false, true))
      }
    })

    // Trigger the check after window creation
    autoUpdater.checkForUpdates().catch((err) => console.error(err))
  } catch (e) {
    console.error('Failed to initialize auto-updater:', e)
  }
}
