import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import {
  getThinkingLevelsForModel,
  normalizeThinkingLevelForModel,
  type ThinkingLevel
} from '../../../preload/contracts'

const thinkingLevelLabels: Record<ThinkingLevel, string> = {
  auto: '自动',
  none: '关闭',
  minimal: '最小',
  low: '低',
  medium: '中',
  high: '高'
}

export function ThinkingEffortSlider({
  model,
  value,
  onChange,
  disabled
}: {
  model: string
  value: ThinkingLevel
  onChange: (value: ThinkingLevel) => void
  disabled?: boolean
}) {
  const thinkingLevelOptions = getThinkingLevelsForModel(model).map((level) => ({
    value: level,
    label: thinkingLevelLabels[level]
  }))
  const normalizedValue = normalizeThinkingLevelForModel(model, value)
  const selectedIndex = Math.max(
    0,
    thinkingLevelOptions.findIndex((option) => option.value === normalizedValue)
  )
  const selectedOption = thinkingLevelOptions[selectedIndex]

  return (
    <div
      className={cn(
        'flex h-9 w-60 items-center gap-3 rounded-md border border-gray-300 bg-white px-3',
        disabled && 'bg-gray-100 opacity-60'
      )}
    >
      <span className="w-20 shrink-0 whitespace-nowrap text-xs text-gray-600">
        等级（{selectedOption.label}）
      </span>
      <div className="relative min-w-0 flex-1">
        <Slider
          min={0}
          max={thinkingLevelOptions.length - 1}
          step={1}
          value={[selectedIndex]}
          disabled={disabled}
          aria-label="思考等级"
          aria-valuetext={selectedOption.label}
          onValueChange={([nextIndex]) => onChange(thinkingLevelOptions[nextIndex].value)}
          className="relative z-10 [&_[data-slot=slider-track]]:h-5 [&_[data-slot=slider-track]]:bg-gray-200 [&_[data-slot=slider-range]]:bg-sky-500 [&_[data-slot=slider-thumb]]:relative [&_[data-slot=slider-thumb]]:z-30 [&_[data-slot=slider-thumb]]:size-5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-sky-600 [&_[data-slot=slider-thumb]]:bg-gray-200"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-1/2 z-20 flex -translate-y-1/2 justify-between px-1"
        >
          {thinkingLevelOptions.map((option, index) => (
            <span
              key={option.value}
              className={cn(
                'size-1.5 rounded-full',
                index <= selectedIndex ? 'bg-sky-700/60' : 'bg-gray-500/70'
              )}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
