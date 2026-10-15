import { DEFAULT_REVIEW_REPORT_PROMPT, type ConversationView } from '../../preload/contracts'

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
  conversation: Pick<ConversationView, 'persona'>,
  profile: JobProfile | null
): string | undefined {
  if (conversation.persona !== 'review') return undefined
  return [DEFAULT_REVIEW_REPORT_PROMPT, formatProfile(profile)].filter(Boolean).join('\n\n')
}
