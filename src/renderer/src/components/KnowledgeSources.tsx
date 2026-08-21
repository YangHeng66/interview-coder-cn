import { BookOpenText, FileText } from 'lucide-react'
import {
  BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID,
  type KnowledgeContextUsed
} from '../../../preload/contracts'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

export function KnowledgeSources({
  context,
  className = ''
}: {
  context: KnowledgeContextUsed | null | undefined
  className?: string
}) {
  if (!context) return null
  const sourceCount = context.sources.length
  const isBuiltinOnly = context.profileId === BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID

  return (
    <div className={className}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 max-w-full gap-1.5 px-2 text-xs text-gray-100/75 hover:bg-white/10 hover:text-white"
          >
            <BookOpenText className="size-3.5 shrink-0" />
            <span className="truncate">{context.profileName}</span>
            <span className="shrink-0">{sourceCount ? `${sourceCount} 个来源` : '岗位信息'}</span>
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="max-h-80 w-[min(28rem,calc(100vw-2rem))] overflow-y-auto bg-gray-50 p-0 text-gray-900"
        >
          <div className="border-b px-3 py-2.5">
            <p className="text-sm font-medium">本次使用的知识库</p>
            <p className="mt-0.5 text-xs text-gray-500">
              {isBuiltinOnly ? '只读内置资料：' : '岗位档案：'}
              {context.profileName}
            </p>
          </div>
          {sourceCount ? (
            <div className="divide-y">
              {context.sources.map((source) => (
                <div key={source.documentId} className="px-3 py-2.5">
                  <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                    <FileText className="size-4 shrink-0 text-gray-500" />
                    <span className="min-w-0 flex-1 break-words">{source.name}</span>
                    <span className="shrink-0 text-xs font-normal text-gray-500">
                      {source.chunkCount} 个片段
                    </span>
                  </div>
                  {source.excerpts[0] && (
                    <p className="mt-1.5 line-clamp-3 whitespace-pre-wrap break-words text-xs leading-5 text-gray-600">
                      {source.excerpts[0]}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="px-3 py-4 text-sm text-gray-600">
              本次仅使用了公司、岗位和岗位描述，没有可用的文档片段。
            </p>
          )}
        </PopoverContent>
      </Popover>
    </div>
  )
}
