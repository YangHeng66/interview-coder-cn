import { randomUUID } from 'node:crypto'
import {
  CHAT_DOCUMENT_MAX_FILES,
  CHAT_DOCUMENT_MAX_FILE_BYTES,
  CHAT_DOCUMENT_MAX_TOTAL_CHARACTERS,
  isSupportedChatDocument,
  type ChatDocument
} from '../../preload/contracts'

export function normalizeChatDocuments(input: unknown): ChatDocument[] | string {
  if (input === undefined) return []
  if (!Array.isArray(input)) return '文档数据格式无效'
  if (input.length > CHAT_DOCUMENT_MAX_FILES) {
    return `一次最多上传 ${CHAT_DOCUMENT_MAX_FILES} 个文档`
  }

  let totalCharacters = 0
  const documents: ChatDocument[] = []
  for (const item of input) {
    if (!item || typeof item !== 'object') return '文档数据格式无效'
    const raw = item as Partial<ChatDocument>
    const name = typeof raw.name === 'string' ? raw.name.replace(/[\r\n\0]/g, '').slice(0, 200) : ''
    const text = typeof raw.text === 'string' ? raw.text.replace(/\0/g, '') : ''
    const size = typeof raw.size === 'number' && Number.isFinite(raw.size) ? raw.size : 0

    if (!name || !isSupportedChatDocument(name)) {
      return `不支持文档“${name || '未命名文件'}”的格式`
    }
    if (size > CHAT_DOCUMENT_MAX_FILE_BYTES) {
      return `文档“${name}”超过 1 MB 限制`
    }
    if (!text.trim()) return `文档“${name}”没有可读取的文本`

    totalCharacters += text.length
    if (totalCharacters > CHAT_DOCUMENT_MAX_TOTAL_CHARACTERS) {
      return '文档文本总量超过 20 万字符限制'
    }

    documents.push({
      id: typeof raw.id === 'string' && raw.id ? raw.id : randomUUID(),
      name,
      mediaType: typeof raw.mediaType === 'string' ? raw.mediaType.slice(0, 100) : 'text/plain',
      size,
      text
    })
  }
  return documents
}

export function createChatModelText(text: string, documents: ChatDocument[]): string {
  const sections = documents.map(
    (document, index) =>
      `===== 文档 ${index + 1} 开始：${document.name} =====\n${document.text}\n===== 文档 ${index + 1} 结束：${document.name} =====`
  )
  return [text || (documents.length ? '请阅读以下文档并回答。' : ''), ...sections]
    .filter(Boolean)
    .join('\n\n')
}
