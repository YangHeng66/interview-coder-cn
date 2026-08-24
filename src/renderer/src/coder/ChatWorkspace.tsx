import { useEffect, useRef, useState } from 'react'
import {
  AudioLines,
  Bot,
  FileText,
  Mic,
  MicOff,
  OctagonX,
  Paperclip,
  Pause,
  Play,
  RotateCcw,
  Send,
  Trash2,
  X
} from 'lucide-react'
import MarkdownRenderer from '@/components/MarkdownRenderer'
import { KnowledgeSources } from '@/components/KnowledgeSources'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useChatStore, type ChatMessage } from '@/lib/store/chat'
import { useKnowledgeStore } from '@/lib/store/knowledge'
import {
  createTranscriptionConfig,
  getTranscriptionConfigError,
  useSettingsStore
} from '@/lib/store/settings'
import { useTranscriptionStore } from '@/lib/store/transcription'
import {
  CHAT_DOCUMENT_ACCEPT,
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
  const { messages, isLoading, errorMessage, setErrorMessage } = useChatStore()
  const scrollRef = useRef<HTMLDivElement>(null)
  const shouldAutoScrollRef = useRef(true)

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
            <div className="mb-3 flex justify-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-gray-200/70 hover:bg-white/10 hover:text-white"
                onClick={() => void window.api.clearChatConversation()}
                aria-label="清空文字对话"
              >
                <Trash2 className="size-3.5" />
              </Button>
            </div>
          )}

          {messages.length === 0 ? (
            <div className="flex min-h-56 flex-col items-center justify-center text-center text-gray-200/70">
              <Bot className="mb-3 size-7" />
              <p className="text-sm">输入问题，或将实时语音转录自动交给 AI 回答</p>
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

function ChatMessageItem({
  message,
  previousUserMessage
}: {
  message: ChatMessage
  previousUserMessage?: ChatMessage
}) {
  const knowledgeContext = useKnowledgeStore((state) => state.chatContexts[message.requestId])

  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[82%] rounded-md bg-gray-800/55 px-3 py-2 text-sm leading-6 text-white shadow-sm">
          {message.source === 'transcription' && (
            <div className="mb-1 flex items-center justify-end gap-1 text-[11px] text-green-200/75">
              <AudioLines className="size-3" />
              语音
            </div>
          )}
          {message.documents && message.documents.length > 0 && (
            <div className="mb-1.5 flex flex-wrap justify-end gap-1.5">
              {message.documents.map((document) => (
                <span
                  key={document.id}
                  className="inline-flex max-w-full items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs text-gray-100/85"
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
    <div className="flex items-start gap-3 text-gray-50">
      <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded bg-gray-700/70">
        <Bot className="size-3.5" />
      </div>
      <div className="min-w-0 flex-1">
        {message.content ? (
          <MarkdownRenderer>{message.content}</MarkdownRenderer>
        ) : message.status === 'streaming' ? (
          <div className="flex h-6 items-center gap-1" aria-label="正在生成">
            <span className="size-1.5 animate-pulse rounded-full bg-gray-200/70" />
            <span className="size-1.5 animate-pulse rounded-full bg-gray-200/70 [animation-delay:150ms]" />
            <span className="size-1.5 animate-pulse rounded-full bg-gray-200/70 [animation-delay:300ms]" />
          </div>
        ) : null}

        <KnowledgeSources context={knowledgeContext} className="mt-1" />

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
}

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
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { isTranscribing, transcriptionText } = useTranscriptionStore()
  const transcriptionAutoReply = useSettingsStore((state) => state.transcriptionAutoReply)
  const transcriptionConfigError = useSettingsStore((state) =>
    getTranscriptionConfigError(createTranscriptionConfig(state))
  )
  const setErrorMessage = useChatStore((state) => state.setErrorMessage)

  const sendDraft = async () => {
    const text = draft.trim()
    if ((!text && documents.length === 0) || isLoading) return
    const result = await window.api.sendChatMessage(text, documents)
    if (result.accepted) {
      setDraft('')
      setDocuments([])
    }
  }

  const addDocuments = async (files: FileList | null) => {
    if (!files?.length) return
    try {
      const candidates = Array.from(files)
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

        const text = (await file.text()).replace(/^\uFEFF/, '')
        if (!text.trim()) {
          setErrorMessage(`文档“${file.name}”没有可读取的文本`)
          return
        }

        nextDocuments.push({
          id: `${file.name}-${file.size}-${file.lastModified}`,
          name: file.name,
          mediaType: file.type || 'text/plain',
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
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = ''
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
                className="inline-flex h-7 max-w-52 shrink-0 items-center gap-1 rounded bg-white/10 pl-2 pr-1 text-xs text-gray-100"
              >
                <FileText className="size-3 shrink-0" />
                <span className="truncate">{document.name}</span>
                <button
                  type="button"
                  className="flex size-5 shrink-0 items-center justify-center text-gray-300 hover:text-white"
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

        {(isTranscribing || isPaused || transcriptionText) && (
          <div className="mb-2 flex min-h-8 items-start gap-2 border-b border-white/10 pb-2">
            <Mic
              className={`mt-1 size-4 shrink-0 ${
                isTranscribing ? 'text-green-300' : isPaused ? 'text-amber-300' : 'text-gray-300'
              }`}
            />
            <div className="max-h-[4.2em] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap break-words text-sm leading-[1.4em] text-gray-100/85">
              {transcriptionText || (isPaused ? '语音识别已暂停' : '等待语音输入...')}
            </div>
            {isTranscribing && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-7 text-amber-100 hover:bg-amber-400/15 hover:text-amber-50"
                onClick={onPauseTranscription}
                aria-label="暂停语音识别"
                title="暂停语音识别"
              >
                <Pause className="size-3.5" />
              </Button>
            )}
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-gray-100 hover:bg-white/10 hover:text-white"
              onClick={() => void window.api.sendTranscriptionToChat()}
              disabled={!transcriptionText.trim()}
              aria-label="发送语音转录"
            >
              <Send className="size-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7 text-gray-300 hover:bg-white/10 hover:text-white"
              onClick={() => void window.api.triggerAction('clearTranscription')}
              aria-label="清除语音转录"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept={CHAT_DOCUMENT_ACCEPT}
            className="sr-only"
            onChange={(event) => void addDocuments(event.target.files)}
            aria-label="选择文档"
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className={`size-9 shrink-0 text-gray-100 hover:bg-white/10 hover:text-white ${
              isTranscribing ? 'bg-green-400/15 text-green-200' : ''
            }`}
            onClick={onToggleTranscription}
            aria-label={
              isPaused ? '继续语音识别' : isTranscribing ? '停止语音识别' : '开始语音识别'
            }
            title={
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
          </Button>

          <Textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendDraft()
              }
            }}
            rows={1}
            placeholder="输入问题，Shift+Enter 换行"
            className="max-h-32 min-h-9 resize-none border-white/15 bg-black/15 py-2 text-sm text-white shadow-none placeholder:text-gray-300/55 focus-visible:border-white/30 focus-visible:ring-white/15"
            aria-label="对话输入"
          />

          {isLoading ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 text-red-100 hover:bg-red-400/15 hover:text-red-50"
              onClick={() => void window.api.stopSolutionStream()}
              aria-label="停止生成"
            >
              <OctagonX className="size-4" />
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-9 shrink-0 bg-white/15 text-white hover:bg-white/25 hover:text-white"
              disabled={!draft.trim() && documents.length === 0}
              onClick={() => void sendDraft()}
              aria-label="发送消息"
            >
              <Send className="size-4" />
            </Button>
          )}

          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-9 shrink-0 text-gray-100 hover:bg-white/10 hover:text-white"
            onClick={() => fileInputRef.current?.click()}
            aria-label="上传文档"
          >
            <Paperclip className="size-4" />
          </Button>
        </div>
      </div>
    </div>
  )
}
