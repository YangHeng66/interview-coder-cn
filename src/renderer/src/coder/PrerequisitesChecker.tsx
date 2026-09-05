import { useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { Camera, Eye, EyeOff, MessageCircle } from 'lucide-react'
import { type ApiProtocol, type ChatProvider, useSettingsStore } from '@/lib/store/settings'
import { useAppStore } from '@/lib/store/app'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { SelectModel } from '@/settings/SelectModel'
import {
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_MODELS
} from '../../../preload/contracts'

type SetupMode = 'screenshot' | 'chat'

export function PrerequisitesChecker() {
  const navigate = useNavigate()
  const settings = useSettingsStore()
  const { setAssistantMode } = useAppStore()
  const [setupMode, setSetupMode] = useState<SetupMode>('screenshot')
  const [inputApiProtocol, setInputApiProtocol] = useState<ApiProtocol>(settings.apiProtocol)
  const [inputApiKey, setInputApiKey] = useState(settings.apiKey)
  const [inputApiBaseURL, setInputApiBaseURL] = useState(settings.apiBaseURL)
  const [inputChatProvider, setInputChatProvider] = useState<ChatProvider>(settings.chatProvider)
  const [inputChatApiProtocol, setInputChatApiProtocol] = useState<ApiProtocol>(
    settings.chatApiProtocol
  )
  const [inputChatApiBaseURL, setInputChatApiBaseURL] = useState(settings.chatApiBaseURL)
  const [inputChatApiKey, setInputChatApiKey] = useState(settings.chatApiKey)
  const [inputChatModel, setInputChatModel] = useState(settings.chatModel || DEEPSEEK_DEFAULT_MODEL)
  const [showApiKey, setShowApiKey] = useState(false)

  const hasScreenshotConfiguration = Boolean(settings.apiKey.trim())
  const hasChatConfiguration = Boolean(settings.chatApiKey.trim() && settings.chatModel.trim())

  const saveConfiguration = () => {
    if (setupMode === 'screenshot') {
      settings.updateSetting('apiProtocol', inputApiProtocol)
      settings.updateSetting('apiKey', inputApiKey.trim())
      settings.updateSetting('apiBaseURL', inputApiBaseURL.trim())
      setAssistantMode('screenshot')
      void window.api.updateAppState({ assistantMode: 'screenshot' })
      return
    }

    settings.updateSetting('chatProvider', inputChatProvider)
    settings.updateSetting(
      'chatApiProtocol',
      inputChatProvider === 'deepseek' ? 'chat-completions' : inputChatApiProtocol
    )
    settings.updateSetting(
      'chatApiBaseURL',
      inputChatProvider === 'deepseek' ? DEEPSEEK_API_BASE_URL : inputChatApiBaseURL.trim()
    )
    settings.updateSetting('chatApiKey', inputChatApiKey.trim())
    settings.updateSetting('chatModel', inputChatModel.trim() || DEEPSEEK_DEFAULT_MODEL)
    setAssistantMode('chat')
    void window.api.updateAppState({ assistantMode: 'chat' })
  }

  if (hasScreenshotConfiguration || hasChatConfiguration) {
    return null
  }

  const canStart =
    setupMode === 'screenshot'
      ? Boolean(inputApiKey.trim())
      : Boolean(inputChatApiKey.trim() && inputChatModel.trim())

  return (
    <div className="fixed top-9 left-0 right-0 bottom-0 z-50 flex bg-black/50 p-4">
      <div className="m-auto max-h-full w-full max-w-md overflow-y-auto rounded-lg bg-white p-5 text-neutral-900 shadow-lg">
        <h1 className="mb-4 text-center text-xl font-bold">配置 AI 模型</h1>

        <div className="mb-4 grid grid-cols-2 rounded-md bg-gray-100 p-1">
          <button
            type="button"
            className={`flex h-8 items-center justify-center gap-2 rounded-sm text-sm ${
              setupMode === 'screenshot' ? 'bg-white shadow-sm' : 'text-gray-500'
            }`}
            onClick={() => setSetupMode('screenshot')}
          >
            <Camera className="size-4" />
            截图模型
          </button>
          <button
            type="button"
            className={`flex h-8 items-center justify-center gap-2 rounded-sm text-sm ${
              setupMode === 'chat' ? 'bg-white shadow-sm' : 'text-gray-500'
            }`}
            onClick={() => setSetupMode('chat')}
          >
            <MessageCircle className="size-4" />
            文字对话
          </button>
        </div>

        <div className="space-y-3">
          {setupMode === 'screenshot' ? (
            <>
              <Field label="API 协议">
                <Select
                  value={inputApiProtocol}
                  onValueChange={(value) => setInputApiProtocol(value as ApiProtocol)}
                >
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="chat-completions">Chat Completions</SelectItem>
                    <SelectItem value="messages">Messages</SelectItem>
                    <SelectItem value="responses">Responses（Codex）</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              <Field label="API Base URL">
                <input
                  type="text"
                  value={inputApiBaseURL}
                  onChange={(event) => setInputApiBaseURL(event.target.value)}
                  className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder={
                    inputApiProtocol === 'responses'
                      ? 'https://api.example.com'
                      : 'https://api.example.com/v1'
                  }
                />
              </Field>
            </>
          ) : (
            <>
              <Field label="服务商">
                <Select
                  value={inputChatProvider}
                  onValueChange={(value) => {
                    const provider = value as ChatProvider
                    setInputChatProvider(provider)
                    if (provider === 'deepseek') {
                      setInputChatApiProtocol('chat-completions')
                      setInputChatApiBaseURL(DEEPSEEK_API_BASE_URL)
                      if (!inputChatModel.trim()) setInputChatModel(DEEPSEEK_DEFAULT_MODEL)
                    }
                  }}
                >
                  <SelectTrigger className="w-full bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="deepseek">DeepSeek</SelectItem>
                    <SelectItem value="custom">自定义 OpenAI 兼容服务</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
              {inputChatProvider === 'custom' && (
                <>
                  <Field label="API 协议">
                    <Select
                      value={inputChatApiProtocol}
                      onValueChange={(value) => setInputChatApiProtocol(value as ApiProtocol)}
                    >
                      <SelectTrigger className="w-full bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="chat-completions">Chat Completions</SelectItem>
                        <SelectItem value="messages">Messages</SelectItem>
                        <SelectItem value="responses">Responses（Codex）</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="API Base URL">
                    <input
                      type="text"
                      value={inputChatApiBaseURL}
                      onChange={(event) => setInputChatApiBaseURL(event.target.value)}
                      className="h-9 w-full rounded-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="https://api.example.com/v1"
                    />
                  </Field>
                </>
              )}
              <Field label="Model">
                <SelectModel
                  value={inputChatModel}
                  onChange={setInputChatModel}
                  className="w-full"
                  presetModels={DEEPSEEK_MODELS.map((value) => ({ value, label: value }))}
                  customModelValues={settings.chatCustomModels}
                  onCustomModelsChange={(models) =>
                    settings.updateSetting('chatCustomModels', models)
                  }
                />
              </Field>
            </>
          )}

          <Field label="API Key">
            <div className="flex">
              <input
                type={showApiKey ? 'text' : 'password'}
                value={setupMode === 'screenshot' ? inputApiKey : inputChatApiKey}
                onChange={(event) => {
                  if (setupMode === 'screenshot') setInputApiKey(event.target.value)
                  else setInputChatApiKey(event.target.value)
                }}
                className="h-9 min-w-0 flex-1 rounded-l-md border border-gray-300 bg-white px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="请输入 API Key"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowApiKey(!showApiKey)}
                className="size-9 rounded-l-none rounded-r-md border border-l-0 hover:border"
                aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
              >
                {showApiKey ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
              </Button>
            </div>
          </Field>
        </div>

        <div className="mt-5 flex gap-3">
          <Button disabled={!canStart} className="flex-1" onClick={saveConfiguration}>
            开始使用
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              saveConfiguration()
              navigate('/settings')
            }}
            className="flex-1"
          >
            更多设置
          </Button>
        </div>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-sm font-medium text-gray-700">
      <span className="mb-1 block">{label}</span>
      {children}
    </label>
  )
}
