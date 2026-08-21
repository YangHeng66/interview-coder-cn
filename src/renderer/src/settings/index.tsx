import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import {
  ArrowLeft,
  SquareTerminal,
  Palette,
  Shield,
  Bot,
  MessageCircle,
  Eye,
  EyeOff,
  Keyboard,
  FolderOpen,
  Mic,
  Plus,
  RotateCcw,
  X
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  useSettingsStore,
  PRESET_SCENE_PROMPTS,
  OPACITY_MIN,
  OPACITY_MAX,
  OPACITY_STEP,
  type ApiProtocol,
  type ChatProvider,
  type TranscriptionProvider
} from '@/lib/store/settings'
import {
  DEEPSEEK_API_BASE_URL,
  DEEPSEEK_DEFAULT_MODEL,
  DEEPSEEK_MODELS
} from '../../../preload/contracts'
import { isMac } from '@/lib/utils/env'
import { ApiBaseUrlInput } from './ApiBaseUrlInput'
import { SelectModel } from './SelectModel'
import { ThinkingEffortSlider } from './ThinkingEffortSlider'
import { CustomShortcuts, ResetDefaultShortcuts } from './CustomShortcuts'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'

export default function SettingsPage() {
  const {
    opacity,
    showOverlayToolbar,
    toolbarHoverDelay,
    apiProtocol,
    apiBaseURL,
    apiKey,
    model,
    modelThinkingLevels,
    apiBaseURLHistory,
    chatProvider,
    chatApiProtocol,
    chatApiBaseURL,
    chatApiKey,
    chatModel,
    chatModelThinkingLevels,
    chatApiBaseURLHistory,
    chatCustomModels,
    chatSystemPrompt,
    scenes,
    activeSceneId,
    screenshotAutoSave,
    screenshotDir,
    transcriptionProvider,
    dashscopeApiKey,
    dashscopeAsrModel,
    dashscopeAsrWsUrl,
    volcengineAsrApiKey,
    volcengineAsrModel,
    volcengineAsrResourceId,
    volcengineAsrWsUrl,
    audioInputDeviceId,
    audioOutputDeviceId,
    hideDockIcon,
    updateSetting,
    rememberApiBaseURL,
    removeApiBaseURLHistory,
    setActiveScene,
    updateScenePrompt,
    addScene,
    removeScene
  } = useSettingsStore()
  const [showApiKey, setShowApiKey] = useState(false)
  const [showChatApiKey, setShowChatApiKey] = useState(false)
  const [showDashscopeApiKey, setShowDashscopeApiKey] = useState(false)
  const [showVolcengineApiKey, setShowVolcengineApiKey] = useState(false)
  const [addSceneOpen, setAddSceneOpen] = useState(false)
  const [newSceneName, setNewSceneName] = useState('')
  const [sceneToDelete, setSceneToDelete] = useState<string | null>(null)

  const [audioDevices, setAudioDevices] = useState<MediaDeviceInfo[]>([])

  const activeScene = scenes.find((s) => s.id === activeSceneId)
  const deletingScene = scenes.find((s) => s.id === sceneToDelete)
  const screenshotModelId = model.trim()
  const chatModelId = chatModel.trim()
  const screenshotThinkingLevel = modelThinkingLevels[screenshotModelId] ?? 'auto'
  const chatThinkingLevel = chatModelThinkingLevels[chatModelId] ?? 'auto'

  useEffect(() => {
    return () => {
      document.body.style.opacity = ''
    }
  }, [])

  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const needsPermission = devices.every((d) => !d.label)
        if (needsPermission) {
          await navigator.mediaDevices.getUserMedia({ audio: true, video: false })
        }
        const refreshed = await navigator.mediaDevices.enumerateDevices()
        setAudioDevices(refreshed)
      } catch (err) {
        console.error('Failed to enumerate audio devices:', err)
      }
    }
    loadDevices()
  }, [])

  const handleAddScene = () => {
    const name = newSceneName.trim()
    if (!name) return
    addScene(name)
    setNewSceneName('')
    setAddSceneOpen(false)
  }

  const handleResetScenePrompt = () => {
    if (!activeScene?.isPreset) return
    updateScenePrompt(activeScene.id, PRESET_SCENE_PROMPTS[activeScene.id] ?? '')
  }

  return (
    <>
      {/* Header */}
      <div id="app-header" className="flex items-center">
        <div className="actions">
          <Button variant="ghost" asChild size="icon" className="w-12 mr-2 rounded-none">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        <h1>设置</h1>
      </div>

      {/* Settings Content */}
      <div id="app-content" className="flex flex-col gap-4 p-8">
        {/* Screenshot model settings */}
        <div className="bg-gray-300/80 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Bot className="h-5 w-5 mr-2" />
            截图模型
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="api-protocol" className="text-sm font-medium">
                API 协议
              </label>
              <Select
                value={apiProtocol}
                onValueChange={(value) => updateSetting('apiProtocol', value as ApiProtocol)}
              >
                <SelectTrigger id="api-protocol" className="w-60 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chat-completions">Chat Completions</SelectItem>
                  <SelectItem value="responses">Responses（Codex）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="api-base-url" className="text-sm font-medium">
                API Base URL
                <span className="ml-2 text-xs font-light">
                  {apiProtocol === 'responses'
                    ? '填写 Codex 中配置的域名根地址'
                    : '如硅基流动为 https://api.siliconflow.cn/v1'}
                </span>
              </label>
              <ApiBaseUrlInput
                id="api-base-url"
                value={apiBaseURL}
                history={apiBaseURLHistory}
                onChange={(value) => updateSetting('apiBaseURL', value)}
                onCommit={(value) => rememberApiBaseURL('screenshot', value)}
                onRemoveHistory={(value) => removeApiBaseURLHistory('screenshot', value)}
                placeholder={
                  apiProtocol === 'responses'
                    ? 'https://api.example.com'
                    : 'https://api.example.com/v1'
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="api-key" className="text-sm font-medium">
                API Key
              </label>
              <div className="flex items-center w-60">
                <input
                  id="api-key"
                  type={showApiKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => updateSetting('apiKey', e.target.value)}
                  onBlur={(e) => updateSetting('apiKey', e.target.value.trim())}
                  className="flex-1 px-3 py-2 border border-gray-300 rounded-l-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="输入 API Key"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="border border-l-0 rounded-l-none rounded-r-md h-9 w-9 hover:border-none"
                  aria-label={showApiKey ? '隐藏 API Key' : '显示 API Key'}
                >
                  {showApiKey ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                Model
                <span className="ml-2 text-xs font-light">
                  这里列了几个流行的国内和国外模型，请自行确认你的平台是否支持
                </span>
              </label>
              <SelectModel value={model} onChange={(val) => updateSetting('model', val)} />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">思考等级</label>
              <ThinkingEffortSlider
                model={screenshotModelId}
                value={screenshotThinkingLevel}
                disabled={!screenshotModelId}
                onChange={(value) =>
                  updateSetting('modelThinkingLevels', {
                    ...modelThinkingLevels,
                    [screenshotModelId]: value
                  })
                }
              />
            </div>
          </div>
        </div>
        {/* Text chat model settings */}
        <div className="bg-gray-300/80 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <MessageCircle className="h-5 w-5 mr-2" />
            文字对话模型
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="chat-provider" className="text-sm font-medium">
                服务商
              </label>
              <Select
                value={chatProvider}
                onValueChange={(value) => {
                  const provider = value as ChatProvider
                  updateSetting('chatProvider', provider)
                  if (provider === 'deepseek') {
                    updateSetting('chatApiProtocol', 'chat-completions')
                    if (!chatModel.trim()) {
                      updateSetting('chatModel', DEEPSEEK_DEFAULT_MODEL)
                    }
                  }
                }}
              >
                <SelectTrigger id="chat-provider" className="w-60 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="deepseek">DeepSeek</SelectItem>
                  <SelectItem value="custom">自定义 OpenAI 兼容服务</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="chat-api-protocol" className="text-sm font-medium">
                API 协议
              </label>
              <Select
                value={chatProvider === 'deepseek' ? 'chat-completions' : chatApiProtocol}
                disabled={chatProvider === 'deepseek'}
                onValueChange={(value) => updateSetting('chatApiProtocol', value as ApiProtocol)}
              >
                <SelectTrigger id="chat-api-protocol" className="w-60 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chat-completions">Chat Completions</SelectItem>
                  <SelectItem value="responses">Responses（Codex）</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="chat-api-base-url" className="text-sm font-medium">
                API Base URL
              </label>
              <ApiBaseUrlInput
                id="chat-api-base-url"
                disabled={chatProvider === 'deepseek'}
                value={chatProvider === 'deepseek' ? DEEPSEEK_API_BASE_URL : chatApiBaseURL}
                history={chatApiBaseURLHistory}
                onChange={(value) => updateSetting('chatApiBaseURL', value)}
                onCommit={(value) => rememberApiBaseURL('chat', value)}
                onRemoveHistory={(value) => removeApiBaseURLHistory('chat', value)}
                placeholder={
                  chatApiProtocol === 'responses'
                    ? 'https://api.example.com'
                    : 'https://api.example.com/v1'
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <label htmlFor="chat-api-key" className="text-sm font-medium">
                API Key
              </label>
              <div className="flex items-center w-60">
                <input
                  id="chat-api-key"
                  type={showChatApiKey ? 'text' : 'password'}
                  value={chatApiKey}
                  onChange={(e) => updateSetting('chatApiKey', e.target.value)}
                  onBlur={(e) => updateSetting('chatApiKey', e.target.value.trim())}
                  className="flex-1 min-w-0 px-3 py-2 border border-gray-300 rounded-l-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="输入对话模型 API Key"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowChatApiKey(!showChatApiKey)}
                  className="border border-l-0 rounded-l-none rounded-r-md h-9 w-9 hover:border-none"
                  aria-label={showChatApiKey ? '隐藏对话 API Key' : '显示对话 API Key'}
                >
                  {showChatApiKey ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                </Button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Model</label>
              <SelectModel
                value={chatModel}
                onChange={(value) => updateSetting('chatModel', value)}
                presetModels={DEEPSEEK_MODELS.map((value) => ({ value, label: value }))}
                customModelValues={chatCustomModels}
                onCustomModelsChange={(models) => updateSetting('chatCustomModels', models)}
              />
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">思考等级</label>
              <ThinkingEffortSlider
                model={chatModelId}
                value={chatThinkingLevel}
                disabled={!chatModelId}
                onChange={(value) =>
                  updateSetting('chatModelThinkingLevels', {
                    ...chatModelThinkingLevels,
                    [chatModelId]: value
                  })
                }
              />
            </div>

            <div>
              <label htmlFor="chat-system-prompt" className="text-sm font-medium">
                系统提示词
              </label>
              <Textarea
                id="chat-system-prompt"
                value={chatSystemPrompt}
                onChange={(e) => updateSetting('chatSystemPrompt', e.target.value)}
                className="mt-2 w-full min-h-24 max-h-64 bg-white"
                rows={4}
              />
            </div>
          </div>
        </div>
        {/* Transcription Settings */}
        <div className="bg-gray-300/80 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Mic className="h-5 w-5 mr-2" />
            语音转录
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label htmlFor="transcription-provider" className="text-sm font-medium">
                语音服务商
              </label>
              <Select
                value={transcriptionProvider}
                onValueChange={(value) =>
                  updateSetting('transcriptionProvider', value as TranscriptionProvider)
                }
              >
                <SelectTrigger id="transcription-provider" className="w-60 bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dashscope">阿里云百炼</SelectItem>
                  <SelectItem value="volcengine">火山引擎豆包</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {transcriptionProvider === 'dashscope' ? (
              <>
                <div className="flex items-center justify-between">
                  <label htmlFor="dashscope-api-key" className="text-sm font-medium">
                    百炼平台 API Key
                    <a
                      href="https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs font-light text-blue-700 hover:underline"
                    >
                      获取 Key
                    </a>
                  </label>
                  <div className="flex w-60 items-center">
                    <input
                      id="dashscope-api-key"
                      type={showDashscopeApiKey ? 'text' : 'password'}
                      value={dashscopeApiKey}
                      onChange={(e) => updateSetting('dashscopeApiKey', e.target.value)}
                      onBlur={(e) => updateSetting('dashscopeApiKey', e.target.value.trim())}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-l-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="输入百炼平台 API Key"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowDashscopeApiKey(!showDashscopeApiKey)}
                      className="border border-l-0 rounded-l-none rounded-r-md h-9 w-9 hover:border-none"
                      aria-label={showDashscopeApiKey ? '隐藏百炼 API Key' : '显示百炼 API Key'}
                    >
                      {showDashscopeApiKey ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label htmlFor="dashscope-asr-model" className="text-sm font-medium">
                    模型名称
                  </label>
                  <input
                    id="dashscope-asr-model"
                    type="text"
                    value={dashscopeAsrModel}
                    onChange={(e) => updateSetting('dashscopeAsrModel', e.target.value)}
                    onBlur={(e) => updateSetting('dashscopeAsrModel', e.target.value.trim())}
                    className="w-60 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="fun-asr-realtime"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label htmlFor="dashscope-asr-ws-url" className="text-sm font-medium">
                    WebSocket 地址
                  </label>
                  <input
                    id="dashscope-asr-ws-url"
                    type="text"
                    value={dashscopeAsrWsUrl}
                    onChange={(e) => updateSetting('dashscopeAsrWsUrl', e.target.value)}
                    onBlur={(e) => updateSetting('dashscopeAsrWsUrl', e.target.value.trim())}
                    className="w-60 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="wss://dashscope.aliyuncs.com/..."
                  />
                </div>
              </>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <label htmlFor="volcengine-asr-api-key" className="text-sm font-medium">
                    豆包语音 API Key
                    <a
                      href="https://console.volcengine.com/speech/new/setting/apikeys?projectName=default"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 text-xs font-light text-blue-700 hover:underline"
                    >
                      获取 Key
                    </a>
                  </label>
                  <div className="flex w-60 items-center">
                    <input
                      id="volcengine-asr-api-key"
                      type={showVolcengineApiKey ? 'text' : 'password'}
                      value={volcengineAsrApiKey}
                      onChange={(e) => updateSetting('volcengineAsrApiKey', e.target.value)}
                      onBlur={(e) => updateSetting('volcengineAsrApiKey', e.target.value.trim())}
                      className="min-w-0 flex-1 px-3 py-2 border border-gray-300 rounded-l-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="输入豆包语音 API Key"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => setShowVolcengineApiKey(!showVolcengineApiKey)}
                      className="border border-l-0 rounded-l-none rounded-r-md h-9 w-9 hover:border-none"
                      aria-label={showVolcengineApiKey ? '隐藏豆包 API Key' : '显示豆包 API Key'}
                    >
                      {showVolcengineApiKey ? (
                        <Eye className="h-4 w-4" />
                      ) : (
                        <EyeOff className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <label htmlFor="volcengine-asr-model" className="text-sm font-medium">
                    模型名称
                  </label>
                  <input
                    id="volcengine-asr-model"
                    type="text"
                    value={volcengineAsrModel}
                    onChange={(e) => updateSetting('volcengineAsrModel', e.target.value)}
                    onBlur={(e) => updateSetting('volcengineAsrModel', e.target.value.trim())}
                    className="w-60 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="bigmodel"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label htmlFor="volcengine-asr-resource-id" className="text-sm font-medium">
                    资源 ID
                    <span className="ml-2 text-xs font-light">默认 ASR 2.0 小时版</span>
                  </label>
                  <input
                    id="volcengine-asr-resource-id"
                    type="text"
                    value={volcengineAsrResourceId}
                    onChange={(e) => updateSetting('volcengineAsrResourceId', e.target.value)}
                    onBlur={(e) => updateSetting('volcengineAsrResourceId', e.target.value.trim())}
                    className="w-60 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="volc.seedasr.sauc.duration"
                  />
                </div>

                <div className="flex items-center justify-between">
                  <label htmlFor="volcengine-asr-ws-url" className="text-sm font-medium">
                    WebSocket 地址
                  </label>
                  <input
                    id="volcengine-asr-ws-url"
                    type="text"
                    value={volcengineAsrWsUrl}
                    onChange={(e) => updateSetting('volcengineAsrWsUrl', e.target.value)}
                    onBlur={(e) => updateSetting('volcengineAsrWsUrl', e.target.value.trim())}
                    className="w-60 px-3 py-2 border border-gray-300 rounded-md bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="wss://openspeech.bytedance.com/..."
                  />
                </div>
              </>
            )}

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                音频输入设备
                <span className="ml-2 text-xs font-light">选择麦克风，留空则捕获系统音频</span>
              </label>
              <Select
                value={audioInputDeviceId || 'system'}
                onValueChange={(val) =>
                  updateSetting('audioInputDeviceId', val === 'system' ? '' : val)
                }
              >
                <SelectTrigger className="w-60 bg-white">
                  <SelectValue placeholder="系统音频（默认）" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">系统音频（默认）</SelectItem>
                  {audioDevices
                    .filter((d) => d.kind === 'audioinput')
                    .map((d) => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>
                        {d.label || d.deviceId}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                音频输出设备
                <span className="ml-2 text-xs font-light">用于转录时的监听输出</span>
              </label>
              <Select
                value={audioOutputDeviceId || 'default'}
                onValueChange={(val) =>
                  updateSetting('audioOutputDeviceId', val === 'default' ? '' : val)
                }
              >
                <SelectTrigger className="w-60 bg-white">
                  <SelectValue placeholder="默认设备" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default">默认设备</SelectItem>
                  {audioDevices
                    .filter((d) => d.kind === 'audiooutput')
                    .map((d) => (
                      <SelectItem key={d.deviceId} value={d.deviceId}>
                        {d.label || d.deviceId}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <div className="bg-gray-300/80 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <SquareTerminal className="h-5 w-5 mr-2" />
            解题设置
          </h2>

          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium">
                使用场景
                <span className="ml-2 text-xs font-light">
                  选择场景后可编辑对应的系统提示词，修改会自动保存；也可新增自己的场景
                </span>
              </label>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                {scenes.map((scene) => (
                  <div
                    key={scene.id}
                    className={cn(
                      'group flex items-center rounded-full border text-sm transition-colors cursor-pointer select-none',
                      scene.id === activeSceneId
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 hover:border-blue-400'
                    )}
                    onClick={() => setActiveScene(scene.id)}
                  >
                    <span className={cn('py-1 pl-3', scene.isPreset ? 'pr-3' : 'pr-1')}>
                      {scene.name}
                    </span>
                    {!scene.isPreset && (
                      <button
                        className="mr-1.5 p-0.5 rounded-full opacity-60 hover:opacity-100 hover:bg-black/10"
                        title="删除该场景"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSceneToDelete(scene.id)
                        }}
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                <button
                  className="flex items-center gap-1 rounded-full border border-dashed border-gray-400 bg-transparent px-3 py-1 text-sm text-gray-600 hover:border-blue-500 hover:text-blue-600 transition-colors"
                  onClick={() => setAddSceneOpen(true)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  新增场景
                </button>
              </div>
            </div>

            {activeScene && (
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium">
                    系统提示词
                    <span className="ml-2 text-xs font-light">「{activeScene.name}」场景</span>
                  </label>
                  {activeScene.isPreset && (
                    <button
                      className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 transition-colors"
                      title="恢复该场景的默认提示词"
                      onClick={handleResetScenePrompt}
                    >
                      <RotateCcw className="h-3 w-3" />
                      恢复默认
                    </button>
                  )}
                </div>
                <Textarea
                  value={activeScene.prompt}
                  onChange={(e) => updateScenePrompt(activeScene.id, e.target.value)}
                  placeholder="请输入该场景的系统提示词, 示例: 你是一个解题助手, 请根据「截图」和「语音转录内容」给出相关回答。"
                  className="w-full min-h-24 max-h-100 bg-white"
                  rows={6}
                />
              </div>
            )}
          </div>
        </div>

        {/* Add scene dialog */}
        <Dialog open={addSceneOpen} onOpenChange={setAddSceneOpen}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>新增场景</DialogTitle>
              <DialogDescription>创建后可为该场景编写专属的系统提示词</DialogDescription>
            </DialogHeader>
            <Input
              value={newSceneName}
              onChange={(e) => setNewSceneName(e.target.value)}
              placeholder="场景名称，如：数学考试"
              maxLength={20}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleAddScene()
              }}
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddSceneOpen(false)}>
                取消
              </Button>
              <Button onClick={handleAddScene} disabled={!newSceneName.trim()}>
                创建
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete scene confirm dialog */}
        <Dialog open={!!sceneToDelete} onOpenChange={(open) => !open && setSceneToDelete(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>删除场景</DialogTitle>
              <DialogDescription>
                确定删除场景「{deletingScene?.name}」吗？其提示词内容将一并删除，且无法恢复。
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSceneToDelete(null)}>
                取消
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (sceneToDelete) removeScene(sceneToDelete)
                  setSceneToDelete(null)
                }}
              >
                删除
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Appearance Settings */}
        <div className="bg-gray-300/80 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Palette className="h-5 w-5 mr-2" />
            外观设置
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                窗口透明度
                <span className="ml-2 text-xs font-light">
                  拖动可实时预览效果，也可在主界面用快捷键调节
                </span>
              </label>
              <div className="w-60 flex items-center gap-2">
                <span className="text-xs whitespace-nowrap">透明</span>
                <Slider
                  min={OPACITY_MIN}
                  max={OPACITY_MAX}
                  step={OPACITY_STEP}
                  value={[opacity]}
                  onValueChange={(value) => {
                    updateSetting('opacity', value[0])
                    document.body.style.opacity = value[0].toString()
                  }}
                />
                <span className="text-xs whitespace-nowrap">不透明</span>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                悬浮工具条
                <span className="ml-2 text-xs font-light">
                  在主窗口上方显示一排按钮，可用鼠标点击替代快捷键操作，详见帮助中心
                </span>
              </label>
              <Switch
                className="scale-y-90"
                checked={showOverlayToolbar}
                onCheckedChange={(checked) => updateSetting('showOverlayToolbar', checked)}
              />
            </div>

            {showOverlayToolbar && (
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  悬停触发
                  <span className="ml-2 text-xs font-light">
                    鼠标在按钮上停留指定时间即触发，无需点击；停留过程中按钮下方有进度条
                  </span>
                </label>
                <Select
                  value={String(toolbarHoverDelay)}
                  onValueChange={(val) => updateSetting('toolbarHoverDelay', Number(val))}
                >
                  <SelectTrigger className="w-60 bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">关闭（仅点击触发）</SelectItem>
                    <SelectItem value="500">停留 0.5 秒</SelectItem>
                    <SelectItem value="1000">停留 1 秒</SelectItem>
                    <SelectItem value="2000">停留 2 秒</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>

        {/* Shortcuts Settings */}
        <div className="bg-gray-300/80 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Keyboard className="h-5 w-5 mr-2" />
            快捷键设置
            <div className="text-sm font-light ml-2 mt-1">
              只有在主界面时，快捷键才有效。当前页面仅部分快捷键生效。
            </div>
            <ResetDefaultShortcuts />
          </h2>
          <CustomShortcuts />
        </div>

        {/* Screenshot Save Settings */}
        <div className="bg-gray-300/80 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <FolderOpen className="h-5 w-5 mr-2" />
            保存截图
          </h2>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">
                保存截图到本地
                <span className="ml-2 text-xs font-light">
                  开启后，每次截图都会自动保存到指定目录
                </span>
              </label>
              <Switch
                className="scale-y-90"
                checked={screenshotAutoSave}
                onCheckedChange={(checked) => updateSetting('screenshotAutoSave', checked)}
              />
            </div>
            {screenshotAutoSave && (
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  保存目录
                  <span className="ml-2 text-xs font-light">
                    可点击右侧内容重新选择保存目录（选择弹窗可能被本窗口遮挡）
                  </span>
                </label>
                <button
                  className="text-xs text-gray-600 max-w-48 truncate hover:text-gray-900 cursor-pointer transition-colors"
                  title="点击选择保存目录"
                  onClick={async () => {
                    const dir = await window.api.selectScreenshotDir()
                    if (dir) updateSetting('screenshotDir', dir)
                  }}
                >
                  {screenshotDir || '默认: 图片/InterviewCoder'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Privacy Settings */}
        <div className="bg-gray-300/80 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 flex items-center">
            <Shield className="h-5 w-5 mr-2" />
            隐私设置
          </h2>

          <div className="space-y-4">
            <p className="text-sm">
              此应用为本地应用，采集的图片直接上传到您配置的 OpenAI
              等大模型公司，不存在隐私泄露风险。
            </p>
            {isMac && (
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">
                  隐藏 Dock 图标
                  <span className="ml-2 text-xs font-light">
                    开启后不在程序坞和 Cmd+Tab 切换器中显示，仅可通过快捷键唤起窗口
                  </span>
                </label>
                <Switch
                  className="scale-y-90"
                  checked={hideDockIcon}
                  onCheckedChange={(checked) => updateSetting('hideDockIcon', checked)}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
