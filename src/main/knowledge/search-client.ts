import { randomUUID } from 'node:crypto'
import createSearchWorker from './search-worker?nodeWorker'
import type { SearchOperations } from './search-worker'

export class KnowledgeSearchClient {
  private worker: ReturnType<typeof createSearchWorker> | null = null
  private pending = new Map<
    string,
    { resolve: (data: unknown) => void; reject: (error: Error) => void }
  >()

  private ensureWorker() {
    if (this.worker) return this.worker
    const worker = createSearchWorker({})
    worker.on('message', (result) => {
      const task = this.pending.get(result.taskId)!
      this.pending.delete(result.taskId)
      if (result.ok) task.resolve(result.data)
      else task.reject(new Error(result.error))
    })
    worker.on('error', (error) => {
      this.pending.forEach((task) => task.reject(error))
      this.pending.clear()
    })
    worker.on('exit', () => {
      this.worker = null
      this.pending.forEach((task) => task.reject(new Error('知识库检索进程已退出')))
      this.pending.clear()
    })
    this.worker = worker
    return worker
  }

  call<K extends keyof SearchOperations>(
    type: K,
    input: SearchOperations[K]['input']
  ): Promise<SearchOperations[K]['output']> {
    const taskId = randomUUID()
    return new Promise((resolve, reject) => {
      this.pending.set(taskId, {
        resolve: (data) => resolve(data as SearchOperations[K]['output']),
        reject
      })
      this.ensureWorker().postMessage({ taskId, type, input })
    })
  }
}
