import { useEffect } from 'react'
import { Image, Minus, Plus } from 'lucide-react'
import { useSettingsStore } from '@/lib/store/settings'
import { useAppStore } from '@/lib/store/app'
import appConfig from '../../../../app.config.json'
import { ConversationHistory } from './ConversationHistory'

export function ReaderBar() {
  const { readerFontSize, screenshotsCollapsed, updateSetting } = useSettingsStore()
  const mode = useAppStore((state) => state.assistantMode)
  const adjust = (delta: number) => {
    const value = useSettingsStore.getState().readerFontSize + delta
    updateSetting(
      'readerFontSize',
      Math.min(appConfig.interface.fontSizeMax, Math.max(appConfig.interface.fontSizeMin, value))
    )
  }
  useEffect(() =>
    window.api.onReaderAction((action) => {
      if (action === 'increaseFontSize') adjust(appConfig.interface.fontSizeStep)
      if (action === 'decreaseFontSize') adjust(-appConfig.interface.fontSizeStep)
      if (action === 'toggleScreenshots')
        updateSetting('screenshotsCollapsed', !useSettingsStore.getState().screenshotsCollapsed)
    })
  )
  return (
    <div className="reader-bar">
      <ConversationHistory />
      <span className="text-xs text-neutral-400">{mode === 'chat' ? '文字对话' : '截图分析'}</span>
      <div className="ml-auto flex items-center gap-1">
        {mode === 'screenshot' && (
          <button
            type="button"
            aria-label={screenshotsCollapsed ? '展开截图' : '折叠截图'}
            aria-pressed={screenshotsCollapsed}
            onClick={() => updateSetting('screenshotsCollapsed', !screenshotsCollapsed)}
          >
            <Image className="size-4" />
          </button>
        )}
        <button
          type="button"
          aria-label="减小字号"
          disabled={readerFontSize === appConfig.interface.fontSizeMin}
          onClick={() => adjust(-appConfig.interface.fontSizeStep)}
        >
          <Minus className="size-4" />
        </button>
        <output className="w-10 text-center text-xs tabular-nums">{readerFontSize}px</output>
        <button
          type="button"
          aria-label="增大字号"
          disabled={readerFontSize === appConfig.interface.fontSizeMax}
          onClick={() => adjust(appConfig.interface.fontSizeStep)}
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  )
}
