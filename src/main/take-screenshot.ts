import { desktopCapturer, screen } from 'electron'
import type { Display } from 'electron'
import appConfig from '../../app.config.json'

type CaptureSize = { width: number; height: number }

/** Physical pixels of the display, shrunk so the long edge fits `maxLongEdge`. */
export function getCaptureSize(
  display: Pick<Display, 'size' | 'scaleFactor'>,
  maxLongEdge: number
): CaptureSize {
  const width = display.size.width * display.scaleFactor
  const height = display.size.height * display.scaleFactor
  const ratio = Math.min(1, maxLongEdge / Math.max(width, height))
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) }
}

/** Some Linux setups report an empty display_id, so fall back to the first source. */
export function pickCaptureSource<T extends { display_id: string }>(
  sources: T[],
  displayId: number
): T | undefined {
  return sources.find((source) => source.display_id === String(displayId)) ?? sources[0]
}

function getTargetDisplay(): Display {
  return appConfig.screenshot.display === 'cursor'
    ? screen.getDisplayNearestPoint(screen.getCursorScreenPoint())
    : screen.getPrimaryDisplay()
}

export async function takeScreenshot(): Promise<string | void> {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return

  const { format, jpegQuality, maxLongEdge } = appConfig.screenshot
  const display = getTargetDisplay()
  const startedAt = performance.now()

  try {
    const sourcesStartedAt = performance.now()
    // The capturer scales the thumbnail itself, so no second resize pass is needed.
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: getCaptureSize(display, maxLongEdge)
    })
    const sourceReadyAt = performance.now()
    const thumbnail = pickCaptureSource(sources, display.id)?.thumbnail
    if (!thumbnail) return

    const screenshot = format === 'jpeg' ? thumbnail.toJPEG(jpegQuality) : thumbnail.toPNG()
    const encodedAt = performance.now()
    const base64Data = screenshot.toString('base64')
    const finishedAt = performance.now()
    const actualSize = thumbnail.getSize()
    console.info(
      `[AI timing] screenshot sources=${Math.round(sourceReadyAt - sourcesStartedAt)}ms ` +
        `encode=${Math.round(encodedAt - sourceReadyAt)}ms ` +
        `base64=${Math.round(finishedAt - encodedAt)}ms ` +
        `total=${Math.round(finishedAt - startedAt)}ms ` +
        `display=${display.id} format=${format} ` +
        `dimensions=${actualSize.width}x${actualSize.height} ` +
        `bytes=${screenshot.byteLength}`
    )
    return base64Data
  } catch (error) {
    console.error('Error taking screenshot:', error)
  }
}
