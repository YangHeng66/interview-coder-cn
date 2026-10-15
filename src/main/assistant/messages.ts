import type { ModelMessage } from 'ai'

export function getMessageText(message: ModelMessage): string {
  if (typeof message.content === 'string') return message.content
  if (!Array.isArray(message.content)) return ''
  return message.content
    .map((part) => {
      if (!part || typeof part !== 'object' || !('type' in part) || part.type !== 'text') return ''
      return 'text' in part && typeof part.text === 'string' ? part.text : ''
    })
    .filter(Boolean)
    .join('\n')
}

export function createRecentKnowledgeContext(messages: ModelMessage[]): string {
  return messages
    .slice(-6)
    .map((message) => {
      const text = getMessageText(message).trim()
      return text ? `${message.role}: ${text}` : ''
    })
    .filter(Boolean)
    .join('\n')
    .slice(-4_000)
}
