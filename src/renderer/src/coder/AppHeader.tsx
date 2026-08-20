import { Camera, HelpCircle, MessageCircle, SettingsIcon, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { useAppStore } from '@/lib/store/app'
import type { AssistantMode } from '../../../preload/contracts'

export function AppHeader() {
  const navigate = useNavigate()
  const { ignoreMouse, assistantMode, setAssistantMode } = useAppStore()

  const changeMode = (mode: AssistantMode) => {
    setAssistantMode(mode)
    void window.api.updateAppState({ assistantMode: mode })
  }

  return (
    <div id="app-header" className="relative flex items-center px-2 text-white">
      <div className="hidden text-xs font-medium text-white/70 sm:block">截屏解题助手</div>

      <div className="actions absolute left-1/2 top-1/2 flex h-7 -translate-x-1/2 -translate-y-1/2 rounded-md bg-black/20 p-0.5">
        <button
          type="button"
          aria-pressed={assistantMode === 'screenshot'}
          className={`flex min-w-24 items-center justify-center gap-1.5 rounded px-2 text-xs transition-colors ${
            assistantMode === 'screenshot'
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-white/65 hover:text-white'
          }`}
          onClick={() => changeMode('screenshot')}
        >
          <Camera className="size-3.5" />
          截图解题
        </button>
        <button
          type="button"
          aria-pressed={assistantMode === 'chat'}
          className={`flex min-w-24 items-center justify-center gap-1.5 rounded px-2 text-xs transition-colors ${
            assistantMode === 'chat'
              ? 'bg-white/20 text-white shadow-sm'
              : 'text-white/65 hover:text-white'
          }`}
          onClick={() => changeMode('chat')}
        >
          <MessageCircle className="size-3.5" />
          文字对话
        </button>
      </div>

      <div className={`actions ml-auto flex ${ignoreMouse ? 'pointer-events-none' : ''}`}>
        <Button
          variant="ghost"
          className="size-8 cursor-pointer hover:opacity-50"
          onClick={() => navigate('/settings')}
          aria-label="设置"
        >
          <SettingsIcon className="size-4" />
        </Button>
        <Button
          variant="ghost"
          className="size-8 cursor-pointer hover:opacity-50"
          onClick={() => navigate('/help')}
          aria-label="帮助"
        >
          <HelpCircle className="size-4" />
        </Button>
        <Button
          variant="ghost"
          className="size-8 cursor-pointer hover:opacity-50 hover:text-red-500"
          onClick={() => window.close()}
          aria-label="关闭"
        >
          <X className="size-4" />
        </Button>
      </div>
    </div>
  )
}
