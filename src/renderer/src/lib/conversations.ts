import type { AssistantMode, ConversationView } from '../../../preload/contracts'
import { useChatStore } from './store/chat'
import { useSolutionStore } from './store/solution'
import { useKnowledgeStore } from './store/knowledge'

export function applyConversationViews(views: Record<AssistantMode, ConversationView>) {
  window.dispatchEvent(new Event('conversation-restored'))
  const activeMessage = views.chat.chatMessages.findLast(
    (message) => message.status === 'streaming'
  )
  useChatStore.setState({
    messages: views.chat.chatMessages,
    isLoading: Boolean(activeMessage),
    activeRequestId: activeMessage?.requestId ?? null,
    errorMessage: null,
    autoReplyQueueCount: 0
  })
  useSolutionStore.setState({
    solutionChunks: [views.screenshot.visionText],
    screenshotData: views.screenshot.screenshots.at(-1) ?? null,
    recentScreenshots: views.screenshot.screenshots,
    isLoading: views.screenshot.visionStatus === 'streaming',
    errorMessage: views.screenshot.visionError
  })
  const knowledge = useKnowledgeStore.getState()
  knowledge.clearVisionContext()
  knowledge.clearChatContexts()
  views.screenshot.sources.forEach(knowledge.handleContextUsed)
  views.chat.sources.forEach(knowledge.handleContextUsed)
}
