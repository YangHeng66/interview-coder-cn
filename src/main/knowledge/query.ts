const MAX_RECENT_CONTEXT_CHARACTERS = 4_000
const MAX_EXPANSION_CHARACTERS = 1_000

export function buildKnowledgeQueryRewritePrompt(
  question: string,
  recentConversation = ''
): string {
  const context = recentConversation.trim().slice(-MAX_RECENT_CONTEXT_CHARACTERS)
  return [
    context ? `最近对话：\n${context}` : '',
    `当前问题：\n${question.trim()}`,
    '请输出适合检索的完整改写和技术关键词。'
  ]
    .filter(Boolean)
    .join('\n\n')
}

export function normalizeKnowledgeQueryExpansion(value: string): string {
  const lines = value
    .replace(/```(?:text|markdown)?/gi, '')
    .replace(/```/g, '')
    .split(/\r?\n/)
    .map((line) =>
      line.replace(/^\s*(?:[-*]\s*)?(?:QUERY|TERMS|改写|关键词|检索词)\s*[:：]\s*/i, '').trim()
    )
    .filter(Boolean)

  return lines.join('\n').slice(0, MAX_EXPANSION_CHARACTERS).trim()
}
