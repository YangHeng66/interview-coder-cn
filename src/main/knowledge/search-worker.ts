import { parentPort } from 'node:worker_threads'
import { readFile } from 'node:fs/promises'
import appConfig from '../../../app.config.json'
import type {
  KnowledgeDiagnostic,
  KnowledgePassage,
  KnowledgeProfile
} from '../../preload/contracts'
import { BUILTIN_FRONTEND_DOCUMENTS } from './builtin/frontend'
import {
  formatKnowledgeContext,
  KnowledgeSearchIndex,
  type KnowledgeChunkFile,
  type KnowledgeRetrieval
} from './search'

export type IndexDocument = { id: string; name: string; revision: string; path: string }
export type SearchOperations = {
  sync: {
    input: IndexDocument[]
    output: { indexMs: number; indexedDocuments: number; updatedDocuments: number }
  }
  search: {
    input: { query: string; profile: KnowledgeProfile; includeBuiltin: boolean }
    output: {
      retrieval: KnowledgeRetrieval
      diagnostic: Omit<
        KnowledgeDiagnostic,
        'elapsedMs' | 'indexMs' | 'indexedDocuments' | 'updatedDocuments'
      >
    }
  }
  preview: { input: string; output: KnowledgePassage[] }
}
export type SearchRequest = {
  [K in keyof SearchOperations]: { taskId: string; type: K; input: SearchOperations[K]['input'] }
}[keyof SearchOperations]

const index = new KnowledgeSearchIndex()
const revisions = new Map<string, string>()
index.replaceDocuments(
  BUILTIN_FRONTEND_DOCUMENTS.map((document) => ({
    documentId: document.id,
    documentName: document.name,
    priority: document.priority,
    chunks: document.chunks
  }))
)

async function execute(
  request: SearchRequest
): Promise<SearchOperations[keyof SearchOperations]['output']> {
  const startedAt = performance.now()
  if (request.type === 'sync') {
    const documentIds = new Set(request.input.map((document) => document.id))
    let updatedDocuments = 0
    for (const id of revisions.keys()) {
      if (!documentIds.has(id)) {
        index.removeDocument(id)
        revisions.delete(id)
        updatedDocuments++
      }
    }
    for (const document of request.input) {
      if (revisions.get(document.id) === document.revision) continue
      const file = JSON.parse(await readFile(document.path, 'utf8')) as KnowledgeChunkFile
      index.updateDocument({
        documentId: document.id,
        documentName: document.name,
        chunks: file.chunks
      })
      revisions.set(document.id, document.revision)
      updatedDocuments++
    }
    return {
      indexMs: performance.now() - startedAt,
      indexedDocuments: revisions.size + BUILTIN_FRONTEND_DOCUMENTS.length,
      updatedDocuments
    }
  }
  if (request.type === 'preview') return index.getDocumentChunks(request.input)

  const { query, profile, includeBuiltin } = request.input
  const allowed = new Set(profile.documentLinks.map((link) => link.documentId))
  if (includeBuiltin) BUILTIN_FRONTEND_DOCUMENTS.forEach((document) => allowed.add(document.id))
  const priorities = new Map(profile.documentLinks.map((link) => [link.documentId, link.priority]))
  const rankedChunks = index
    .search(query, allowed)
    .map((chunk) => {
      const priority = priorities.get(chunk.documentId) ?? 'normal'
      return {
        ...chunk,
        priority,
        score: chunk.score * (priority === 'key' ? appConfig.knowledge.keyDocumentBoost : 1)
      }
    })
    .sort((a, b) => b.score - a.score)
  const background =
    appConfig.knowledge.fixedBackground === 'key-documents'
      ? profile.documentLinks
          .filter((link) => link.priority === 'key')
          .flatMap((link) => {
            const chunk = index.getFirstChunk(link.documentId)
            return chunk ? [{ ...chunk, priority: link.priority }] : []
          })
      : []
  const minimumScore = (rankedChunks[0]?.score ?? 0) * appConfig.knowledge.minimumRelativeScore
  const retrieval = formatKnowledgeContext({
    profile,
    rankedChunks: rankedChunks.filter((chunk) => chunk.score >= minimumScore),
    fallbackChunks: background
  })
  return {
    retrieval,
    diagnostic: {
      query,
      profileName: profile.name,
      searchMs: performance.now() - startedAt,
      candidateCount: rankedChunks.length,
      candidates: rankedChunks.slice(0, appConfig.knowledge.diagnosticCandidateLimit),
      passages: retrieval.passages,
      context: retrieval.context,
      contextCharacters: retrieval.context.length
    }
  }
}

// Keep document updates and queries ordered while file reads yield to the worker event loop.
let queue = Promise.resolve()
parentPort!.on('message', (request: SearchRequest) => {
  queue = queue.then(async () => {
    try {
      const data = await execute(request)
      parentPort!.postMessage({ taskId: request.taskId, ok: true, data })
    } catch (error) {
      parentPort!.postMessage({ taskId: request.taskId, ok: false, error: String(error) })
    }
  })
})
