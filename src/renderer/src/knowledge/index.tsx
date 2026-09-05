import { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeft,
  BookOpenText,
  BriefcaseBusiness,
  Building2,
  CircleAlert,
  FileText,
  Search,
  Eye,
  Check,
  Plus,
  RefreshCw,
  Save,
  Star,
  Trash2,
  Upload
} from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { chooseLocalFiles } from '@/lib/local-file-picker'
import {
  BUILTIN_FRONTEND_KNOWLEDGE_TOPICS,
  BUILTIN_FRONTEND_KNOWLEDGE_DOCUMENT_PREFIX,
  KNOWLEDGE_DOCUMENT_EXTENSIONS,
  type KnowledgeDocument,
  type KnowledgeProfile,
  type KnowledgeProfileInput
} from '../../../preload/contracts'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { useKnowledgeStore } from '@/lib/store/knowledge'
import { useChatStore } from '@/lib/store/chat'
import { useSolutionStore } from '@/lib/store/solution'
import { cn, hasBuiltinKnowledgeApi } from '@/lib/utils'
import { RetrievalDiagnostic } from './RetrievalDiagnostic'
import { DocumentPreview } from './DocumentPreview'
import { navigateKnowledgeTabs } from './tab-navigation'

const emptyProfileInput: KnowledgeProfileInput = {
  name: '',
  company: '',
  role: '',
  jobDescription: ''
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function getStatusLabel(document: KnowledgeDocument): string {
  if (document.status === 'ready') return `${document.chunkCount} 个片段`
  if (document.status === 'error') return '处理失败'
  return '正在处理'
}

export default function KnowledgePage() {
  const { snapshot, errorMessage, importProgress, setErrorMessage, setSnapshot } =
    useKnowledgeStore()
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null)
  const [draft, setDraft] = useState<KnowledgeProfileInput>(emptyProfileInput)
  const [createOpen, setCreateOpen] = useState(false)
  const [newProfile, setNewProfile] = useState<KnowledgeProfileInput>(emptyProfileInput)
  const [deleteProfile, setDeleteProfile] = useState<KnowledgeProfile | null>(null)
  const [deleteDocument, setDeleteDocument] = useState<KnowledgeDocument | null>(null)
  const [pendingActivationId, setPendingActivationId] = useState<string | null>(null)
  const [pendingBuiltinEnabled, setPendingBuiltinEnabled] = useState<boolean | null>(null)
  const [busyAction, setBusyAction] = useState<string | null>(null)
  const [tab, setTab] = useState<'documents' | 'profile' | 'diagnostic' | 'builtin'>('documents')
  const [browseAll, setBrowseAll] = useState(false)
  const [documentSearch, setDocumentSearch] = useState('')
  const [profileSearch, setProfileSearch] = useState('')
  const [documentFilter, setDocumentFilter] = useState('all')
  const [preview, setPreview] = useState<{ id: string; name: string } | null>(null)
  const hasVisionContext = useSolutionStore((state) =>
    Boolean(state.screenshotData || state.solutionChunks.length || state.isLoading)
  )
  const hasChatContext = useChatStore((state) => Boolean(state.messages.length || state.isLoading))

  const selectedProfile = useMemo(
    () => snapshot.profiles.find((profile) => profile.id === selectedProfileId) ?? null,
    [selectedProfileId, snapshot.profiles]
  )

  useEffect(() => {
    if (browseAll) return
    if (
      selectedProfileId &&
      snapshot.profiles.some((profile) => profile.id === selectedProfileId)
    ) {
      return
    }
    setSelectedProfileId(snapshot.activeProfileId ?? snapshot.profiles[0]?.id ?? null)
  }, [selectedProfileId, snapshot.activeProfileId, snapshot.profiles, browseAll])

  useEffect(() => {
    setDraft(
      selectedProfile
        ? {
            name: selectedProfile.name,
            company: selectedProfile.company,
            role: selectedProfile.role,
            jobDescription: selectedProfile.jobDescription
          }
        : emptyProfileInput
    )
    // Document association updates must not replace an unsaved profile draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    selectedProfile?.id,
    selectedProfile?.name,
    selectedProfile?.company,
    selectedProfile?.role,
    selectedProfile?.jobDescription
  ])

  const visibleDocuments = snapshot.documents.filter((document) => {
    const linked = selectedProfile?.documentLinks.some((link) => link.documentId === document.id)
    return (
      document.name.toLowerCase().includes(documentSearch.toLowerCase()) &&
      (documentFilter === 'all' ||
        (documentFilter === 'linked' && linked) ||
        (documentFilter === 'unlinked' && !linked) ||
        (documentFilter === 'error' && document.status === 'error'))
    )
  })

  const runAction = async (key: string, action: () => Promise<void>) => {
    if (busyAction) return
    setBusyAction(key)
    setErrorMessage(null)
    try {
      await action()
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error))
    } finally {
      setBusyAction(null)
    }
  }

  const clearRendererConversations = () => {
    useSolutionStore.getState().resetState()
    useChatStore.getState().handleEvent({ type: 'conversation-cleared' })
    useKnowledgeStore.getState().clearVisionContext()
    useKnowledgeStore.getState().clearChatContexts()
  }

  const createProfile = () =>
    runAction('create-profile', async () => {
      const result = await window.api.createKnowledgeProfile(newProfile)
      if (!result.ok) throw new Error(result.error)
      setSelectedProfileId(result.data.id)
      setBrowseAll(false)
      setTab('profile')
      setNewProfile(emptyProfileInput)
      setCreateOpen(false)
      toast.success('岗位档案已创建')
    })

  const saveProfile = () => {
    if (!selectedProfile) return
    void runAction('save-profile', async () => {
      const result = await window.api.updateKnowledgeProfile(selectedProfile.id, draft)
      if (!result.ok) throw new Error(result.error)
      toast.success('岗位档案已保存')
    })
  }

  const activateProfile = (profileId: string) =>
    runAction('activate-profile', async () => {
      const result = await window.api.activateKnowledgeProfile(profileId)
      if (!result.ok) throw new Error(result.error)
      setSnapshot(result.data)
      clearRendererConversations()
      toast.success('当前岗位已切换，对话上下文已清空')
    })

  const setBuiltinKnowledgeEnabled = (enabled: boolean) =>
    runAction('builtin-knowledge', async () => {
      if (!hasBuiltinKnowledgeApi()) {
        throw new Error('知识库接口尚未加载，请完全退出并重新启动应用后再试')
      }
      const result = await window.api.setBuiltinKnowledgeEnabled(enabled)
      if (!result.ok) throw new Error(result.error)
      setSnapshot(result.data)
      clearRendererConversations()
      toast.success(enabled ? '已启用前端通用知识' : '已关闭前端通用知识')
    })

  const requestBuiltinKnowledgeChange = (enabled: boolean) => {
    if (enabled === snapshot.builtinFrontendKnowledgeEnabled) return
    if (hasVisionContext || hasChatContext) {
      setPendingBuiltinEnabled(enabled)
      return
    }
    void setBuiltinKnowledgeEnabled(enabled)
  }

  const requestProfileActivation = (profileId: string) => {
    if (hasVisionContext || hasChatContext) {
      setPendingActivationId(profileId)
      return
    }
    void activateProfile(profileId)
  }

  const confirmDeleteProfile = () => {
    if (!deleteProfile) return
    void runAction('delete-profile', async () => {
      const wasActive = snapshot.activeProfileId === deleteProfile.id
      const result = await window.api.deleteKnowledgeProfile(deleteProfile.id)
      if (!result.ok) throw new Error(result.error)
      setSnapshot(result.data)
      if (wasActive) clearRendererConversations()
      setDeleteProfile(null)
      toast.success('岗位档案已删除，文档仍保留在共享库')
    })
  }

  const importDocuments = () =>
    runAction('import-documents', async () => {
      const paths = await chooseLocalFiles({
        title: '导入知识库文档',
        mode: 'files',
        extensions: KNOWLEDGE_DOCUMENT_EXTENSIONS,
        multiple: true
      })
      if (!paths.length) return
      const result = await window.api.importKnowledgeDocuments(selectedProfile?.id, paths)
      if (!result.ok) throw new Error(result.error)
      if (!result.data) return
      setSnapshot(result.data.snapshot)
      if (result.data.failures.length) {
        setErrorMessage(
          result.data.failures.map((failure) => `${failure.name}：${failure.error}`).join('\n')
        )
      } else if (result.data.duplicateIds.length) {
        toast.success('文档已存在，已复用并关联到当前岗位')
      } else {
        toast.success('文档已导入知识库')
      }
    })

  const setDocumentLinked = (documentId: string, linked: boolean) => {
    if (!selectedProfile) return
    void runAction(`link-${documentId}`, async () => {
      const result = await window.api.updateKnowledgeDocumentLink(selectedProfile.id, documentId, {
        linked
      })
      if (!result.ok) throw new Error(result.error)
      setSnapshot(result.data)
    })
  }

  const toggleDocumentPriority = (documentId: string, isKey: boolean) => {
    if (!selectedProfile) return
    void runAction(`priority-${documentId}`, async () => {
      const result = await window.api.updateKnowledgeDocumentLink(selectedProfile.id, documentId, {
        priority: isKey ? 'normal' : 'key'
      })
      if (!result.ok) throw new Error(result.error)
      setSnapshot(result.data)
    })
  }

  const retryDocument = (documentId: string) =>
    runAction(`retry-${documentId}`, async () => {
      const result = await window.api.retryKnowledgeDocument(documentId)
      if (!result.ok) throw new Error(result.error)
      setSnapshot(result.data)
      toast.success('文档已重新处理')
    })

  const confirmDeleteDocument = () => {
    if (!deleteDocument) return
    void runAction('delete-document', async () => {
      const result = await window.api.deleteKnowledgeDocument(deleteDocument.id)
      if (!result.ok) throw new Error(result.error)
      setSnapshot(result.data)
      setDeleteDocument(null)
      toast.success('文档副本和本地索引已删除')
    })
  }

  return (
    <div className="knowledge-page">
      <div id="app-header" className="flex items-center">
        <div className="actions">
          <Button variant="ghost" asChild size="icon" className="mr-2 w-12 rounded-none">
            <Link to="/" aria-label="返回主界面">
              <ArrowLeft className="size-5" />
            </Link>
          </Button>
        </div>
        <h1>岗位知识库</h1>
      </div>

      <div className="knowledge-workspace">
        <aside className="knowledge-sidebar">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm font-semibold">岗位档案</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              onClick={() => setCreateOpen(true)}
              aria-label="新建岗位档案"
              data-tooltip="新建岗位档案"
            >
              <Plus className="size-4" />
            </Button>
          </div>
          <div className="px-3 pb-2">
            <Input
              aria-label="搜索岗位档案"
              placeholder="搜索岗位"
              value={profileSearch}
              onChange={(event) => setProfileSearch(event.target.value)}
              className="h-8 bg-white text-xs"
            />
          </div>
          <button
            type="button"
            className={`knowledge-library-link ${browseAll ? 'is-selected' : ''}`}
            onClick={() => {
              setBrowseAll(true)
              setSelectedProfileId(null)
              setTab('documents')
              setDocumentFilter('all')
            }}
          >
            <BookOpenText className="size-4" />
            全部文档<span className="ml-auto text-xs">{snapshot.documents.length}</span>
          </button>
          <div className="knowledge-profile-list min-h-0 flex-1 overflow-y-auto p-2">
            {snapshot.profiles.length ? (
              <div className="space-y-1">
                {snapshot.profiles
                  .filter((profile) =>
                    `${profile.name} ${profile.company} ${profile.role}`
                      .toLowerCase()
                      .includes(profileSearch.toLowerCase())
                  )
                  .map((profile) => (
                    <button
                      key={profile.id}
                      type="button"
                      className={cn(
                        'flex w-full items-start gap-2 rounded-md px-2.5 py-2 text-left transition-colors',
                        selectedProfileId === profile.id
                          ? 'knowledge-profile-selected'
                          : 'text-gray-700 hover:bg-white/40'
                      )}
                      onClick={() => {
                        setBrowseAll(false)
                        setSelectedProfileId(profile.id)
                        setDocumentFilter('all')
                      }}
                    >
                      <BriefcaseBusiness className="mt-0.5 size-4 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block break-words text-sm font-medium">
                          {profile.name}
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-gray-500">
                          {[profile.company, profile.role].filter(Boolean).join(' · ') ||
                            `${profile.documentLinks.length} 篇资料`}
                        </span>
                      </span>
                      {snapshot.activeProfileId === profile.id && (
                        <span
                          className="mt-0.5 shrink-0 text-emerald-700"
                          aria-label="当前启用岗位"
                        >
                          <Check className="size-3.5" />
                        </span>
                      )}
                    </button>
                  ))}
              </div>
            ) : (
              <div className="px-3 py-8 text-center text-sm text-gray-600">
                <BriefcaseBusiness className="mx-auto mb-2 size-6" />
                暂无岗位档案
              </div>
            )}
          </div>
        </aside>

        <main className="knowledge-main">
          <div className="knowledge-scope-header">
            <div className="min-w-0 flex-1">
              <h2 className="break-words text-base font-semibold">
                {selectedProfile?.name ?? '共享文档库'}
              </h2>
              <p className="mt-1 text-xs text-neutral-500">
                {selectedProfile
                  ? `${selectedProfile.documentLinks.length} 篇关联资料`
                  : `${snapshot.documents.length} 篇文档`}
                {selectedProfile?.id === snapshot.activeProfileId && selectedProfile
                  ? ' · 当前启用'
                  : ''}
              </p>
            </div>
            {selectedProfile && snapshot.activeProfileId !== selectedProfile.id && (
              <Button
                size="sm"
                variant="outline"
                disabled={Boolean(busyAction)}
                onClick={() => requestProfileActivation(selectedProfile.id)}
              >
                <Check className="size-3.5" />
                启用岗位
              </Button>
            )}
          </div>
          <div
            className="knowledge-tabs"
            role="tablist"
            aria-label="知识库视图"
            onKeyDown={navigateKnowledgeTabs}
          >
            {(
              [
                { id: 'documents', label: '文档' },
                { id: 'profile', label: '岗位资料' },
                { id: 'diagnostic', label: '检索诊断' },
                { id: 'builtin', label: '内置资料' }
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                id={`knowledge-tab-${item.id}`}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                tabIndex={tab === item.id ? 0 : -1}
                aria-controls="knowledge-tabpanel"
                onClick={() => setTab(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div
            className="knowledge-main-content"
            id="knowledge-tabpanel"
            role="tabpanel"
            aria-labelledby={`knowledge-tab-${tab}`}
          >
            {errorMessage && (
              <div
                role="alert"
                className="mb-4 flex items-start gap-2 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800"
              >
                <CircleAlert className="mt-0.5 size-4 shrink-0" />
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words">
                  {errorMessage}
                </span>
                <button
                  type="button"
                  className="shrink-0 text-xs underline"
                  onClick={() => setErrorMessage(null)}
                >
                  关闭
                </button>
              </div>
            )}

            {tab === 'diagnostic' && (
              <RetrievalDiagnostic
                key={`${selectedProfileId}:${snapshot.builtinFrontendKnowledgeEnabled}`}
                profileId={selectedProfileId}
                includeBuiltin={snapshot.builtinFrontendKnowledgeEnabled}
              />
            )}
            {tab === 'builtin' && (
              <section aria-labelledby="builtin-knowledge-heading" className="knowledge-builtin">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <span className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-md bg-sky-700/10 text-sky-800">
                      <BookOpenText className="size-5" />
                    </span>
                    <div className="min-w-0">
                      <h2 id="builtin-knowledge-heading" className="text-base font-semibold">
                        前端开发通用知识
                      </h2>
                      <p className="mt-1 text-xs text-neutral-500">
                        {BUILTIN_FRONTEND_KNOWLEDGE_TOPICS.length} 个主题 · 本地资料
                      </p>
                    </div>
                  </div>
                  <label
                    htmlFor="builtin-knowledge-switch"
                    className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-sm font-medium"
                  >
                    <span>
                      {snapshot.builtinFrontendKnowledgeEnabled ? '已参与检索' : '已关闭'}
                    </span>
                    <Switch
                      id="builtin-knowledge-switch"
                      checked={snapshot.builtinFrontendKnowledgeEnabled}
                      onCheckedChange={requestBuiltinKnowledgeChange}
                      disabled={Boolean(busyAction)}
                      aria-label="启用前端开发通用知识"
                    />
                  </label>
                </div>

                <div className="mt-4 divide-y divide-neutral-200">
                  {BUILTIN_FRONTEND_KNOWLEDGE_TOPICS.map((topic) => (
                    <div key={topic.id} className="flex min-w-0 items-center gap-3 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="break-words text-sm font-medium text-gray-800">
                          {topic.name}
                        </p>
                        <p className="mt-1 break-words text-xs leading-5 text-gray-600">
                          {topic.summary}
                        </p>
                      </div>
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`预览${topic.name}`}
                        onClick={() =>
                          setPreview({
                            id: `${BUILTIN_FRONTEND_KNOWLEDGE_DOCUMENT_PREFIX}${topic.id}`,
                            name: topic.name
                          })
                        }
                      >
                        <Eye className="size-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {tab === 'profile' &&
              (selectedProfile ? (
                <>
                  <section aria-labelledby="profile-heading">
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <h2 id="profile-heading" className="text-lg font-semibold">
                          {selectedProfile.name}
                        </h2>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {snapshot.activeProfileId !== selectedProfile.id && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => requestProfileActivation(selectedProfile.id)}
                            disabled={Boolean(busyAction)}
                          >
                            设为当前岗位
                          </Button>
                        )}
                        <Button
                          type="button"
                          size="sm"
                          onClick={saveProfile}
                          disabled={Boolean(busyAction) || !draft.name.trim()}
                        >
                          <Save className="size-4" />
                          保存
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-red-700 hover:bg-red-100 hover:text-red-800"
                          onClick={() => setDeleteProfile(selectedProfile)}
                          aria-label="删除岗位档案"
                          data-tooltip="删除岗位档案"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <label className="space-y-1.5 text-sm font-medium">
                        档案名称
                        <Input
                          value={draft.name}
                          onChange={(event) =>
                            setDraft((value) => ({ ...value, name: event.target.value }))
                          }
                          maxLength={80}
                          className="bg-white"
                        />
                      </label>
                      <label className="space-y-1.5 text-sm font-medium">
                        公司
                        <div className="relative">
                          <Building2 className="pointer-events-none absolute left-3 top-2.5 size-4 text-gray-400" />
                          <Input
                            value={draft.company}
                            onChange={(event) =>
                              setDraft((value) => ({ ...value, company: event.target.value }))
                            }
                            maxLength={120}
                            className="bg-white pl-9"
                          />
                        </div>
                      </label>
                      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                        面试岗位
                        <Input
                          value={draft.role}
                          onChange={(event) =>
                            setDraft((value) => ({ ...value, role: event.target.value }))
                          }
                          maxLength={120}
                          className="bg-white"
                        />
                      </label>
                      <label className="space-y-1.5 text-sm font-medium sm:col-span-2">
                        岗位描述（JD）
                        <Textarea
                          value={draft.jobDescription}
                          onChange={(event) =>
                            setDraft((value) => ({ ...value, jobDescription: event.target.value }))
                          }
                          maxLength={30_000}
                          rows={8}
                          className="resize-y bg-white leading-6"
                          placeholder="粘贴岗位职责、技术要求和业务背景"
                        />
                      </label>
                    </div>
                  </section>

                  <div className="my-6 border-t border-gray-400/50" />
                </>
              ) : (
                <section className="mb-6 py-5 text-center">
                  <BriefcaseBusiness className="mx-auto mb-2 size-7 text-gray-500" />
                  <h2 className="font-semibold">未选择岗位</h2>
                  <Button className="mt-3" size="sm" onClick={() => setCreateOpen(true)}>
                    <Plus className="size-4" />
                    新建岗位
                  </Button>
                </section>
              ))}

            {tab === 'documents' && (
              <section aria-labelledby="documents-heading">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 id="documents-heading" className="text-base font-semibold">
                      文档资料
                    </h2>
                    <p className="mt-0.5 text-xs text-gray-600">
                      支持 PDF、DOCX、TXT、Markdown；单文件不超过 10 MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void importDocuments()}
                    disabled={Boolean(busyAction)}
                  >
                    <Upload className="size-4" />
                    导入文档
                  </Button>
                </div>

                <div className="knowledge-document-filters">
                  <div className="relative min-w-0 flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-2.5 size-4 text-neutral-400" />
                    <Input
                      aria-label="搜索知识库文档"
                      placeholder="搜索文档名称"
                      value={documentSearch}
                      onChange={(event) => setDocumentSearch(event.target.value)}
                      className="pl-8"
                    />
                  </div>
                  <Select value={documentFilter} onValueChange={setDocumentFilter}>
                    <SelectTrigger aria-label="筛选知识库文档" className="w-32 shrink-0">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">全部文档</SelectItem>
                      {selectedProfile && (
                        <>
                          <SelectItem value="linked">已关联</SelectItem>
                          <SelectItem value="unlinked">未关联</SelectItem>
                        </>
                      )}
                      <SelectItem value="error">处理失败</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="knowledge-documents">
                  {visibleDocuments.length ? (
                    <div className="divide-y divide-gray-300">
                      {visibleDocuments.map((document) => {
                        const link = selectedProfile?.documentLinks.find(
                          (candidate) => candidate.documentId === document.id
                        )
                        const progress = importProgress[document.id]
                        const isKey = link?.priority === 'key'
                        return (
                          <div key={document.id} className="knowledge-document-row">
                            <Checkbox
                              checked={Boolean(link)}
                              disabled={!selectedProfile || Boolean(busyAction)}
                              onCheckedChange={(checked) =>
                                setDocumentLinked(document.id, checked === true)
                              }
                              aria-label={`${link ? '取消关联' : '关联'}文档 ${document.name}`}
                            />
                            <FileText className="size-4 shrink-0 text-gray-500" />
                            <div className="min-w-0 flex-1">
                              <p className="break-words text-sm font-medium">{document.name}</p>
                              <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-xs text-gray-500">
                                <span>{formatFileSize(document.size)}</span>
                                <span>
                                  {progress?.stage === 'extracting'
                                    ? '正在提取文本'
                                    : getStatusLabel(document)}
                                </span>
                                {document.error && (
                                  <span className="text-red-700">{document.error}</span>
                                )}
                              </div>
                            </div>
                            <div className="knowledge-document-actions">
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8"
                                disabled={document.status !== 'ready'}
                                aria-label={`预览文档 ${document.name}`}
                                onClick={() => setPreview(document)}
                              >
                                <Eye className="size-4" />
                              </Button>
                              {link && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className={cn(
                                    'size-8 shrink-0',
                                    isKey ? 'text-amber-600 hover:text-amber-700' : 'text-gray-400'
                                  )}
                                  onClick={() => toggleDocumentPriority(document.id, isKey)}
                                  disabled={Boolean(busyAction)}
                                  aria-label={isKey ? '取消重点资料' : '设为重点资料'}
                                  data-tooltip={isKey ? '取消重点资料' : '设为重点资料'}
                                >
                                  <Star className={cn('size-4', isKey && 'fill-current')} />
                                </Button>
                              )}
                              {document.status === 'error' && (
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="icon"
                                  className="size-8 shrink-0"
                                  onClick={() => void retryDocument(document.id)}
                                  disabled={Boolean(busyAction)}
                                  aria-label="重新处理文档"
                                  data-tooltip="重新处理文档"
                                >
                                  <RefreshCw className="size-4" />
                                </Button>
                              )}
                              <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="size-8 shrink-0 text-red-700 hover:bg-red-100 hover:text-red-800"
                                onClick={() => setDeleteDocument(document)}
                                disabled={document.status === 'processing' || Boolean(busyAction)}
                                aria-label="永久删除文档"
                                data-tooltip="永久删除文档"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  ) : (
                    <div className="px-4 py-10 text-center text-sm text-gray-600">
                      <FileText className="mx-auto mb-2 size-6" />
                      {snapshot.documents.length ? '没有匹配的文档' : '尚未导入文档'}
                    </div>
                  )}
                </div>
              </section>
            )}
          </div>
        </main>
      </div>

      <DocumentPreview document={preview} onClose={() => setPreview(null)} />

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建岗位档案</DialogTitle>
            <DialogDescription>填写一个便于面试前快速识别的名称。</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="space-y-1.5 text-sm font-medium">
              档案名称
              <Input
                value={newProfile.name}
                onChange={(event) =>
                  setNewProfile((value) => ({ ...value, name: event.target.value }))
                }
                placeholder="例如：字节跳动 - 前端开发"
                maxLength={80}
                autoFocus
                onKeyDown={(event) => {
                  if (event.key === 'Enter' && newProfile.name.trim()) void createProfile()
                }}
              />
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              取消
            </Button>
            <Button
              onClick={() => void createProfile()}
              disabled={!newProfile.name.trim() || Boolean(busyAction)}
            >
              创建
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteProfile)}
        onOpenChange={(open) => !open && setDeleteProfile(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除岗位档案</DialogTitle>
            <DialogDescription>
              将删除“{deleteProfile?.name}”及其文档关联，共享文档本身仍会保留。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteProfile(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteProfile}
              disabled={Boolean(busyAction)}
            >
              删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(deleteDocument)}
        onOpenChange={(open) => !open && setDeleteDocument(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>永久删除文档</DialogTitle>
            <DialogDescription>
              将从所有岗位移除“{deleteDocument?.name}
              ”，并永久删除应用内副本、提取片段和索引。此操作无法恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDocument(null)}>
              取消
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDeleteDocument}
              disabled={Boolean(busyAction)}
            >
              永久删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={pendingBuiltinEnabled !== null}
        onOpenChange={(open) => !open && setPendingBuiltinEnabled(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingBuiltinEnabled ? '启用前端通用知识' : '关闭前端通用知识'}
            </DialogTitle>
            <DialogDescription>
              切换知识来源会停止当前生成，并清空截图解题和文字对话上下文，避免前后两次回答使用不同的资料范围。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingBuiltinEnabled(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                const enabled = pendingBuiltinEnabled
                setPendingBuiltinEnabled(null)
                if (enabled !== null) void setBuiltinKnowledgeEnabled(enabled)
              }}
              disabled={Boolean(busyAction)}
            >
              切换并清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingActivationId)}
        onOpenChange={(open) => !open && setPendingActivationId(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>切换当前岗位</DialogTitle>
            <DialogDescription>
              启用该岗位会停止当前生成，并清空截图解题和文字对话上下文，避免不同岗位的资料混用。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingActivationId(null)}>
              取消
            </Button>
            <Button
              onClick={() => {
                const profileId = pendingActivationId
                setPendingActivationId(null)
                if (profileId) void activateProfile(profileId)
              }}
              disabled={Boolean(busyAction)}
            >
              切换并清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
