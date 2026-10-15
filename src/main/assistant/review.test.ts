import { describe, expect, it } from 'vitest'
import type { ModelMessage } from 'ai'
import type { ConversationView } from '../../preload/contracts'
import { DEFAULT_REVIEW_REPORT_PROMPT } from '../../preload/contracts'
import { buildPersonaSystemPrompt } from './personas'
import { buildReviewMaterial } from './review-material'

type StoredConversation = ConversationView & { modelMessages: ModelMessage[] }

function conversation(patch: Partial<StoredConversation>): StoredConversation {
  return {
    id: 'c',
    title: '会话',
    mode: 'chat',
    createdAt: '2026-10-15T01:00:00.000Z',
    updatedAt: '2026-10-15T01:00:00.000Z',
    chatMessages: [],
    visionText: '',
    visionStatus: 'idle',
    visionError: null,
    screenshots: [],
    sources: [],
    modelMessages: [],
    profileId: null,
    builtinKnowledge: false,
    ...patch
  }
}

const chat = conversation({
  id: 'chat',
  title: '一面',
  createdAt: '2026-10-15T02:00:00.000Z',
  chatMessages: [
    { id: '1', requestId: 'r1', role: 'user', content: '说说闭包', source: 'transcription' },
    {
      id: '2',
      requestId: 'r1',
      role: 'assistant',
      content: '闭包是函数和词法环境',
      status: 'complete'
    },
    { id: '3', requestId: 'r2', role: 'user', content: '再说说事件循环', source: 'typed' },
    { id: '4', requestId: 'r2', role: 'assistant', content: '', status: 'error', error: '超时' }
  ],
  sources: [
    {
      mode: 'chat',
      profileId: 'p',
      profileName: '前端',
      sources: [
        { documentId: 'd', name: '简历.pdf', excerpts: ['x'] },
        { documentId: 'd', name: '简历.pdf', excerpts: ['y'] }
      ]
    }
  ] as ConversationView['sources']
})

const screenshot = conversation({
  id: 'shot',
  title: '笔试',
  mode: 'screenshot',
  createdAt: '2026-10-15T01:00:00.000Z',
  modelMessages: [
    {
      role: 'user',
      content: [
        { type: 'text', text: '这是屏幕截图' },
        { type: 'image', image: 'abc' }
      ]
    },
    { role: 'assistant', content: '两数之和用哈希表' }
  ]
})

describe('buildReviewMaterial', () => {
  it('orders conversations by time and labels each turn', () => {
    const material = buildReviewMaterial([chat, screenshot], 10_000)
    expect(material.indexOf('笔试')).toBeLessThan(material.indexOf('一面'))
    expect(material).toContain('面试官/我（语音）：说说闭包')
    expect(material).toContain('我（输入）：再说说事件循环')
    expect(material).toContain('AI 参考回答：闭包是函数和词法环境')
    expect(material).toContain('这是屏幕截图 [截图]')
    expect(material).toContain('AI 参考回答：两数之和用哈希表')
    expect(material).toContain('参考资料：简历.pdf')
    expect(material.match(/简历\.pdf/g)).toHaveLength(1)
    expect(material).not.toContain('超时')
  })

  it('keeps the most recent content when over budget', () => {
    const material = buildReviewMaterial([chat, screenshot], 60)
    expect(material.startsWith('（较早内容已截断）')).toBe(true)
    expect(material).toContain('简历.pdf')
    expect(material).not.toContain('两数之和')
  })
})

describe('buildPersonaSystemPrompt', () => {
  it('returns nothing for a plain conversation', () => {
    expect(buildPersonaSystemPrompt({}, null)).toBeUndefined()
  })

  it('adds the job profile to the review prompt', () => {
    const prompt = buildPersonaSystemPrompt(
      { persona: 'review' },
      { company: '示例公司', role: '前端', jobDescription: '负责 React' }
    )
    expect(prompt).toContain(DEFAULT_REVIEW_REPORT_PROMPT)
    expect(prompt).toContain('示例公司')
    expect(prompt).toContain('负责 React')
  })
})
