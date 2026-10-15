import { app, ipcMain } from 'electron'
import appConfig from '../../app.config.json'
import {
  setToolbarContentProtection,
  setToolbarOpacity,
  syncToolbarSettings
} from './toolbar-window'
import { setContentProtectionEnabled } from './content-protection'
import { isSecretStorageEncrypted, loadSecrets, persistSecrets } from './secrets'
import {
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  DEFAULT_CHAT_SYSTEM_PROMPT,
  DEFAULT_DASHSCOPE_ASR_MODEL,
  DEFAULT_DASHSCOPE_ASR_WS_URL,
  DEFAULT_VOLCENGINE_ASR_MODEL,
  DEFAULT_VOLCENGINE_ASR_RESOURCE_ID,
  DEFAULT_VOLCENGINE_ASR_WS_URL,
  type ApiProtocol,
  type ChatProvider,
  type ThinkingLevel,
  pickSecretSettings,
  SECRET_SETTING_KEYS,
  type SecretStorageStatus,
  type TranscriptionAudioSource,
  type TranscriptionProvider
} from '../preload/contracts'

const settingsListeners = new Set<(settings: AppSettings, patch: Partial<AppSettings>) => void>()

ipcMain.handle('getAppSettings', async () => {
  await secretsReady
  return settings
})

ipcMain.handle('getSecretStorageStatus', async (): Promise<SecretStorageStatus> => {
  await secretsReady
  return { encrypted: isSecretStorageEncrypted() }
})

ipcMain.handle('updateAppSettings', async (_event, _settings: Partial<AppSettings>) => {
  // Apply stored keys first so an early renderer sync is not overwritten by them.
  await secretsReady
  const secretsChanged = SECRET_SETTING_KEYS.some(
    (key) => key in _settings && _settings[key] !== settings[key]
  )
  Object.assign(settings, _settings)
  settingsListeners.forEach((listener) => {
    try {
      listener(settings, _settings)
    } catch (error) {
      console.error('App settings listener failed:', error)
    }
  })
  if ('hideDockIcon' in _settings) {
    applyDockVisibility(settings.hideDockIcon)
  }
  if ('opacity' in _settings) {
    setToolbarOpacity(settings.opacity)
  }
  if ('contentProtectionEnabled' in _settings) {
    setContentProtectionEnabled(settings.contentProtectionEnabled)
    setToolbarContentProtection(settings.contentProtectionEnabled)
  }
  if ('toolbarHoverDelay' in _settings) {
    syncToolbarSettings(settings.toolbarHoverDelay)
  }
  // Rejects on failure so the renderer's v14 migration keeps the keys in localStorage
  if (secretsChanged) await persistSecrets(pickSecretSettings(settings))
})

/** Show/hide the macOS dock icon. No-op on other platforms. */
export function applyDockVisibility(hidden: boolean): void {
  if (process.platform !== 'darwin') return
  if (hidden) {
    app.dock?.hide()
  } else {
    app.dock?.show()
  }
}

export const settings = {
  knowledgeQueryRewrite: appConfig.performance.knowledgeQueryRewrite,
  requestHistoryTurns: appConfig.performance.requestHistoryTurns,
  apiProtocol: 'chat-completions' as ApiProtocol,
  apiBaseURL: process.env.API_BASE_URL || '',
  apiKey: process.env.API_KEY || '',
  model: process.env.MODEL || '',
  modelThinkingLevels: {} as Record<string, ThinkingLevel>,
  apiBaseURLHistory: [] as string[],
  customPrompt: '',
  chatProvider: 'deepseek' as ChatProvider,
  chatApiProtocol: 'chat-completions' as ApiProtocol,
  chatApiBaseURL: DEEPSEEK_API_BASE_URL,
  chatApiKey: '',
  chatModel: DEEPSEEK_DEFAULT_MODEL,
  chatModelThinkingLevels: {} as Record<string, ThinkingLevel>,
  chatApiBaseURLHistory: [] as string[],
  chatCustomModels: [] as string[],
  chatSystemPrompt: DEFAULT_CHAT_SYSTEM_PROMPT,
  /** Kept in sync with the renderer so the overlay toolbar can match the main window */
  opacity: 0.8,
  contentProtectionEnabled: true,
  /**
   * Dwell time in ms before hovering a toolbar button fires it; 0 disables hover
   * triggering. The real default lives in the renderer store: App.tsx fills blank
   * renderer fields from here, so a truthy default would overwrite a user's "off".
   */
  toolbarHoverDelay: 0,
  screenshotAutoSave: false,
  screenshotDir: '',
  transcriptionAudioSource: 'system' as TranscriptionAudioSource,
  transcriptionAutoReply: false,
  transcriptionProvider: 'dashscope' as TranscriptionProvider,
  dashscopeApiKey: '',
  dashscopeAsrModel: DEFAULT_DASHSCOPE_ASR_MODEL,
  dashscopeAsrWsUrl: DEFAULT_DASHSCOPE_ASR_WS_URL,
  volcengineAsrApiKey: '',
  volcengineAsrModel: DEFAULT_VOLCENGINE_ASR_MODEL,
  volcengineAsrResourceId: DEFAULT_VOLCENGINE_ASR_RESOURCE_ID,
  volcengineAsrWsUrl: DEFAULT_VOLCENGINE_ASR_WS_URL,
  hideDockIcon: false,
  audioInputDeviceId: '',
  audioOutputDeviceId: ''
}

export type AppSettings = typeof settings

export function subscribeAppSettings(
  listener: (settings: AppSettings, patch: Partial<AppSettings>) => void
): () => void {
  settingsListeners.add(listener)
  return () => settingsListeners.delete(listener)
}

const secretsReady = app.whenReady().then(async () => {
  const stored = await loadSecrets()
  for (const key of SECRET_SETTING_KEYS) {
    // Empty stored values keep the .env default
    if (stored[key]) settings[key] = stored[key]
  }
})
