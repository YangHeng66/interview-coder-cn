import { ipcMain } from 'electron'
import type {
  KnowledgeDiagnosticInput,
  KnowledgeLinkPatch,
  KnowledgeProfileInput,
  KnowledgeProfilePatch
} from '../../preload/contracts'
import { knowledgeService } from './service'

ipcMain.handle('getKnowledgeSnapshot', () => knowledgeService.getSnapshot())
ipcMain.handle('diagnoseKnowledge', (_event, input: KnowledgeDiagnosticInput) =>
  knowledgeService.diagnose(input)
)
ipcMain.handle('previewKnowledgeDocument', (_event, documentId: string) =>
  knowledgeService.previewDocument(documentId)
)

ipcMain.handle('createKnowledgeProfile', (_event, input: KnowledgeProfileInput) =>
  knowledgeService.createProfile(input)
)

ipcMain.handle(
  'updateKnowledgeProfile',
  (_event, profileId: string, patch: KnowledgeProfilePatch) =>
    knowledgeService.updateProfile(profileId, patch)
)

ipcMain.handle(
  'importKnowledgeDocuments',
  (_event, profileId: string | undefined, paths: string[]) =>
    knowledgeService.importDocuments(profileId, paths)
)

ipcMain.handle(
  'updateKnowledgeDocumentLink',
  (_event, profileId: string, documentId: string, patch: KnowledgeLinkPatch) =>
    knowledgeService.updateDocumentLink(profileId, documentId, patch)
)

ipcMain.handle('deleteKnowledgeDocument', (_event, documentId: string) =>
  knowledgeService.deleteDocument(documentId)
)

ipcMain.handle('retryKnowledgeDocument', (_event, documentId: string) =>
  knowledgeService.retryDocument(documentId)
)
