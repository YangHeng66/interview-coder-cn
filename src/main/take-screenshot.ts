import { desktopCapturer, screen } from 'electron'

export function takeScreenshot(): Promise<string | void> {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return Promise.resolve()

  // Get the primary display's size.
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.size

  return desktopCapturer
    .getSources({ types: ['screen'], thumbnailSize: { width, height } })
    .then((sources) => {
      if (sources.length > 0) {
        const screenshot = sources[0]?.thumbnail.toPNG()
        const base64Data = screenshot.toString('base64')
        return base64Data
      }
      return undefined
    })
    .catch((error) => {
      console.error('Error taking screenshot:', error)
    })
}
