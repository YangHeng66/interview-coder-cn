import { app, dialog, ipcMain } from 'electron'
import { setToolbarOpacity, syncToolbarSettings } from './toolbar-window'
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
  type TranscriptionProvider
} from '../preload/contracts'

ipcMain.handle('getAppSettings', () => {
  return settings
})

ipcMain.handle('updateAppSettings', (_event, _settings) => {
  Object.assign(settings, _settings)
  if ('hideDockIcon' in _settings) {
    applyDockVisibility(settings.hideDockIcon)
  }
  if ('opacity' in _settings) {
    setToolbarOpacity(settings.opacity)
  }
  if ('toolbarHoverDelay' in _settings) {
    syncToolbarSettings(settings.toolbarHoverDelay)
  }
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

ipcMain.handle('selectScreenshotDir', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory'],
    title: '选择截图保存目录'
  })
  if (result.canceled || result.filePaths.length === 0) {
    return null
  }
  return result.filePaths[0]
})

export const settings = {
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
  /**
   * Dwell time in ms before hovering a toolbar button fires it; 0 disables hover
   * triggering. The real default lives in the renderer store: App.tsx fills blank
   * renderer fields from here, so a truthy default would overwrite a user's "off".
   */
  toolbarHoverDelay: 0,
  screenshotAutoSave: false,
  screenshotDir: '',
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
