import { ipcMain } from 'electron'
import {
  activeConversation,
  activateConversation,
  deleteConversation,
  exportConversation,
  flushConversations,
  getConversationView,
  listConversations,
  loadConversation,
  newConversation,
  renameConversation
} from '../conversations'
import { knowledgeService } from '../knowledge/service'
import type { AssistantMode } from '../../preload/contracts'
import {
  clearAutoReplyQueue,
  detachConversationStream,
  drainAutoReplyQueue,
  resetChatModels,
  restoreChatModels,
  setAssistantMode
} from './chat'
import { sendChatEvent, sendVisionEvent } from './events'
import {
  abortCurrentStream,
  beginConversationTransition,
  endConversationTransition,
  getCurrentStream,
  setCurrentStream
} from './stream-context'
import { resetVisionModels, restoreVisionModels } from './vision'

let conversationTransitions = Promise.resolve()

export function restoreConversationModels() {
  restoreVisionModels()
  restoreChatModels()
}

function clearKnowledgeScopedConversations(): void {
  clearAutoReplyQueue()
  if (getCurrentStream()) {
    abortCurrentStream('profile-switch')
    setCurrentStream(null)
  }
  resetVisionModels()
  resetChatModels()

  const mainWindow = global.mainWindow
  if (mainWindow && !mainWindow.isDestroyed()) {
    sendVisionEvent('solution-clear')
    sendVisionEvent('ai-loading-end')
  }
  sendChatEvent({ type: 'conversation-cleared' })
}

/** Serialize conversation switches; requests are rejected while one is pending */
export function transitionConversation<T>(action: () => Promise<T>): Promise<T> {
  beginConversationTransition()
  const operation = conversationTransitions.then(async () => {
    detachConversationStream()
    try {
      await flushConversations()
      return await action()
    } finally {
      endConversationTransition()
      drainAutoReplyQueue()
    }
  })
  conversationTransitions = operation.then(
    () => undefined,
    () => undefined
  )
  return operation
}

ipcMain.handle('getConversations', () => listConversations())
ipcMain.handle('getConversationViews', () => ({
  screenshot: getConversationView('screenshot'),
  chat: getConversationView('chat')
}))
ipcMain.handle('openConversation', (_event, id: string) =>
  transitionConversation(async () => {
    const conversation = await loadConversation(id)
    const profile = await knowledgeService.setActiveProfile(conversation.profileId)
    if (!profile.ok) throw new Error(profile.error)
    const builtin = await knowledgeService.setBuiltinKnowledgeEnabled(conversation.builtinKnowledge)
    if (!builtin.ok) throw new Error(builtin.error)
    const otherMode = conversation.mode === 'chat' ? 'screenshot' : 'chat'
    const otherConversation = activeConversation(otherMode)
    if (
      otherConversation.profileId !== conversation.profileId ||
      otherConversation.builtinKnowledge !== conversation.builtinKnowledge
    ) {
      newConversation(otherMode)
    }
    activateConversation(conversation)
    restoreConversationModels()
    setAssistantMode(conversation.mode)
    return { screenshot: getConversationView('screenshot'), chat: getConversationView('chat') }
  })
)
ipcMain.handle('newConversation', (_event, mode: AssistantMode) =>
  transitionConversation(async () => {
    newConversation(mode)
    restoreConversationModels()
    return { screenshot: getConversationView('screenshot'), chat: getConversationView('chat') }
  })
)
ipcMain.handle('renameConversation', async (_event, id: string, title: string) => {
  await renameConversation(id, title)
  return listConversations()
})
ipcMain.handle('deleteConversation', (_event, id: string) =>
  transitionConversation(async () => {
    await deleteConversation(id)
    restoreConversationModels()
    return { screenshot: getConversationView('screenshot'), chat: getConversationView('chat') }
  })
)
ipcMain.handle('exportConversation', (_event, id: string) => exportConversation(id))

ipcMain.handle('activateKnowledgeProfile', async (_event, profileId: string | null) => {
  const currentSnapshot = await knowledgeService.getSnapshot()
  if (currentSnapshot.activeProfileId === profileId) {
    return { ok: true, data: currentSnapshot }
  }

  const result = await knowledgeService.setActiveProfile(profileId)
  if (!result.ok) return result
  clearKnowledgeScopedConversations()
  return result
})

ipcMain.handle('setBuiltinKnowledgeEnabled', async (_event, enabled: boolean) => {
  const currentSnapshot = await knowledgeService.getSnapshot()
  if (currentSnapshot.builtinFrontendKnowledgeEnabled === enabled) {
    return { ok: true, data: currentSnapshot }
  }

  const result = await knowledgeService.setBuiltinKnowledgeEnabled(enabled)
  if (result.ok) clearKnowledgeScopedConversations()
  return result
})

ipcMain.handle('deleteKnowledgeProfile', async (_event, profileId: string) => {
  const snapshot = await knowledgeService.getSnapshot()
  const wasActive = snapshot.activeProfileId === profileId
  const result = await knowledgeService.deleteProfile(profileId)
  if (result.ok && wasActive) clearKnowledgeScopedConversations()
  return result
})
