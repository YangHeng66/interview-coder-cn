import { ipcMain } from 'electron'
import appConfig from '../../../app.config.json'
import { activeConversation, getConversationView, newConversation } from '../conversations'
import { isChatConfigured } from '../ai'
import { knowledgeService } from '../knowledge/service'
import {
  MOCK_INTERVIEW_END_PROMPT,
  MOCK_INTERVIEW_FOCUS_LABELS,
  type KnowledgeProfile,
  type MockInterviewOptions,
  type PersonaConversationResult
} from '../../preload/contracts'
import { submitChatMessage } from './chat'
import { getActiveJobProfile } from './knowledge-context'
import { formatInterviewBrief } from './mock-interview-brief'
import { restoreConversationModels, transitionConversation } from './session'

/** Starred documents first; without stars the first few linked ones stand in */
const BRIEF_DOCUMENT_LIMIT = 3

async function buildBrief(profile: KnowledgeProfile): Promise<string> {
  const keyLinks = profile.documentLinks.filter((link) => link.priority === 'key')
  const links = (keyLinks.length ? keyLinks : profile.documentLinks).slice(0, BRIEF_DOCUMENT_LIMIT)
  const documents: { name: string; text: string }[] = []
  for (const link of links) {
    const result = await knowledgeService.previewDocument(link.documentId)
    if (!result.ok || !result.data.length) continue
    documents.push({
      name: result.data[0].documentName,
      text: result.data.map((passage) => passage.text).join('\n')
    })
  }
  return formatInterviewBrief(profile, documents, appConfig.knowledge.contextCharacterLimit)
}

function currentViews() {
  return { screenshot: getConversationView('screenshot'), chat: getConversationView('chat') }
}

ipcMain.handle(
  'startMockInterview',
  async (_event, options: MockInterviewOptions): Promise<PersonaConversationResult> => {
    if (!isChatConfigured()) return { ok: false, error: '请先在设置中配置文字对话模型' }
    const focus = options?.focus in MOCK_INTERVIEW_FOCUS_LABELS ? options.focus : 'mixed'
    const questionCount = Math.min(10, Math.max(1, Math.round(Number(options?.questionCount) || 5)))

    const profile = await getActiveJobProfile()
    const brief = profile ? await buildBrief(profile) : ''
    const target = profile ? [profile.company, profile.role].filter(Boolean).join(' ') : ''
    const date = new Date().toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' })

    await transitionConversation(async () => {
      newConversation('chat', {
        persona: 'mock-interview',
        title: ['模拟面试', target || '通用', date].join(' · '),
        mockInterview: { questionCount, focus, brief }
      })
      restoreConversationModels()
    })
    const request = submitChatMessage('请开始面试。', 'control')
    if (!request.accepted) return { ok: false, error: request.error }
    // Captured after submitting, see generateReviewReport
    return { ok: true, views: currentViews() }
  }
)

ipcMain.handle('endMockInterview', async (): Promise<PersonaConversationResult> => {
  const conversation = activeConversation('chat')
  if (conversation.persona !== 'mock-interview' || !conversation.mockInterview) {
    return { ok: false, error: '当前不是模拟面试会话' }
  }
  if (conversation.mockInterview.endedAt) return { ok: false, error: '本场模拟面试已结束' }

  const request = submitChatMessage(MOCK_INTERVIEW_END_PROMPT, 'control')
  if (!request.accepted) return { ok: false, error: request.error }
  // Persisted with the next save triggered by the request's chat events
  conversation.mockInterview.endedAt = new Date().toISOString()
  return { ok: true, views: currentViews() }
})
