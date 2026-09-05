import { useEffect, useState } from 'react'
import { Search, LoaderCircle, ChevronDown, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { KnowledgeDiagnostic } from '../../../preload/contracts'
import { navigateKnowledgeTabs } from './tab-navigation'

export function RetrievalDiagnostic({
  profileId,
  includeBuiltin
}: {
  profileId: string | null
  includeBuiltin: boolean
}) {
  const [query, setQuery] = useState('')
  const [builtin, setBuiltin] = useState(includeBuiltin)
  const [result, setResult] = useState<KnowledgeDiagnostic | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [view, setView] = useState<'selected' | 'candidates' | 'context'>('selected')
  const [expanded, setExpanded] = useState<string | null>(null)
  useEffect(() => {
    setResult(null)
    setError('')
    setBuiltin(includeBuiltin)
  }, [profileId, includeBuiltin])
  const run = async () => {
    setBusy(true)
    setError('')
    setResult(null)
    try {
      const response = await window.api.diagnoseKnowledge({
        query,
        profileId,
        includeBuiltin: builtin
      })
      if (!response.ok) throw new Error(response.error)
      setResult(response.data)
    } catch (error) {
      setError(String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="knowledge-diagnostic">
      <form
        className="flex gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          void run()
        }}
      >
        <Input
          aria-label="检索问题"
          placeholder="输入检索问题"
          value={query}
          disabled={busy}
          onChange={(event) => {
            setQuery(event.target.value)
            setResult(null)
          }}
        />
        <Button disabled={busy || !query.trim()} type="submit" size="sm">
          {busy ? <LoaderCircle className="size-4 animate-spin" /> : <Search className="size-4" />}
          检索
        </Button>
      </form>
      <label className="my-4 flex items-center gap-2 text-xs text-neutral-600">
        <Switch
          aria-label="诊断包含内置资料"
          checked={builtin}
          disabled={busy}
          onCheckedChange={(value) => {
            setBuiltin(value)
            setResult(null)
          }}
        />
        包含内置资料
      </label>
      {error && (
        <p role="alert" className="break-all text-sm text-red-700">
          {error}
        </p>
      )}
      {result && (
        <>
          <div className="knowledge-metrics" role="status">
            <span>
              命中 <b>{result.candidateCount}</b>
            </span>
            <span>
              选入 <b>{result.passages.length}</b>
            </span>
            <span>
              上下文 <b>{result.contextCharacters}</b> 字符
            </span>
            <span>
              检索 <b>{result.searchMs.toFixed(1)}</b> ms
            </span>
            <span>
              总耗时 <b>{result.elapsedMs.toFixed(1)}</b> ms
            </span>
            <span>
              索引更新 <b>{result.updatedDocuments}</b> 篇
            </span>
          </div>
          <div
            className="knowledge-result-tabs"
            role="tablist"
            aria-label="诊断结果视图"
            onKeyDown={navigateKnowledgeTabs}
          >
            {(
              [
                { id: 'selected', label: '选入片段' },
                { id: 'candidates', label: '候选排序' },
                { id: 'context', label: '完整上下文' }
              ] as const
            ).map((item) => (
              <button
                type="button"
                role="tab"
                aria-selected={view === item.id}
                tabIndex={view === item.id ? 0 : -1}
                key={item.id}
                onClick={() => setView(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
          {view === 'context' ? (
            <pre className="knowledge-passage-text">{result.context}</pre>
          ) : (
            <div>
              {(view === 'selected' ? result.passages : result.candidates).map((passage, index) => (
                <article key={passage.id} className="knowledge-result-row">
                  <button
                    type="button"
                    className="flex w-full min-w-0 items-start gap-2 text-left"
                    aria-expanded={expanded === passage.id}
                    onClick={() => setExpanded(expanded === passage.id ? null : passage.id)}
                  >
                    {expanded === passage.id ? (
                      <ChevronDown className="mt-0.5 size-4 shrink-0" />
                    ) : (
                      <ChevronRight className="mt-0.5 size-4 shrink-0" />
                    )}
                    <span className="text-xs tabular-nums text-neutral-400">{index + 1}</span>
                    <span className="min-w-0 flex-1 break-all text-sm font-medium">
                      {passage.documentName}
                    </span>
                    {'score' in passage && (
                      <span className="shrink-0 text-xs tabular-nums text-neutral-500">
                        {Number(passage.score).toFixed(2)}
                      </span>
                    )}
                  </button>
                  <p className="ml-8 mt-1 text-xs text-neutral-500">
                    片段 {passage.order + 1} · {passage.text.length} 字符
                  </p>
                  <pre
                    className={`knowledge-passage-text ${expanded === passage.id ? '' : 'line-clamp-3'}`}
                  >
                    {passage.text}
                  </pre>
                </article>
              ))}
              {(view === 'selected' ? result.passages : result.candidates).length === 0 && (
                <p className="py-10 text-center text-sm text-neutral-500">未命中相关资料</p>
              )}
            </div>
          )}
        </>
      )}
      {!result && !busy && !error && (
        <div className="knowledge-empty">
          <Search className="size-7" />
          <span>暂无检索结果</span>
        </div>
      )}
    </section>
  )
}
