import { describe, expect, it } from 'vitest'
import type { AssistantMode, ConversationSummary } from '../preload/contracts'
import { planConversationDeletion } from './conversation-deletion'

function summary(id: string, mode: AssistantMode): ConversationSummary {
  return {
    id,
    title: id,
    mode,
    createdAt: '2026-10-19T01:00:00.000Z',
    updatedAt: '2026-10-19T01:00:00.000Z'
  }
}

const index = {
  conversations: [summary('a', 'chat'), summary('b', 'chat'), summary('s', 'screenshot')],
  active: { chat: 'b', screenshot: 's' } as Record<AssistantMode, string | null>
}

describe('planConversationDeletion', () => {
  it('splits the index into deleted and kept entries', () => {
    const plan = planConversationDeletion(index, ['a', 's'])
    expect(plan.deleted.map((item) => item.id)).toEqual(['a', 's'])
    expect(plan.kept.map((item) => item.id)).toEqual(['b'])
  })

  it('replaces the active conversation of each mode it deletes', () => {
    expect(planConversationDeletion(index, ['a']).replacedModes).toEqual([])
    expect(planConversationDeletion(index, ['b', 's']).replacedModes).toEqual([
      'chat',
      'screenshot'
    ])
  })

  it('ignores unknown and repeated ids', () => {
    const plan = planConversationDeletion(index, ['a', 'a', 'missing'])
    expect(plan.deleted.map((item) => item.id)).toEqual(['a'])
    expect(plan.kept).toHaveLength(2)
  })

  it('does not replace an active conversation that was never saved to the index', () => {
    const plan = planConversationDeletion(
      { conversations: [summary('a', 'chat')], active: { chat: 'draft', screenshot: null } },
      ['draft']
    )
    expect(plan.deleted).toEqual([])
    expect(plan.replacedModes).toEqual([])
  })

  it('does not mutate the input index', () => {
    const before = structuredClone(index)
    planConversationDeletion(index, ['a', 'b', 's'])
    expect(index).toEqual(before)
  })
})
