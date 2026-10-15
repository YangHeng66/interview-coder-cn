import { describe, expect, it } from 'vitest'
import { DEFAULT_MOCK_INTERVIEW_PROMPT } from '../../preload/contracts'
import { formatInterviewBrief } from './mock-interview-brief'
import { buildPersonaSystemPrompt } from './personas'

const profile = { company: '示例公司', role: '前端工程师', jobDescription: '负责 React 组件开发' }

describe('formatInterviewBrief', () => {
  it('includes the job fields and document excerpts', () => {
    const brief = formatInterviewBrief(
      profile,
      [{ name: '简历.pdf', text: '三年 React 经验' }],
      1000
    )
    expect(brief).toContain('公司：示例公司')
    expect(brief).toContain('岗位描述：\n负责 React 组件开发')
    expect(brief).toContain('### 简历.pdf\n三年 React 经验')
  })

  it('shares the remaining budget between documents', () => {
    const long = 'x'.repeat(500)
    const brief = formatInterviewBrief(
      profile,
      [
        { name: 'a.md', text: long },
        { name: 'b.md', text: long }
      ],
      400
    )
    expect(brief.length).toBeLessThanOrEqual(400)
    expect(brief).toContain('### a.md')
    expect(brief).toContain('### b.md')
  })
})

describe('mock interview system prompt', () => {
  it('describes the plan and the brief', () => {
    const prompt = buildPersonaSystemPrompt(
      {
        persona: 'mock-interview',
        mockInterview: { questionCount: 5, focus: 'project', brief: '公司：示例公司' }
      },
      null
    )
    expect(prompt).toContain(DEFAULT_MOCK_INTERVIEW_PROMPT)
    expect(prompt).toContain('计划题数：5')
    expect(prompt).toContain('侧重：项目经历')
    expect(prompt).toContain('公司：示例公司')
  })

  it('falls back to a generic role without a brief', () => {
    const prompt = buildPersonaSystemPrompt(
      { persona: 'mock-interview', mockInterview: { questionCount: 3, focus: 'mixed', brief: '' } },
      null
    )
    expect(prompt).toContain('通用前端开发岗位')
  })
})
