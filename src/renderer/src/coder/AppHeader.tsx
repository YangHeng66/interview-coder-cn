import { useState } from 'react'
import { BookOpenText, Camera, HelpCircle, MessageCircle, SettingsIcon, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { useAppStore } from '@/lib/store/app'
import { useChatStore } from '@/lib/store/chat'
import { useKnowledgeStore } from '@/lib/store/knowledge'
import { useSolutionStore } from '@/lib/store/solution'
import { hasBuiltinKnowledgeApi } from '@/lib/utils'
import {
  BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID,
  type AssistantMode
} from '../../../preload/contracts'

const NO_PROFILE_VALUE = '__none__'

export function AppHeader() {
  const navigate = useNavigate()
  const { ignoreMouse, assistantMode, setAssistantMode } = useAppStore()
  const { snapshot, setSnapshot, setErrorMessage } = useKnowledgeStore()
  const hasVisionContext = useSolutionStore((state) =>
    Boolean(state.screenshotData || state.solutionChunks.length || state.isLoading)
  )
  const hasChatContext = useChatStore((state) => Boolean(state.messages.length || state.isLoading))
  const [pendingKnowledgeValue, setPendingKnowledgeValue] = useState<string | undefined>(undefined)

  const changeMode = (mode: AssistantMode) => {
    setAssistantMode(mode)
    void window.api.updateAppState({ assistantMode: mode })
  }

  const applyKnowledgeSelection = async (value: string) => {
    const targetUsesBuiltin = value !== NO_PROFILE_VALUE
    const targetProfileId =
      value === NO_PROFILE_VALUE || value === BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID ? null : value
    let latestSnapshot = useKnowledgeStore.getState().snapshot

    if (latestSnapshot.activeProfileId !== targetProfileId) {
      const profileResult = await window.api.activateKnowledgeProfile(targetProfileId)
      if (!profileResult.ok) {
        setErrorMessage(profileResult.error)
        return
      }
      latestSnapshot = profileResult.data
    }

    if (latestSnapshot.builtinFrontendKnowledgeEnabled !== targetUsesBuiltin) {
      if (!hasBuiltinKnowledgeApi()) {
        setErrorMessage('知识库接口尚未加载，请完全退出并重新启动应用后再试')
        return
      }
      const builtinResult = await window.api.setBuiltinKnowledgeEnabled(targetUsesBuiltin)
      if (!builtinResult.ok) {
        setErrorMessage(builtinResult.error)
        return
      }
      latestSnapshot = builtinResult.data
    }

    setSnapshot(latestSnapshot)
  }

  const requestProfileChange = (value: string) => {
    const targetProfileId =
      value === NO_PROFILE_VALUE || value === BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID ? null : value
    const targetUsesBuiltin = value !== NO_PROFILE_VALUE
    if (
      targetProfileId === snapshot.activeProfileId &&
      targetUsesBuiltin === snapshot.builtinFrontendKnowledgeEnabled
    ) {
      return
    }
    if (hasVisionContext || hasChatContext) {
      setPendingKnowledgeValue(value)
      return
    }
    void applyKnowledgeSelection(value)
  }

  const selectedKnowledgeValue =
    snapshot.activeProfileId ??
    (snapshot.builtinFrontendKnowledgeEnabled
      ? BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID
      : NO_PROFILE_VALUE)

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

      <div
        className={`actions ml-auto flex items-center ${ignoreMouse ? 'pointer-events-none' : ''}`}
      >
        <Select
          value={selectedKnowledgeValue}
          onValueChange={requestProfileChange}
        >
          <SelectTrigger
            size="sm"
            className="mr-1 hidden h-7 w-40 border-white/15 bg-black/10 text-xs text-white shadow-none hover:bg-white/10 md:flex [&_svg]:text-white/60"
            aria-label="当前知识库模式"
          >
            <BookOpenText className="size-3.5 text-white/70" />
            <SelectValue placeholder="未启用岗位" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID}>
              前端通用知识
            </SelectItem>
            <SelectItem value={NO_PROFILE_VALUE}>不使用知识库</SelectItem>
            {snapshot.profiles.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {profile.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          variant="ghost"
          className="size-8 cursor-pointer hover:opacity-50"
          onClick={() => navigate('/knowledge')}
          aria-label="岗位知识库"
        >
          <BookOpenText className="size-4" />
        </Button>
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

      <Dialog
        open={pendingKnowledgeValue !== undefined}
        onOpenChange={(open) => !open && setPendingKnowledgeValue(undefined)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>切换当前岗位</DialogTitle>
            <DialogDescription>
              切换知识库模式会停止当前生成，并清空截图解题和文字对话上下文，避免不同资料混用。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingKnowledgeValue(undefined)}>
              取消
            </Button>
            <Button
              onClick={() => {
                const value = pendingKnowledgeValue
                setPendingKnowledgeValue(undefined)
                if (value !== undefined) void applyKnowledgeSelection(value)
              }}
            >
              切换并清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
