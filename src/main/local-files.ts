import { app, ipcMain } from 'electron'
import { readdir, readFile, stat } from 'node:fs/promises'
import { basename, dirname, join, resolve } from 'node:path'
import {
  CHAT_DOCUMENT_MAX_FILE_BYTES,
  type ChatDocument,
  type LocalDirectory
} from '../preload/contracts'

ipcMain.handle(
  'browseLocalDirectory',
  async (_event, requestedPath: string | null): Promise<LocalDirectory> => {
    const path = requestedPath === null ? app.getPath('documents') : resolve(requestedPath)
    const entries = await readdir(path, { withFileTypes: true })
    return {
      path,
      parent: dirname(path),
      entries: entries
        .filter((entry) => entry.isDirectory() || entry.isFile())
        .map((entry) => ({
          name: entry.name,
          path: join(path, entry.name),
          directory: entry.isDirectory()
        }))
        .sort(
          (a, b) =>
            Number(b.directory) - Number(a.directory) || a.name.localeCompare(b.name, 'zh-CN')
        )
    }
  }
)

ipcMain.handle('readChatDocuments', async (_event, paths: string[]): Promise<ChatDocument[]> => {
  const documents: ChatDocument[] = []
  for (const path of paths) {
    const metadata = await stat(path)
    if (metadata.size > CHAT_DOCUMENT_MAX_FILE_BYTES)
      throw new Error(`文档“${basename(path)}”超过大小限制`)
    const text = (await readFile(path, 'utf8')).replace(/^\uFEFF/, '')
    documents.push({
      id: `${path}-${metadata.size}-${metadata.mtimeMs}`,
      name: basename(path),
      mediaType: 'text/plain',
      size: metadata.size,
      text
    })
  }
  return documents
})
