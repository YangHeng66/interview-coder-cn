import type { ModelMessage } from 'ai'
import type { ConversationView, SavedChatMessage } from '../../preload/contracts'

type ReviewConversation = ConversationView & { modelMessages: ModelMessage[] }

const TRUNCATED_MARK = '（较早内容已截断）\n'

function userLabel(message: SavedChatMessage): string {
  if (message.source === 'transcription') return '面试官/我（语音）'
  if (message.source === 'control') return '指令'
  return '我（输入）'
}

function describeChat(conversation: ReviewConversation): string[] {
  return conversation.chatMessages.flatMap((message) => {
    if (message.role === 'user') return [`${userLabel(message)}：${message.content}`]
    // Failed or empty answers carry no review value
    if (!message.content.trim() || message.status === 'error') return []
    return [`AI 参考回答：${message.content}`]
  })
}

function describeVision(conversation: ReviewConversation): string[] {
  if (!conversation.modelMessages.length) {
    return conversation.visionText.trim() ? [`AI 参考回答：${conversation.visionText}`] : []
  }
  return conversation.modelMessages.flatMap((message) => {
    if (message.role === 'assistant') {
      return typeof message.content === 'string' && message.content.trim()
        ? [`AI 参考回答：${message.content}`]
        : []
    }
    if (message.role !== 'user') return []
    if (typeof message.content === 'string') return [`题目/补充：${message.content}`]
    const text = message.content
      .map((part) => (part.type === 'text' ? part.text : part.type === 'image' ? '[截图]' : ''))
      .filter(Boolean)
      .join(' ')
    return text ? [`题目/补充：${text}`] : []
  })
}

function describeConversation(conversation: ReviewConversation): string {
  const turns =
    conversation.mode === 'chat' ? describeChat(conversation) : describeVision(conversation)
  const sourceNames = [
    ...new Set(conversation.sources.flatMap((context) => context.sources.map((s) => s.name)))
  ]
  return [
    `# ${conversation.title}（${conversation.mode === 'chat' ? '文字/语音' : '截图'}，${conversation.createdAt.slice(0, 16).replace('T', ' ')}）`,
    ...turns,
    sourceNames.length ? `参考资料：${sourceNames.join('、')}` : ''
  ]
    .filter(Boolean)
    .join('\n\n')
}

/** Plain-text transcript of the selected conversations, oldest first, trimmed from the start */
export function buildReviewMaterial(conversations: ReviewConversation[], maxCharacters: number) {
  const material = [...conversations]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(describeConversation)
    .join('\n\n')
  if (material.length <= maxCharacters) return material
  return TRUNCATED_MARK + material.slice(material.length - maxCharacters)
}
