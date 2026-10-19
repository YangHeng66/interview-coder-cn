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

/**
 * Which request wrote the exchange at the end of the model history, so a voice
 * resend can take back the answer to its first half. Only that last exchange can
 * go: anything answered after it keeps the history as it is.
 */
export class ChatHistoryTail {
  private requestId: string | null = null
  private length = 0

  /** Call after the request's question and answer were appended to the history */
  record(requestId: string, history: ModelMessage[]): void {
    this.requestId = requestId
    this.length = history.length
  }

  withoutReplaced(history: ModelMessage[], replacesRequestId: string | undefined): ModelMessage[] {
    if (
      !replacesRequestId ||
      this.requestId !== replacesRequestId ||
      history.length !== this.length
    ) {
      return history
    }
    this.reset()
    return history.slice(0, -2)
  }

  reset(): void {
    this.requestId = null
    this.length = 0
  }
}
