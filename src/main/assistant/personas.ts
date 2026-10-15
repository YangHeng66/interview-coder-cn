import {
  DEFAULT_MOCK_INTERVIEW_PROMPT,
  DEFAULT_REVIEW_REPORT_PROMPT,
  MOCK_INTERVIEW_FOCUS_LABELS,
  type ConversationView
} from '../../preload/contracts'

type JobProfile = { company: string; role: string; jobDescription: string }

function formatProfile(profile: JobProfile | null): string {
  if (!profile) return ''
  return [
    '## 目标岗位',
    profile.company && `公司：${profile.company}`,
    profile.role && `岗位：${profile.role}`,
    profile.jobDescription && `岗位描述：\n${profile.jobDescription}`
  ]
    .filter(Boolean)
    .join('\n')
}

/** System prompt replacing the chat prompt for persona conversations */
export function buildPersonaSystemPrompt(
  conversation: Pick<ConversationView, 'persona' | 'mockInterview'>,
  profile: JobProfile | null
): string | undefined {
  if (conversation.persona === 'review') {
    return [DEFAULT_REVIEW_REPORT_PROMPT, formatProfile(profile)].filter(Boolean).join('\n\n')
  }
  if (conversation.persona === 'mock-interview' && conversation.mockInterview) {
    const { questionCount, focus, brief } = conversation.mockInterview
    return [
      DEFAULT_MOCK_INTERVIEW_PROMPT,
      `## 面试安排\n计划题数：${questionCount}\n侧重：${MOCK_INTERVIEW_FOCUS_LABELS[focus]}`,
      `## 岗位与候选人资料\n${brief || '未提供岗位资料，请按通用前端开发岗位出题。'}`
    ].join('\n\n')
  }
  return undefined
}
