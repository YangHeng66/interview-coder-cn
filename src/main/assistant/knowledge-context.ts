import { activeConversation, recordKnowledge } from '../conversations'
import { rewriteKnowledgeQuery } from '../ai'
import { settings } from '../settings'
import { knowledgeService } from '../knowledge/service'
import type { KnowledgeRetrieval } from '../knowledge/search'
import type { KnowledgeContextUsed } from '../../preload/contracts'

function sendKnowledgeContextUsed(
  mode: KnowledgeContextUsed['mode'],
  retrieval: KnowledgeRetrieval,
  requestId?: string
): void {
  const mainWindow = global.mainWindow
  if (!mainWindow || mainWindow.isDestroyed()) return
  const context = {
    mode,
    requestId,
    profileId: retrieval.profileId,
    profileName: retrieval.profileName,
    sources: retrieval.sources
  } satisfies KnowledgeContextUsed
  recordKnowledge(context)
  mainWindow.webContents.send('knowledge-context-used', context)
}

export async function retrieveKnowledgeContext(
  mode: KnowledgeContextUsed['mode'],
  query: string,
  requestId?: string,
  recentConversation = '',
  abortSignal?: AbortSignal
): Promise<KnowledgeRetrieval | null> {
  try {
    const knowledgeSnapshot = await knowledgeService.getSnapshot()
    if (abortSignal?.aborted) return null
    const conversation = activeConversation(mode === 'chat' ? 'chat' : 'screenshot')
    conversation.profileId = knowledgeSnapshot.activeProfileId
    conversation.builtinKnowledge = knowledgeSnapshot.builtinFrontendKnowledgeEnabled
    if (!knowledgeSnapshot.activeProfileId && !knowledgeSnapshot.builtinFrontendKnowledgeEnabled) {
      return null
    }

    let semanticQuery = ''
    if (settings.knowledgeQueryRewrite && query.trim()) {
      try {
        semanticQuery = await rewriteKnowledgeQuery(mode, query, recentConversation, abortSignal)
      } catch (error) {
        if (abortSignal?.aborted) return null
        console.warn('AI knowledge query rewrite failed; using the original query:', error)
      }
    }
    if (abortSignal?.aborted) return null

    const retrieval = await knowledgeService.retrieve(query, semanticQuery)
    if (abortSignal?.aborted) return null
    if (retrieval) sendKnowledgeContextUsed(mode, retrieval, requestId)
    return retrieval
  } catch (error) {
    console.warn('Knowledge retrieval failed; continuing without knowledge context:', error)
    return null
  }
}
