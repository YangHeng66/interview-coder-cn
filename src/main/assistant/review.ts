import { app, ipcMain } from 'electron'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import appConfig from '../../../app.config.json'
import {
  activeConversation,
  getConversationView,
  loadConversation,
  newConversation,
  type Conversation
} from '../conversations'
import { isChatConfigured } from '../ai'
import { knowledgeService } from '../knowledge/service'
import type {
  KnowledgeImportResult,
  KnowledgeResult,
  PersonaConversationResult
} from '../../preload/contracts'
import { submitChatMessage } from './chat'
import { getActiveJobProfile } from './knowledge-context'
import { buildReviewMaterial } from './review-material'
import { restoreConversationModels, transitionConversation } from './session'

function reviewTitle(profile: { company: string; role: string } | null): string {
  const target = profile ? [profile.company, profile.role].filter(Boolean).join(' ') : ''
  const date = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })
  return ['面试复盘', target || '通用', date].join(' · ')
}

ipcMain.handle(
  'generateReviewReport',
  async (_event, conversationIds: string[]): Promise<PersonaConversationResult> => {
    if (!Array.isArray(conversationIds) || conversationIds.length === 0) {
      return { ok: false, error: '请至少选择一个会话' }
    }
    if (!isChatConfigured()) return { ok: false, error: '请先在设置中配置文字对话模型' }

    let conversations: Conversation[]
    try {
      conversations = await Promise.all(conversationIds.map((id) => loadConversation(id)))
    } catch (error) {
      return { ok: false, error: `读取会话失败：${String(error)}` }
    }
    const material = buildReviewMaterial(conversations, appConfig.review.maxInputCharacters)
    if (!material.trim()) return { ok: false, error: '所选会话没有可复盘的内容' }

    const title = reviewTitle(await getActiveJobProfile())
    await transitionConversation(async () => {
      newConversation('chat', { persona: 'review', title })
      restoreConversationModels()
    })
    // Sent as an attachment so the long transcript shows as a file chip, not a bubble
    const request = submitChatMessage(
      `请基于附件中的 ${conversations.length} 个会话记录生成面试复盘报告。`,
      'control',
      [
        {
          id: randomUUID(),
          name: '复盘材料.md',
          mediaType: 'text/markdown',
          size: Buffer.byteLength(material),
          text: material
        }
      ]
    )
    if (!request.accepted) return { ok: false, error: request.error }
    // Captured after submitting: the request's chat events reach the renderer before
    // this reply, so the views must already contain them.
    return {
      ok: true,
      views: { screenshot: getConversationView('screenshot'), chat: getConversationView('chat') }
    }
  }
)

function toFileName(title: string): string {
  return `${title.replace(/[\\/:*?"<>|]/g, '_').slice(0, 80) || '面试笔记'}.md`
}

ipcMain.handle(
  'saveMessageToKnowledge',
  async (_event, messageId: string): Promise<KnowledgeResult<KnowledgeImportResult | null>> => {
    const profile = await getActiveJobProfile()
    if (!profile) return { ok: false, error: '请先在知识库中选择当前岗位' }

    // The chat workspace only ever shows the active chat conversation
    const conversation = activeConversation('chat')
    const message = conversation.chatMessages.find(
      (item) => item.id === messageId && item.role === 'assistant'
    )
    if (!message?.content.trim()) return { ok: false, error: '该回答没有可保存的内容' }

    // The knowledge base imports from file paths; write a short-lived copy to import
    const directory = await mkdtemp(join(app.getPath('temp'), 'interview-note-'))
    try {
      const path = join(directory, toFileName(conversation.title))
      await writeFile(path, `# ${conversation.title}\n\n${message.content}\n`, 'utf8')
      return await knowledgeService.importDocuments(profile.id, [path])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  }
)
