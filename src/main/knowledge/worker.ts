import { parentPort } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import { extname } from 'node:path'
import { extractText as extractPdfText } from 'unpdf'
import mammoth from 'mammoth'
import { chunkKnowledgeText } from './search'

type ParseRequest = {
  taskId: string
  documentId: string
  filePath: string
}

type ParseSuccess = {
  taskId: string
  ok: true
  text: string
  chunks: ReturnType<typeof chunkKnowledgeText>
}

type ParseFailure = {
  taskId: string
  ok: false
  error: string
}

function decodeText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return new TextDecoder('utf-16le').decode(buffer.subarray(2))
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    const swapped = Buffer.allocUnsafe(buffer.length - 2)
    for (let index = 2; index + 1 < buffer.length; index += 2) {
      swapped[index - 2] = buffer[index + 1]
      swapped[index - 1] = buffer[index]
    }
    return new TextDecoder('utf-16le').decode(swapped)
  }

  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '')
  } catch {
    return new TextDecoder('gb18030').decode(buffer).replace(/^\uFEFF/, '')
  }
}

async function extractText(filePath: string): Promise<string> {
  const extension = extname(filePath).toLowerCase()
  const buffer = await readFile(filePath)
  if (extension === '.pdf') {
    const result = await extractPdfText(new Uint8Array(buffer), { mergePages: true })
    return result.text
  }
  if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }
  return decodeText(buffer)
}

async function handleRequest(request: ParseRequest): Promise<ParseSuccess | ParseFailure> {
  try {
    const text = (await extractText(request.filePath)).replace(/\0/g, '').trim()
    if (!text) {
      throw new Error(
        extname(request.filePath).toLowerCase() === '.pdf'
          ? '未提取到可选中文本；扫描版 PDF 暂不支持，请先进行 OCR'
          : '文档中没有可读取的文本'
      )
    }
    const chunks = chunkKnowledgeText(request.documentId, text)
    if (!chunks.length) throw new Error('文档分段结果为空')
    return { taskId: request.taskId, ok: true, text, chunks }
  } catch (error) {
    return {
      taskId: request.taskId,
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}

parentPort?.on('message', (request: ParseRequest) => {
  void handleRequest(request).then((result) => parentPort?.postMessage(result))
})
