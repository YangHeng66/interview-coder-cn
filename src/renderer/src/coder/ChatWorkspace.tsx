import { memo, useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  BookmarkPlus,
  Bot,
  Check,
  ClipboardList,
  Copy,
  FileText,
  ListX,
  Mic,
  MicOff,
  OctagonX,
  Paperclip,
  Play,
  RotateCcw,
  Send,
  Trash2,
  UserRoundSearch,
  X
} from 'lucide-react'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { KnowledgeSources } from '@/components/KnowledgeSources'
import { Button } from '@/components/ui/button'
import { IconButton } from '@/components/ui/icon-button'
import { Textarea } from '@/components/ui/textarea'
import { chooseLocalFiles } from '@/lib/local-file-picker'
import { useChatStore, type ChatMessage } from '@/lib/store/chat'
import { useKnowledgeStore } from '@/lib/store/knowledge'
import {
  createTranscriptionConfig,
  getTranscriptionConfigError,
  useSettingsStore
} from '@/lib/store/settings'
import { useTranscriptionStore } from '@/lib/store/transcription'
import { toast } from 'sonner'
import { TranscriptionBar } from './TranscriptionBar'
import { MockInterviewBar, MockInterviewDialog } from './MockInterview'
import {
  CHAT_DOCUMENT_EXTENSIONS,
  CHAT_DOCUMENT_MAX_FILES,
  CHAT_DOCUMENT_MAX_FILE_BYTES,
  CHAT_DOCUMENT_MAX_TOTAL_CHARACTERS,
  isSupportedChatDocument,
  type ChatDocument
} from '../../../preload/contracts'

const AUTO_SCROLL_THRESHOLD = 120

export function ChatWorkspace({
  isPaused,
  onPauseTranscription,
  onToggleTranscription
}: {
  isPaused: boolean
  onPauseTranscription: () => void
  onToggleTranscription: () => void
}) {
  const { messages, isLoading, errorMessage, setErrorMessage, persona } = useChatStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)
  const [mockDialogOpen, setMockDialogOpen] = useState(false)

  useEffect(() => {
    if (!shouldAutoScrollRef.current) return
    const container = scrollRef.current
    if (container) container.scrollTop = container.scrollHeight
  }, [messages])

  return (
    <div className="chat-workspace">
      <div
        ref={scrollRef}
        className="chat-message-list"
        onScroll={(event) => {
          const target = event.currentTarget
          const distanceFromBottom = target.scrollHeight - target.scrollTop - target.clientHeight
          shouldAutoScrollRef.current = distanceFromBottom <= AUTO_SCROLL_THRESHOLD
        }}
      >
        <div className="mx-auto w-full max-w-3xl px-5 py-5 sm:px-7">
          {errorMessage && (
            <div
              role="alert"
              className="mb-4 flex items-start gap-2 rounded-md border border-red-400/40 bg-red-950/25 px-3 py-2 text-sm text-red-100"
            >
              <span className="min-w-0 flex-1 break-words">{errorMessage}</span>
              <button
                type="button"
                className="shrink-0 text-red-200/70 hover:text-red-100"
                onClick={() => setErrorMessage(null)}
                aria-label="关闭提示"
              >
                <X className="size-4" />
              </button>
            </div>
          )}

          {messages.length > 0 && (
            <div className="mb-3 flex items-center justify-end gap-2">
              {persona === 'review' && (
                <span className="mr-auto inline-flex items-center gap-1.5 text-xs text-primary">
                  <ClipboardList className="size-3.5" />
                  面试复盘报告
                </span>
              )}
              {persona === 'mock-interview' && <MockInterviewBar />}
              {!persona && (
                <IconButton
                  size="sm"
                  onClick={() => setMockDialogOpen(true)}
                  aria-label="开始模拟面试"
                  data-tooltip="开始模拟面试"
                >
                  <UserRoundSearch className="size-3.5" />
                </IconButton>
              )}
              <IconButton
                size="sm"
                onClick={() => void window.api.clearChatConversation()}
                aria-label="清空文字对话"
              >
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center text-muted-foreground">
              <Bot className="mb-3 size-7" />
              <p className="text-sm">输入问题，或将实时语音转录自动交给 AI 回答</p>
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => setMockDialogOpen(true)}
              >
                <UserRoundSearch className="size-3.5" />
                开始模拟面试
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              {messages.map((message, index) => (
                <ChatMessageItem
                  key={message.id}
                  message={message}
                  previousUserMessage={findRequestUserMessage(messages, index, message.requestId)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <MockInterviewDialog open={mockDialogOpen} onOpenChange={setMockDialogOpen} />

      <ChatComposer
        isLoading={isLoading}
        isPaused={isPaused}
        onPauseTranscription={onPauseTranscription}
        onToggleTranscription={onToggleTranscription}
      />
    </div>
  )
}

function findRequestUserMessage(
  messages: ChatMessage[],
  currentIndex: number,
  requestId: string
): ChatMessage | undefined {
  for (let index = currentIndex - 1; index >= 0; index -= 1) {
    const message = messages[index]
    if (message.requestId === requestId && message.role === 'user') return message
  }
  return undefined
}

const ChatMessageItem = memo(function ChatMessageItem({
  message,
  previousUserMessage
}: {
  message: ChatMessage
  previousUserMessage?: ChatMessage
}) {
  const knowledgeContext = useKnowledgeStore((state) => state.chatContexts[message.requestId])
  const hasActiveProfile = useKnowledgeStore((state) => Boolean(state.snapshot.activeProfileId))
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)

  const saveToKnowledge = async () => {
    setSaving(true)
    try {
      const result = await window.api.saveMessageToKnowledge(message.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      if (result.data) useKnowledgeStore.getState().setSnapshot(result.data.snapshot)
      const failure = result.data?.failures[0]
      if (failure) toast.error(`存入知识库失败：${failure.error}`)
      else if (result.data?.duplicateIds.length)
        toast.success('知识库中已有相同内容，已关联到当前岗位')
      else toast.success('已存入当前岗位知识库')
    } finally {
      setSaving(false)
    }
  }

  const copyMessage = async () => {
    if (!message.content) return
    try {
      await window.api.writeClipboardText(message.content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch (error) {
      toast.error(`复制回答失败：${String(error)}`)
    }
  }

  if (message.role === 'user' && message.source === 'control') {
    return (
      <div className="flex flex-col items-center gap-1.5 text-center text-xs text-muted-foreground">
        <span>{message.content}</span>
        {message.documents?.map((document) => (
          <span
            key={document.id}
            className="inline-flex max-w-full items-center gap-1 rounded bg-accent px-2 py-1 text-foreground/85"
          >
            <FileText className="size-3 shrink-0" />
            <span className="truncate">{document.name}</span>
          </span>
        ))}
      </div>
    )
  }

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-md bg-secondary px-3 py-2 text-sm leading-6 text-secondary-foreground">
          {message.source === 'transcription' && (
            <div className="mb-1 flex items-center justify-end gap-1 text-[11px] text-primary">
              <AudioLines className="size-3" />
              语音
            </div>
          )}
          {message.documents && message.documents.length > 0 && (
            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {message.documents.map((document) => (
                <span
                  key={document.id}
                  className="inline-flex max-w-full items-center gap-1 rounded bg-accent px-2 py-1 text-xs text-foreground/85"
                >
                  <FileText className="size-3 shrink-0" />
                  <span className="truncate">{document.name}</span>
                </span>
              ))}
            </div>
          )}
          {message.content && <p className="whitespace-pre-wrap break-words">{message.content}</p>}
        </div>
      </div>
    )
  }

  const canRetry = message.status === 'error' && previousUserMessage

  return (
    <div className="flex items-start gap-3 text-foreground">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-primary-soft text-primary">
        <Bot className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        {message.content ? (
          <MarkdownRenderer>{message.content}</MarkdownRenderer>
        ) : message.status === 'streaming' ? (
          <div className="flex h-6 items-center gap-1" aria-label="正在生成">
            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground" />
            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-muted-foreground [animation-delay:300ms]" />
          </div>
        ) : null}

        <KnowledgeSources context={knowledgeContext} className="mt-1" />

        {message.content && message.status !== 'streaming' && (
          <div className="mt-1 flex gap-1">
            <IconButton
              size="sm"
              onClick={() => void copyMessage()}
              aria-label={copied ? '已复制回答' : '复制回答'}
              data-tooltip={copied ? '已复制回答' : '复制回答'}
            >
              {copied ? <Check className="text-primary" /> : <Copy />}
            </IconButton>
            <IconButton
              size="sm"
              disabled={saving || !hasActiveProfile}
              onClick={() => void saveToKnowledge()}
              aria-label="存入当前岗位知识库"
              data-tooltip={hasActiveProfile ? '存入当前岗位知识库' : '选择岗位后可存入知识库'}
            >
              <BookmarkPlus />
            </IconButton>
          </div>
        )}

        {message.status === 'stopped' && (
          <p className="mt-2 text-xs text-amber-100/70">回答已停止，未加入后续上下文</p>
        )}
        {message.status === 'error' && (
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-red-100/80">
            <span>{message.error || '生成失败，未加入后续上下文'}</span>
            {canRetry && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs text-red-50 hover:bg-white/10 hover:text-white"
                onClick={() =>
                  void window.api.sendChatMessage(
                    previousUserMessage.content,
                    previousUserMessage.documents
                  )
                }
              >
                <RotateCcw className="size-3" />
                重试
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  )
})

function ChatComposer({
  isLoading,
  isPaused,
  onPauseTranscription,
  onToggleTranscription
}: {
  isLoading: boolean
  isPaused: boolean
  onPauseTranscription: () => void
  onToggleTranscription: () => void
}) {
  const [draft, setDraft] = useState('')
  const [documents, setDocuments] = useState<ChatDocument[]>([])
  const isTranscribing = useTranscriptionStore((s) => s.isTranscribing)
  const transcriptionAutoReply = useSettingsStore((state) => state.transcriptionAutoReply)
  const autoReplyQueueCount = useChatStore((state) => state.autoReplyQueueCount)
  const transcriptionConfigError = useSettingsStore((state) =>
    getTranscriptionConfigError(createTranscriptionConfig(state))
  )
  const setErrorMessage = useChatStore((state) => state.setErrorMessage)

  const sendDraft = async () => {
    const text = draft.trim()
    if (!text && documents.length === 0) return
    const result = await window.api.sendChatMessage(text, documents)
    if (result.accepted) {
      setDraft('')
      setDocuments([])
    }
  }

  const addDocuments = async () => {
    try {
      const paths = await chooseLocalFiles({
        title: '选择对话文档',
        mode: 'files',
        extensions: CHAT_DOCUMENT_EXTENSIONS,
        multiple: true
      })
      if (!paths.length) return
      const candidates = await window.api.readChatDocuments(paths)
      if (documents.length + candidates.length > CHAT_DOCUMENT_MAX_FILES) {
        setErrorMessage(`一次最多上传 ${CHAT_DOCUMENT_MAX_FILES} 个文档`)
        return
      }

      const nextDocuments: ChatDocument[] = []
      for (const file of candidates) {
        if (!isSupportedChatDocument(file.name)) {
          setErrorMessage(`暂不支持“${file.name}”，请选择文本型文档`)
          return
        }
        if (file.size > CHAT_DOCUMENT_MAX_FILE_BYTES) {
          setErrorMessage(`文档“${file.name}”超过 1 MB 限制`)
          return
        }

        const text = file.text
        if (!text.trim()) {
          setErrorMessage(`文档“${file.name}”没有可读取的文本`)
          return
        }

        nextDocuments.push({
          id: file.id,
          name: file.name,
          mediaType: file.mediaType,
          size: file.size,
          text
        })
      }

      const uniqueDocuments = nextDocuments.filter(
        (candidate) => !documents.some((document) => document.id === candidate.id)
      )
      const totalCharacters = [...documents, ...uniqueDocuments].reduce(
        (total, document) => total + document.text.length,
        0
      )
      if (totalCharacters > CHAT_DOCUMENT_MAX_TOTAL_CHARACTERS) {
        setErrorMessage('文档文本总量超过 20 万字符限制')
        return
      }

      setDocuments((current) => [...current, ...uniqueDocuments])
      setErrorMessage(null)
    } catch (error) {
      console.error('Failed to read chat document:', error)
      setErrorMessage('读取文档失败，请检查文件是否可访问')
    }
  }

  return (
    <div className="chat-composer-band">
      <div className="mx-auto w-full max-w-3xl px-3 py-2 sm:px-5">
        {documents.length > 0 && (
          <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
            {documents.map((document) => (
              <span
                key={document.id}
                className="inline-flex h-7 max-w-52 shrink-0 items-center gap-1 rounded bg-accent pl-2 pr-1 text-xs text-foreground"
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{document.name}</span>
                <button
                  type="button"
                  className="flex size-5 shrink-0 items-center justify-center text-muted-foreground hover:text-foreground"
                  onClick={() =>
                    setDocuments((current) =>
                      current.filter((candidate) => candidate.id !== document.id)
                    )
                  }
                  aria-label={`移除文档 ${document.name}`}
                >
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        <TranscriptionBar
          isPaused={isPaused}
          onPause={onPauseTranscription}
          onResume={onToggleTranscription}
        />

        {transcriptionAutoReply && autoReplyQueueCount > 0 && (
          <div className="mb-2 flex min-h-8 items-center gap-2 border-b border-border pb-2 text-xs text-muted-foreground">
            <span className="min-w-0 flex-1">待处理语音 {autoReplyQueueCount} 句</span>
            <IconButton
              size="sm"
              onClick={() => void window.api.clearAutoReplyQueue()}
              aria-label="清空待处理语音"
            >
              <ListX className="size-3.5" />
            </IconButton>
          </div>
        )}

        <div className="flex items-end gap-2">
          <IconButton
            size="lg"
            className="shrink-0"
            active={isTranscribing}
            onClick={onToggleTranscription}
            aria-label={
              isPaused ? '继续语音识别' : isTranscribing ? '停止语音识别' : '开始语音识别'
            }
            data-tooltip={
              transcriptionConfigError ??
              (isPaused
                ? '继续语音识别'
                : transcriptionAutoReply
                  ? '已开启语音自动回答'
                  : undefined)
            }
          >
            {isPaused ? (
              <Play className="size-4" />
            ) : isTranscribing ? (
              <MicOff className="size-4" />
            ) : (
              <Mic className="size-4" />
            )}
          </IconButton>

          <Textarea
            id="chat-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                event.preventDefault()
                void sendDraft()
              }
            }}
            rows={1}
            placeholder="输入问题，Shift+Enter 换行"
            className="max-h-32 min-h-9 resize-none border-input bg-black/15 py-2 text-sm text-foreground shadow-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/25 dark:bg-black/15"
            aria-label="对话输入"
          />

          {isLoading && (
            <IconButton
              size="lg"
              className="shrink-0 text-red-200 hover:bg-red-400/15 hover:text-red-50 dark:hover:bg-red-400/15"
              onClick={() => void window.api.stopSolutionStream()}
              aria-label="停止生成"
            >
              <OctagonX className="size-4" />
            </IconButton>
          )}

          <IconButton
            size="lg"
            className="shrink-0 bg-primary text-primary-foreground hover:bg-primary/90 hover:text-primary-foreground dark:hover:bg-primary/90"
            disabled={!draft.trim() && documents.length === 0}
            onClick={() => void sendDraft()}
            aria-label="发送消息"
          >
            <Send className="size-4" />
          </IconButton>

          <IconButton
            size="lg"
            className="shrink-0"
            onClick={() => void addDocuments()}
            aria-label="上传文档"
          >
            <Paperclip className="size-4" />
          </IconButton>
        </div>
      </div>
    </div>
  )
}
