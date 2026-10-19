import type { AssistantMode, ConversationSummary } from '../preload/contracts'

type ConversationIndex = {
  conversations: ConversationSummary[]
  active: Record<AssistantMode, string | null>
}

/** Ids not in the index are ignored, so a stale selection cannot delete anything else */
export function planConversationDeletion(index: ConversationIndex, ids: Iterable<string>) {
  const targets = new Set(ids)
  const deleted = index.conversations.filter((item) => targets.has(item.id))
  const deletedIds = new Set(deleted.map((item) => item.id))
  return {
    deleted,
    kept: index.conversations.filter((item) => !deletedIds.has(item.id)),
    replacedModes: (Object.keys(index.active) as AssistantMode[]).filter((mode) =>
      deletedIds.has(index.active[mode] ?? '')
    )
  }
}
