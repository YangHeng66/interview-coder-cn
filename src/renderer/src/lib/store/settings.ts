import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import codingPrompt from './prompts/coding.md?raw'
import englishExamPrompt from './prompts/english-exam.md?raw'
import generalQaPrompt from './prompts/general-qa.md?raw'
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
  type TranscriptionProvider
} from '../../../../preload/contracts'

export {
  createTranscriptionConfig,
  getTranscriptionConfigError,
  isTranscriptionConfigured
} from '../../../../preload/contracts'
export type {
  ApiProtocol,
  ChatProvider,
  TranscriptionConfig,
  TranscriptionProvider
} from '../../../../preload/contracts'

export interface PromptScene {
  id: string
  name: string
  prompt: string
  isPreset: boolean
}

export const CODING_SCENE_ID = 'coding'

/** Default prompts for all preset scenes, maintained as Markdown files under ./prompts */
export const PRESET_SCENE_PROMPTS: Record<string, string> = {
  [CODING_SCENE_ID]: codingPrompt,
  'english-exam': englishExamPrompt,
  'general-qa': generalQaPrompt
}

const createPresetScenes = (): PromptScene[] => [
  {
    id: CODING_SCENE_ID,
    name: '解算法题',
    prompt: PRESET_SCENE_PROMPTS[CODING_SCENE_ID],
    isPreset: true
  },
  {
    id: 'english-exam',
    name: '英语考试',
    prompt: PRESET_SCENE_PROMPTS['english-exam'],
    isPreset: true
  },
  {
    id: 'general-qa',
    name: '通用问答',
    prompt: PRESET_SCENE_PROMPTS['general-qa'],
    isPreset: true
  }
]

/** Derive the `customPrompt` (the system prompt used by the main process) from the active scene */
function composeCustomPrompt(scenes: PromptScene[], activeSceneId: string): string {
  const scene = scenes.find((s) => s.id === activeSceneId)
  if (!scene) return PRESET_SCENE_PROMPTS[CODING_SCENE_ID]
  // An emptied preset scene falls back to its default prompt
  return scene.prompt.trim() || PRESET_SCENE_PROMPTS[scene.id] || ''
}

export const OPACITY_MIN = 0.1
export const OPACITY_MAX = 1
export const OPACITY_STEP = 0.05

export interface Settings {
  // theme: 'light' | 'dark'an
  apiProtocol: ApiProtocol
  apiBaseURL: string
  apiKey: string
  model: string
  customModels: string[]
  customPrompt: string

  chatProvider: ChatProvider
  chatApiProtocol: ApiProtocol
  chatApiBaseURL: string
  chatApiKey: string
  chatModel: string
  chatCustomModels: string[]
  chatSystemPrompt: string

  scenes: PromptScene[]
  activeSceneId: string

  opacity: number
  /** Show the click-through overlay toolbar above the main window */
  showOverlayToolbar: boolean
  /** Dwell time in ms before hovering a toolbar button fires it; 0 disables hover triggering */
  toolbarHoverDelay: number

  screenshotAutoSave: boolean
  screenshotDir: string

  transcriptionProvider: TranscriptionProvider
  dashscopeApiKey: string
  dashscopeAsrModel: string
  dashscopeAsrWsUrl: string
  volcengineAsrApiKey: string
  volcengineAsrModel: string
  volcengineAsrResourceId: string
  volcengineAsrWsUrl: string

  hideDockIcon: boolean

  audioInputDeviceId: string
  audioOutputDeviceId: string
}

interface SettingsStore extends Settings {
  updateSetting: <K extends keyof Settings>(key: K, value: Settings[K]) => void
  /** Step the window opacity within [OPACITY_MIN, OPACITY_MAX] */
  adjustOpacity: (delta: number) => void
  syncSettings: (settings: Partial<Settings>) => void
  setActiveScene: (id: string) => void
  updateScenePrompt: (id: string, prompt: string) => void
  addScene: (name: string) => string
  removeScene: (id: string) => void
}

const defaultSettings: Settings = {
  apiProtocol: 'chat-completions',
  apiBaseURL: '',
  apiKey: '',
  model: '',
  customModels: [],
  customPrompt: PRESET_SCENE_PROMPTS[CODING_SCENE_ID],
  chatProvider: 'deepseek',
  chatApiProtocol: 'chat-completions',
  chatApiBaseURL: DEEPSEEK_API_BASE_URL,
  chatApiKey: '',
  chatModel: DEEPSEEK_DEFAULT_MODEL,
  chatCustomModels: [],
  chatSystemPrompt: DEFAULT_CHAT_SYSTEM_PROMPT,
  scenes: createPresetScenes(),
  activeSceneId: CODING_SCENE_ID,

  opacity: 0.8,
  showOverlayToolbar: true,
  toolbarHoverDelay: 1000,

  screenshotAutoSave: false,
  screenshotDir: '',

  transcriptionProvider: 'dashscope',
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

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set, get) => ({
      ...defaultSettings,
      updateSetting: (key, value) => {
        set({ [key]: value })
      },
      adjustOpacity: (delta) => {
        const raw = get().opacity + delta
        // Round to 2 decimals to avoid float drift across repeated presses
        const opacity = Math.min(OPACITY_MAX, Math.max(OPACITY_MIN, Math.round(raw * 100) / 100))
        set({ opacity })
      },
      syncSettings: (settings) => {
        set(settings)
      },
      setActiveScene: (id) => {
        set((state) => ({
          activeSceneId: id,
          customPrompt: composeCustomPrompt(state.scenes, id)
        }))
      },
      updateScenePrompt: (id, prompt) => {
        set((state) => {
          const scenes = state.scenes.map((s) => (s.id === id ? { ...s, prompt } : s))
          return {
            scenes,
            customPrompt: composeCustomPrompt(scenes, state.activeSceneId)
          }
        })
      },
      addScene: (name) => {
        const id = `custom-${Date.now()}`
        set((state) => {
          const scenes = [...state.scenes, { id, name, prompt: '', isPreset: false }]
          return {
            scenes,
            activeSceneId: id,
            customPrompt: composeCustomPrompt(scenes, id)
          }
        })
        return id
      },
      removeScene: (id) => {
        const scene = get().scenes.find((s) => s.id === id)
        if (!scene || scene.isPreset) return
        set((state) => {
          const scenes = state.scenes.filter((s) => s.id !== id)
          const activeSceneId = state.activeSceneId === id ? CODING_SCENE_ID : state.activeSceneId
          return {
            scenes,
            activeSceneId,
            customPrompt: composeCustomPrompt(scenes, activeSceneId)
          }
        })
      }
    }),
    {
      name: 'interview-coder-settings',
      version: 11,
      migrate: (persisted, version) => {
        const state = persisted as Partial<Settings>
        // Drop the legacy codeLanguage field (language now lives in the prompt text)
        delete (state as Record<string, unknown>).codeLanguage
        if (version < 11) {
          state.transcriptionProvider = 'dashscope'
          state.dashscopeAsrModel = DEFAULT_DASHSCOPE_ASR_MODEL
          state.dashscopeAsrWsUrl = DEFAULT_DASHSCOPE_ASR_WS_URL
          state.volcengineAsrApiKey = ''
          state.volcengineAsrModel = DEFAULT_VOLCENGINE_ASR_MODEL
          state.volcengineAsrResourceId = DEFAULT_VOLCENGINE_ASR_RESOURCE_ID
          state.volcengineAsrWsUrl = DEFAULT_VOLCENGINE_ASR_WS_URL
        }
        if (version < 10) {
          state.chatProvider = 'deepseek'
          state.chatApiProtocol = 'chat-completions'
          state.chatApiBaseURL = DEEPSEEK_API_BASE_URL
          state.chatApiKey = ''
          state.chatModel = DEEPSEEK_DEFAULT_MODEL
          state.chatCustomModels = []
          state.chatSystemPrompt = DEFAULT_CHAT_SYSTEM_PROMPT
        }
        if (version < 9) {
          state.apiProtocol = 'chat-completions'
        }
        if (version < 8) {
          // Hover-delay options are now 0.5s / 1s / 2s; snap the retired ones
          // so the Select still matches an item
          if (state.toolbarHoverDelay === 800 || state.toolbarHoverDelay === 1200) {
            state.toolbarHoverDelay = 1000
          }
        }
        if (version < 5) {
          // Convert the legacy free-form customPrompt into a custom scene
          const scenes = createPresetScenes()
          let activeSceneId = CODING_SCENE_ID
          const legacyPrompt = (state.customPrompt ?? '').trim()
          if (legacyPrompt) {
            const id = `custom-${Date.now()}`
            scenes.push({ id, name: '自定义场景', prompt: legacyPrompt, isPreset: false })
            activeSceneId = id
          }
          return { ...state, scenes, activeSceneId }
        }
        return state
      },
      merge: (persisted, current) => {
        const state = { ...current, ...(persisted as Partial<Settings>) }
        // Ensure preset scenes always exist (keep user-edited prompts),
        // so presets added in future versions show up for existing users
        const persistedScenes = Array.isArray(state.scenes) ? state.scenes : []
        state.scenes = [
          ...createPresetScenes().map((p) => {
            const saved = persistedScenes.find((s) => s.id === p.id)
            // Restore the default prompt if a preset scene was left empty
            return saved?.prompt.trim() ? saved : p
          }),
          ...persistedScenes.filter((s) => !s.isPreset)
        ]
        if (!state.scenes.some((s) => s.id === state.activeSceneId)) {
          state.activeSceneId = CODING_SCENE_ID
        }
        state.customPrompt = composeCustomPrompt(state.scenes, state.activeSceneId)
        return state
      }
    }
  )
)
