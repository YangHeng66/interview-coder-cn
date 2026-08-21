import { desktopCapturer, screen } from 'electron'

export async function takeScreenshot(): Promise<string | void> {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return

  // Get the primary display's size.
  const primaryDisplay = screen.getPrimaryDisplay()
  const { width, height } = primaryDisplay.size
  const startedAt = performance.now()

  try {
    const sourcesStartedAt = performance.now()
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width, height }
    })
    const sourceReadyAt = performance.now()
    const thumbnail = sources[0]?.thumbnail
    if (!thumbnail) return

    const screenshot = thumbnail.toPNG()
    const encodedAt = performance.now()
    const base64Data = screenshot.toString('base64')
    const finishedAt = performance.now()
    const actualSize = thumbnail.getSize()
    console.info(
      `[AI timing] screenshot sources=${Math.round(sourceReadyAt - sourcesStartedAt)}ms ` +
        `encode=${Math.round(encodedAt - sourceReadyAt)}ms ` +
        `base64=${Math.round(finishedAt - encodedAt)}ms ` +
        `total=${Math.round(finishedAt - startedAt)}ms ` +
        `dimensions=${actualSize.width}x${actualSize.height} ` +
        `pngBytes=${screenshot.byteLength}`
    )
    return base64Data
  } catch (error) {
    console.error('Error taking screenshot:', error)
  }
}
