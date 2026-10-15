import { RefreshCw } from 'lucide-react'
import { IconButton } from '@/components/ui/icon-button'
import { cn } from '@/lib/utils'
import type { ApiProtocol } from '../../../preload/contracts'
import { SelectModel } from './SelectModel'
import { useDetectedModels } from './useDetectedModels'

/** Model picker that lists what the configured provider reports, with manual entry as fallback */
export function ModelRow({
  connection,
  value,
  onChange,
  presetModels,
  customModelValues,
  onCustomModelsChange
}: {
  connection: { apiProtocol: ApiProtocol; apiBaseURL: string; apiKey: string }
  value: string
  onChange: (value: string) => void
  presetModels?: { value: string; label: string }[]
  customModelValues?: string[]
  onCustomModelsChange?: (models: string[]) => void
}) {
  const detection = useDetectedModels(
    connection.apiProtocol,
    connection.apiBaseURL,
    connection.apiKey
  )
  const hint = !detection.ready
    ? '填写 Base URL 和 API Key 后自动检测可用模型'
    : detection.loading
      ? '正在检测可用模型…'
      : detection.models
        ? `已检测到 ${detection.models.length} 个模型`
        : detection.error

  return (
    <div className="flex items-center justify-between gap-4">
      <label className="min-w-0 text-sm font-medium">
        Model
        {hint && (
          <span
            className={cn(
              'ml-2 text-xs font-light',
              detection.error && !detection.loading && 'text-destructive'
            )}
          >
            {hint}
          </span>
        )}
      </label>
      <div className="flex w-60 shrink-0 items-center">
        <SelectModel
          value={value}
          onChange={onChange}
          className="w-auto min-w-0 flex-1 rounded-r-none bg-background"
          presetModels={presetModels}
          detectedModels={detection.models}
          customModelValues={customModelValues}
          onCustomModelsChange={onCustomModelsChange}
        />
        <IconButton
          size="lg"
          className="shrink-0 rounded-l-none border border-l-0 border-input bg-background"
          disabled={!detection.ready || detection.loading}
          onClick={detection.refresh}
          aria-label="重新检测模型"
        >
          <RefreshCw className={cn(detection.loading && 'animate-spin')} />
        </IconButton>
      </div>
    </div>
  )
}
