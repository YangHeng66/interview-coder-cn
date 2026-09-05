import { createHash, randomUUID } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { copyFile, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { app } from 'electron'
import appConfig from '../../../app.config.json'
import { KnowledgeSearchClient } from './search-client'
import createKnowledgeWorker from './worker?nodeWorker'
import {
  KNOWLEDGE_DOCUMENT_EXTENSIONS,
  KNOWLEDGE_MAX_FILE_BYTES,
  KNOWLEDGE_MAX_IMPORT_FILES,
  type KnowledgeDocument,
  type KnowledgeImportFailure,
  type KnowledgeImportProgress,
  type KnowledgeImportResult,
  type KnowledgeLinkPatch,
  type KnowledgeProfile,
  type KnowledgeProfileInput,
  type KnowledgeProfilePatch,
  type KnowledgeResult,
  type KnowledgeSnapshot
} from '../../preload/contracts'
import type {
  KnowledgeDiagnostic,
  KnowledgeDiagnosticInput,
  KnowledgePassage
} from '../../preload/contracts'
import { createBuiltinFrontendProfile } from './builtin/frontend'
import { type KnowledgeChunkFile, type KnowledgeRetrieval } from './search'

type StoredKnowledgeDocument = KnowledgeDocument & {
  storedFileName: string
}

type KnowledgeManifest = {
  schemaVersion: 1
  activeProfileId: string | null
  builtinFrontendKnowledgeEnabled: boolean
  profiles: KnowledgeProfile[]
  documents: StoredKnowledgeDocument[]
}

type ParseWorkerResult =
  | {
      taskId: string
      ok: true
      text: string
      chunks: KnowledgeChunkFile['chunks']
    }
  | { taskId: string; ok: false; error: string }

type PendingWorkerTask = {
  resolve: (result: ParseWorkerResult) => void
  reject: (error: Error) => void
}

const EMPTY_MANIFEST: KnowledgeManifest = {
  schemaVersion: 1,
  activeProfileId: null,
  builtinFrontendKnowledgeEnabled: true,
  profiles: [],
  documents: []
}

const SUPPORTED_EXTENSIONS = new Set<string>(KNOWLEDGE_DOCUMENT_EXTENSIONS)

function success<T>(data: T): KnowledgeResult<T> {
  return { ok: true, data }
}

function failure<T>(error: unknown): KnowledgeResult<T> {
  return { ok: false, error: error instanceof Error ? error.message : String(error) }
}

function cleanSingleLine(value: unknown, maxLength: number): string {
  return typeof value === 'string'
    ? value
        .replace(/[\r\n\0]+/g, ' ')
        .trim()
        .slice(0, maxLength)
    : ''
}

function cleanMultiline(value: unknown, maxLength: number): string {
  return typeof value === 'string' ? value.replace(/\0/g, '').trim().slice(0, maxLength) : ''
}

function cloneManifest(): KnowledgeManifest {
  return {
    ...EMPTY_MANIFEST,
    profiles: [],
    documents: []
  }
}

function now(): string {
  return new Date().toISOString()
}

class KnowledgeWorkerClient {
  private worker: ReturnType<typeof createKnowledgeWorker> | null = null
  private pending = new Map<string, PendingWorkerTask>()

  private ensureWorker() {
    if (this.worker) return this.worker
    const worker = createKnowledgeWorker({})
    worker.on('message', (result: ParseWorkerResult) => {
      const task = this.pending.get(result.taskId)
      if (!task) return
      this.pending.delete(result.taskId)
      task.resolve(result)
    })
    worker.on('error', (error) => {
      this.failAll(error)
      this.worker = null
    })
    worker.on('exit', (code) => {
      if (code !== 0) this.failAll(new Error(`知识库解析进程异常退出（${code}）`))
      this.worker = null
    })
    this.worker = worker
    return worker
  }

  private failAll(error: Error): void {
    this.pending.forEach((task) => task.reject(error))
    this.pending.clear()
  }

  parse(documentId: string, filePath: string): Promise<ParseWorkerResult> {
    const taskId = randomUUID()
    return new Promise((resolve, reject) => {
      this.pending.set(taskId, { resolve, reject })
      this.ensureWorker().postMessage({ taskId, documentId, filePath })
    })
  }
}

class KnowledgeService {
  private manifest: KnowledgeManifest = cloneManifest()
  private loaded = false
  private loadingPromise: Promise<void> | null = null
  private worker = new KnowledgeWorkerClient()
  private search = new KnowledgeSearchClient()
  private warmupTimer: ReturnType<typeof setTimeout> | null = null

  private get rootDir(): string {
    return join(app.getPath('userData'), 'knowledge-base', 'v1')
  }

  private get filesDir(): string {
    return join(this.rootDir, 'files')
  }

  private get chunksDir(): string {
    return join(this.rootDir, 'chunks')
  }

  private get manifestPath(): string {
    return join(this.rootDir, 'manifest.json')
  }

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return
    if (this.loadingPromise) return this.loadingPromise
    this.loadingPromise = this.load()
    try {
      await this.loadingPromise
    } finally {
      this.loadingPromise = null
    }
  }

  private async load(): Promise<void> {
    await Promise.all([
      mkdir(this.filesDir, { recursive: true }),
      mkdir(this.chunksDir, { recursive: true })
    ])
    try {
      const parsed = JSON.parse(
        await readFile(this.manifestPath, 'utf8')
      ) as Partial<KnowledgeManifest>
      this.manifest = {
        schemaVersion: 1,
        activeProfileId: typeof parsed.activeProfileId === 'string' ? parsed.activeProfileId : null,
        builtinFrontendKnowledgeEnabled:
          typeof parsed.builtinFrontendKnowledgeEnabled === 'boolean'
            ? parsed.builtinFrontendKnowledgeEnabled
            : true,
        profiles: Array.isArray(parsed.profiles) ? parsed.profiles : [],
        documents: Array.isArray(parsed.documents) ? parsed.documents : []
      }
      if (!this.manifest.profiles.some((profile) => profile.id === this.manifest.activeProfileId)) {
        this.manifest.activeProfileId = null
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      if (code !== 'ENOENT') {
        const corruptPath = join(this.rootDir, `manifest.corrupt-${Date.now()}.json`)
        await rename(this.manifestPath, corruptPath).catch(() => undefined)
        console.error('Knowledge manifest was reset because it could not be read:', error)
      }
      this.manifest = cloneManifest()
      await this.saveManifest()
    }
    this.loaded = true
    this.scheduleIndexWarmup()

    const interruptedIds = this.manifest.documents
      .filter((document) => document.status === 'processing')
      .map((document) => document.id)
    interruptedIds.forEach((documentId) => {
      void this.processStoredDocument(documentId)
    })
  }

  private async saveManifest(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    const tempPath = `${this.manifestPath}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempPath, `${JSON.stringify(this.manifest, null, 2)}\n`, 'utf8')
    await rename(tempPath, this.manifestPath)
  }

  private snapshot(): KnowledgeSnapshot {
    return {
      schemaVersion: 1,
      activeProfileId: this.manifest.activeProfileId,
      builtinFrontendKnowledgeEnabled: this.manifest.builtinFrontendKnowledgeEnabled,
      profiles: structuredClone(this.manifest.profiles),
      documents: this.manifest.documents.map((document) => {
        const publicDocument = { ...document }
        delete (publicDocument as { storedFileName?: string }).storedFileName
        return publicDocument
      })
    }
  }

  private emitSnapshot(): void {
    this.scheduleIndexWarmup()
    const window = global.mainWindow
    if (window && !window.isDestroyed()) {
      window.webContents.send('knowledge-snapshot-changed', this.snapshot())
    }
  }

  private emitProgress(progress: KnowledgeImportProgress): void {
    const window = global.mainWindow
    if (window && !window.isDestroyed()) {
      window.webContents.send('knowledge-import-progress', progress)
    }
  }

  private getStoredPath(document: StoredKnowledgeDocument): string {
    return join(this.filesDir, basename(document.storedFileName))
  }

  private getChunksPath(documentId: string): string {
    return join(this.chunksDir, basename(`${documentId}.json`))
  }

  private async writeChunks(file: KnowledgeChunkFile): Promise<void> {
    const path = this.getChunksPath(file.documentId)
    const tempPath = `${path}.${process.pid}.${Date.now()}.tmp`
    await writeFile(tempPath, `${JSON.stringify(file)}\n`, 'utf8')
    await rename(tempPath, path)
  }

  private async hashFile(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = createHash('sha256')
      const stream = createReadStream(filePath)
      stream.on('error', reject)
      stream.on('data', (chunk) => hash.update(chunk))
      stream.on('end', () => resolve(hash.digest('hex')))
    })
  }

  private linkDocumentInternal(profileId: string, documentId: string): boolean {
    const profile = this.manifest.profiles.find((candidate) => candidate.id === profileId)
    const document = this.manifest.documents.find((candidate) => candidate.id === documentId)
    if (!profile || !document) return false
    if (!profile.documentLinks.some((link) => link.documentId === documentId)) {
      profile.documentLinks.push({ documentId, priority: 'normal', linkedAt: now() })
      profile.updatedAt = now()
    }
    return true
  }

  private async processStoredDocument(documentId: string): Promise<string | null> {
    const document = this.manifest.documents.find((candidate) => candidate.id === documentId)
    if (!document) return '文档不存在'
    document.status = 'processing'
    document.error = undefined
    document.updatedAt = now()
    await this.saveManifest()
    this.emitSnapshot()
    this.emitProgress({
      documentId,
      name: document.name,
      stage: 'extracting',
      completed: 0,
      total: 1
    })

    try {
      const result = await this.worker.parse(document.id, this.getStoredPath(document))
      if (!result.ok) throw new Error(result.error)
      this.emitProgress({
        documentId,
        name: document.name,
        stage: 'indexing',
        completed: 0,
        total: 1
      })
      await this.writeChunks({ schemaVersion: 1, documentId, chunks: result.chunks })
      document.status = 'ready'
      document.error = undefined
      document.characterCount = result.text.length
      document.chunkCount = result.chunks.length
      document.updatedAt = now()
      await this.saveManifest()
      this.emitSnapshot()
      this.emitProgress({
        documentId,
        name: document.name,
        stage: 'ready',
        completed: 1,
        total: 1
      })
      return null
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      document.status = 'error'
      document.error = message
      document.characterCount = 0
      document.chunkCount = 0
      document.updatedAt = now()
      await this.saveManifest()
      this.emitSnapshot()
      this.emitProgress({
        documentId,
        name: document.name,
        stage: 'error',
        completed: 1,
        total: 1,
        error: message
      })
      return message
    }
  }

  async getSnapshot(): Promise<KnowledgeSnapshot> {
    await this.ensureLoaded()
    this.scheduleIndexWarmup()
    return this.snapshot()
  }

  async createProfile(input: KnowledgeProfileInput): Promise<KnowledgeResult<KnowledgeProfile>> {
    try {
      await this.ensureLoaded()
      const name = cleanSingleLine(input.name, 80)
      if (!name) return failure('请输入岗位档案名称')
      const timestamp = now()
      const profile: KnowledgeProfile = {
        id: randomUUID(),
        name,
        company: cleanSingleLine(input.company, 120),
        role: cleanSingleLine(input.role, 120),
        jobDescription: cleanMultiline(input.jobDescription, 30_000),
        documentLinks: [],
        createdAt: timestamp,
        updatedAt: timestamp
      }
      this.manifest.profiles.push(profile)
      await this.saveManifest()
      this.emitSnapshot()
      return success(structuredClone(profile))
    } catch (error) {
      return failure(error)
    }
  }

  async updateProfile(
    profileId: string,
    patch: KnowledgeProfilePatch
  ): Promise<KnowledgeResult<KnowledgeProfile>> {
    try {
      await this.ensureLoaded()
      const profile = this.manifest.profiles.find((candidate) => candidate.id === profileId)
      if (!profile) return failure('岗位档案不存在')
      if (patch.name !== undefined) {
        const name = cleanSingleLine(patch.name, 80)
        if (!name) return failure('请输入岗位档案名称')
        profile.name = name
      }
      if (patch.company !== undefined) profile.company = cleanSingleLine(patch.company, 120)
      if (patch.role !== undefined) profile.role = cleanSingleLine(patch.role, 120)
      if (patch.jobDescription !== undefined) {
        profile.jobDescription = cleanMultiline(patch.jobDescription, 30_000)
      }
      profile.updatedAt = now()
      await this.saveManifest()
      this.emitSnapshot()
      return success(structuredClone(profile))
    } catch (error) {
      return failure(error)
    }
  }

  async deleteProfile(profileId: string): Promise<KnowledgeResult<KnowledgeSnapshot>> {
    try {
      await this.ensureLoaded()
      const previousLength = this.manifest.profiles.length
      this.manifest.profiles = this.manifest.profiles.filter((profile) => profile.id !== profileId)
      if (this.manifest.profiles.length === previousLength) return failure('岗位档案不存在')
      if (this.manifest.activeProfileId === profileId) this.manifest.activeProfileId = null
      await this.saveManifest()
      this.emitSnapshot()
      return success(this.snapshot())
    } catch (error) {
      return failure(error)
    }
  }

  async setActiveProfile(profileId: string | null): Promise<KnowledgeResult<KnowledgeSnapshot>> {
    try {
      await this.ensureLoaded()
      if (profileId && !this.manifest.profiles.some((profile) => profile.id === profileId)) {
        return failure('岗位档案不存在')
      }
      this.manifest.activeProfileId = profileId
      await this.saveManifest()
      this.emitSnapshot()
      return success(this.snapshot())
    } catch (error) {
      return failure(error)
    }
  }

  async setBuiltinKnowledgeEnabled(enabled: boolean): Promise<KnowledgeResult<KnowledgeSnapshot>> {
    try {
      await this.ensureLoaded()
      if (typeof enabled !== 'boolean') return failure('内置前端知识开关参数无效')
      if (this.manifest.builtinFrontendKnowledgeEnabled === enabled) {
        return success(this.snapshot())
      }
      this.manifest.builtinFrontendKnowledgeEnabled = enabled
      await this.saveManifest()
      this.emitSnapshot()
      return success(this.snapshot())
    } catch (error) {
      return failure(error)
    }
  }

  async importDocuments(
    profileId: string | undefined,
    filePaths: string[]
  ): Promise<KnowledgeResult<KnowledgeImportResult | null>> {
    try {
      await this.ensureLoaded()
      if (profileId && !this.manifest.profiles.some((profile) => profile.id === profileId)) {
        return failure('要关联的岗位档案不存在')
      }
      const result = { canceled: false, filePaths }
      if (result.canceled || result.filePaths.length === 0) return success(null)
      if (result.filePaths.length > KNOWLEDGE_MAX_IMPORT_FILES) {
        return failure(`一次最多导入 ${KNOWLEDGE_MAX_IMPORT_FILES} 个文档`)
      }

      const importedIds: string[] = []
      const duplicateIds: string[] = []
      const failures: KnowledgeImportFailure[] = []

      for (const sourcePath of result.filePaths) {
        const name = cleanSingleLine(basename(sourcePath), 200) || '未命名文档'
        const extension = extname(name).toLowerCase()
        let documentId = ''
        try {
          if (!SUPPORTED_EXTENSIONS.has(extension))
            throw new Error(`不支持 ${extension || '未知'} 格式`)
          const metadata = await stat(sourcePath)
          if (!metadata.isFile()) throw new Error('选择的路径不是文件')
          if (metadata.size > KNOWLEDGE_MAX_FILE_BYTES) throw new Error('文件超过 10 MB 限制')
          if (metadata.size === 0) throw new Error('文件为空')

          const sha256 = await this.hashFile(sourcePath)
          const duplicate = this.manifest.documents.find((document) => document.sha256 === sha256)
          if (duplicate) {
            if (profileId) this.linkDocumentInternal(profileId, duplicate.id)
            duplicateIds.push(duplicate.id)
            await this.saveManifest()
            this.emitSnapshot()
            continue
          }

          documentId = randomUUID()
          const timestamp = now()
          const storedFileName = `${documentId}${extension}`
          const document: StoredKnowledgeDocument = {
            id: documentId,
            name,
            extension,
            mediaType:
              extension === '.pdf'
                ? 'application/pdf'
                : extension === '.docx'
                  ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                  : 'text/plain',
            size: metadata.size,
            sha256,
            status: 'processing',
            characterCount: 0,
            chunkCount: 0,
            createdAt: timestamp,
            updatedAt: timestamp,
            storedFileName
          }
          this.manifest.documents.push(document)
          if (profileId) this.linkDocumentInternal(profileId, documentId)
          importedIds.push(documentId)
          await this.saveManifest()
          this.emitSnapshot()
          this.emitProgress({
            documentId,
            name,
            stage: 'copying',
            completed: 0,
            total: 1
          })
          await copyFile(sourcePath, this.getStoredPath(document))
          const parseError = await this.processStoredDocument(documentId)
          if (parseError) failures.push({ name, error: parseError })
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error)
          failures.push({ name, error: message })
          if (documentId) {
            const document = this.manifest.documents.find(
              (candidate) => candidate.id === documentId
            )
            if (document && document.status === 'processing') {
              document.status = 'error'
              document.error = message
              document.updatedAt = now()
              await this.saveManifest()
              this.emitSnapshot()
            }
          }
        }
      }

      return success({ snapshot: this.snapshot(), importedIds, duplicateIds, failures })
    } catch (error) {
      return failure(error)
    }
  }

  async updateDocumentLink(
    profileId: string,
    documentId: string,
    patch: KnowledgeLinkPatch
  ): Promise<KnowledgeResult<KnowledgeSnapshot>> {
    try {
      await this.ensureLoaded()
      const profile = this.manifest.profiles.find((candidate) => candidate.id === profileId)
      const document = this.manifest.documents.find((candidate) => candidate.id === documentId)
      if (!profile || !document) return failure('岗位档案或文档不存在')
      const existing = profile.documentLinks.find((link) => link.documentId === documentId)
      if (patch.linked === false) {
        profile.documentLinks = profile.documentLinks.filter(
          (link) => link.documentId !== documentId
        )
      } else if (!existing) {
        profile.documentLinks.push({
          documentId,
          priority: patch.priority === 'key' ? 'key' : 'normal',
          linkedAt: now()
        })
      } else if (patch.priority) {
        existing.priority = patch.priority
      }
      profile.updatedAt = now()
      await this.saveManifest()
      this.emitSnapshot()
      return success(this.snapshot())
    } catch (error) {
      return failure(error)
    }
  }

  async deleteDocument(documentId: string): Promise<KnowledgeResult<KnowledgeSnapshot>> {
    try {
      await this.ensureLoaded()
      const document = this.manifest.documents.find((candidate) => candidate.id === documentId)
      if (!document) return failure('文档不存在')
      this.manifest.documents = this.manifest.documents.filter(
        (candidate) => candidate.id !== documentId
      )
      this.manifest.profiles.forEach((profile) => {
        profile.documentLinks = profile.documentLinks.filter(
          (link) => link.documentId !== documentId
        )
      })
      await Promise.all([
        rm(this.getStoredPath(document), { force: true }),
        rm(this.getChunksPath(document.id), { force: true })
      ])
      await this.saveManifest()
      this.emitSnapshot()
      return success(this.snapshot())
    } catch (error) {
      return failure(error)
    }
  }

  async retryDocument(documentId: string): Promise<KnowledgeResult<KnowledgeSnapshot>> {
    try {
      await this.ensureLoaded()
      const error = await this.processStoredDocument(documentId)
      return error ? failure(error) : success(this.snapshot())
    } catch (error) {
      return failure(error)
    }
  }

  private scheduleIndexWarmup(): void {
    if (this.warmupTimer) clearTimeout(this.warmupTimer)
    this.warmupTimer = setTimeout(() => {
      this.warmupTimer = null
      void this.syncSearchIndex().catch((error) =>
        console.error('Knowledge index warmup failed:', error)
      )
    }, appConfig.knowledge.indexPrewarmDelayMs)
  }

  private syncSearchIndex() {
    return this.search.call(
      'sync',
      this.manifest.documents
        .filter((document) => document.status === 'ready')
        .map((document) => ({
          id: document.id,
          name: document.name,
          revision: document.updatedAt,
          path: this.getChunksPath(document.id)
        }))
    )
  }

  private retrievalProfile(profileId: string | null, includeBuiltin: boolean): KnowledgeProfile {
    if (profileId)
      return structuredClone(this.manifest.profiles.find((profile) => profile.id === profileId)!)
    const profile = createBuiltinFrontendProfile()
    profile.documentLinks = []
    if (!includeBuiltin) {
      profile.name = '未选择岗位'
      profile.role = ''
      profile.jobDescription = ''
    }
    return profile
  }

  async diagnose(input: KnowledgeDiagnosticInput): Promise<KnowledgeResult<KnowledgeDiagnostic>> {
    try {
      const startedAt = performance.now()
      await this.ensureLoaded()
      const profile = this.retrievalProfile(input.profileId, input.includeBuiltin)
      if (input.profileId === null) {
        profile.name = '共享文档库'
        profile.role = ''
        profile.jobDescription = ''
        profile.documentLinks = this.manifest.documents
          .filter((document) => document.status === 'ready')
          .map((document) => ({
            documentId: document.id,
            priority: 'normal',
            linkedAt: document.createdAt
          }))
      }
      const index = await this.syncSearchIndex()
      const result = await this.search.call('search', {
        query: input.query.trim(),
        profile,
        includeBuiltin: input.includeBuiltin
      })
      return success({ ...result.diagnostic, ...index, elapsedMs: performance.now() - startedAt })
    } catch (error) {
      return failure(error)
    }
  }

  async previewDocument(documentId: string): Promise<KnowledgeResult<KnowledgePassage[]>> {
    try {
      await this.ensureLoaded()
      await this.syncSearchIndex()
      return success(await this.search.call('preview', documentId))
    } catch (error) {
      return failure(error)
    }
  }

  async retrieve(query: string, semanticQuery = ''): Promise<KnowledgeRetrieval | null> {
    await this.ensureLoaded()
    const profileId = this.manifest.activeProfileId
    const includeBuiltin = this.manifest.builtinFrontendKnowledgeEnabled
    if (!profileId && !includeBuiltin) return null
    const profile = this.retrievalProfile(profileId, includeBuiltin)
    await this.syncSearchIndex()
    const result = await this.search.call('search', {
      query: [query, semanticQuery].filter(Boolean).join('\n'),
      profile,
      includeBuiltin
    })
    return result.retrieval
  }
}

export const knowledgeService = new KnowledgeService()
