import { useSettingsStore } from '@/lib/store/settings'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import appConfig from '../../../../app.config.json'

export function ReaderPreferences() {
  const {
    readerFontSize,
    readerLineHeight,
    screenshotsCollapsed,
    knowledgeQueryRewrite,
    requestHistoryTurns,
    updateSetting
  } = useSettingsStore()
  const config = appConfig.interface
  return (
    <section className="reader-preferences">
      <h2 className="mb-4 text-lg font-semibold">阅读与响应</h2>
      <div className="preference-row">
        <label htmlFor="reader-font">正文字号</label>
        <div className="flex items-center gap-3">
          <Slider
            id="reader-font"
            value={[readerFontSize]}
            min={config.fontSizeMin}
            max={config.fontSizeMax}
            step={config.fontSizeStep}
            onValueChange={([value]) => updateSetting('readerFontSize', value)}
          />
          <output className="w-12 shrink-0 text-right">{readerFontSize}px</output>
        </div>
      </div>
      <div className="preference-row">
        <label htmlFor="reader-line-height">正文行距</label>
        <div className="flex items-center gap-3">
          <Slider
            id="reader-line-height"
            value={[readerLineHeight]}
            min={config.lineHeightMin}
            max={config.lineHeightMax}
            step={config.lineHeightStep}
            onValueChange={([value]) => updateSetting('readerLineHeight', value)}
          />
          <output className="w-12 shrink-0 text-right">{readerLineHeight.toFixed(1)}</output>
        </div>
      </div>
      <div className="preference-row">
        <label htmlFor="collapse-images">折叠截图</label>
        <Switch
          id="collapse-images"
          checked={screenshotsCollapsed}
          onCheckedChange={(value) => updateSetting('screenshotsCollapsed', value)}
        />
      </div>
      <div className="preference-row">
        <label htmlFor="rewrite-query">AI 查询改写</label>
        <Switch
          id="rewrite-query"
          checked={knowledgeQueryRewrite}
          onCheckedChange={(value) => updateSetting('knowledgeQueryRewrite', value)}
        />
      </div>
      <div className="preference-row">
        <label htmlFor="history-turns">请求上下文轮数（0 为全部）</label>
        <input
          id="history-turns"
          type="number"
          min="0"
          step="1"
          value={requestHistoryTurns}
          onChange={(event) => {
            if (event.target.validity.valid && event.target.value !== '')
              updateSetting('requestHistoryTurns', Number(event.target.value))
          }}
          className="w-24 rounded border bg-white px-2 py-1"
        />
      </div>
    </section>
  )
}
