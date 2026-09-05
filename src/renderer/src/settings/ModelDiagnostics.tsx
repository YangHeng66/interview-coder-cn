import { useState } from 'react'
import { CheckCircle2, Image, LoaderCircle, Radio, Send, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  getApiEndpoint,
  type ModelDiagnosticInput,
  type ModelDiagnosticResult
} from '../../../preload/contracts'
import appConfig from '../../../../app.config.json'

export function ModelDiagnostics({
  connection
}: {
  connection: Omit<ModelDiagnosticInput, 'kind' | 'image'>
}) {
  const [pending, setPending] = useState<ModelDiagnosticInput['kind'] | null>(null)
  const [result, setResult] = useState<ModelDiagnosticResult | null>(null)
  const [checkedConnection, setCheckedConnection] = useState('')
  const signature = JSON.stringify(connection)
  const visibleResult = signature === checkedConnection ? result : null
  const run = async (kind: ModelDiagnosticInput['kind']) => {
    setPending(kind)
    setCheckedConnection(signature)
    setResult(null)
    let image: string | undefined
    if (kind === 'image') {
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = appConfig.diagnostics.imageSize
      const context = canvas.getContext('2d')!
      context.fillStyle = appConfig.diagnostics.imageColor
      context.fillRect(0, 0, canvas.width, canvas.height)
      image = canvas.toDataURL('image/png')
    }
    try {
      setResult(await window.api.diagnoseModel({ ...connection, kind, image }))
    } catch (error) {
      setResult({
        ok: false,
        endpoint: getApiEndpoint(connection.apiBaseURL, connection.apiProtocol),
        elapsedMs: 0,
        firstTextMs: null,
        status: null,
        text: '',
        error: String(error)
      })
    } finally {
      setPending(null)
    }
  }
  const disabled =
    pending !== null ||
    !connection.apiBaseURL.trim() ||
    !connection.apiKey.trim() ||
    !connection.model.trim()
  return (
    <div className="model-diagnostics">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium">连接诊断</span>
        <div className="flex gap-1">
          {(
            [
              { kind: 'text', label: '文字', Icon: Send },
              { kind: 'image', label: '图片', Icon: Image },
              { kind: 'stream', label: '流式', Icon: Radio }
            ] as const
          ).map(({ kind, label, Icon }) => (
            <Button
              key={kind}
              variant="outline"
              size="sm"
              disabled={disabled}
              onClick={() => void run(kind)}
            >
              {pending === kind ? (
                <LoaderCircle className="size-3.5 animate-spin" />
              ) : (
                <Icon className="size-3.5" />
              )}
              {label}
            </Button>
          ))}
        </div>
      </div>
      <code className="block break-all text-xs text-neutral-600">
        {connection.apiBaseURL.trim()
          ? getApiEndpoint(connection.apiBaseURL, connection.apiProtocol)
          : '未配置地址'}
      </code>
      {visibleResult && (
        <div className="mt-3 text-sm" role="status">
          <div
            className={`flex flex-wrap items-center gap-2 ${visibleResult.ok ? 'text-emerald-700' : 'text-red-700'}`}
          >
            {visibleResult.ok ? (
              <CheckCircle2 className="size-4" />
            ) : (
              <XCircle className="size-4" />
            )}
            {visibleResult.ok ? '调用成功' : '调用失败'}
            <span>
              {visibleResult.status === null ? '未收到 HTTP 响应' : `HTTP ${visibleResult.status}`}
            </span>
            <span>{visibleResult.elapsedMs} ms</span>
            {visibleResult.firstTextMs !== null && <span>首字 {visibleResult.firstTextMs} ms</span>}
          </div>
          <p className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-words">
            {visibleResult.error ?? visibleResult.text}
          </p>
        </div>
      )}
    </div>
  )
}
