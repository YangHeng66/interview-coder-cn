import { Link } from 'react-router'
import {
  ArrowLeft,
  Lightbulb,
  MessageCircle,
  Camera,
  PictureInPicture2,
  EyeOff,
  Info
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import ShortcutRenderer from '@/components/ShortcutRenderer'
import { platformAlt } from '@/lib/utils/env'
import { HelpSection } from './components'
import { Shortcuts } from './Shortcuts'
import { OverlayToolbarHelp } from './OverlayToolbar'
import { FAQ } from './FAQ'

export default function HelpPage() {
  return (
    <>
      {/* Header */}
      <div id="app-header" className="flex items-center">
        <div className="actions">
          <Button variant="ghost" asChild size="icon" className="w-12 mr-2 rounded-none">
            <Link to="/">
              <ArrowLeft className="h-5 w-5" />
            </Link>
          </Button>
        </div>
        <h1>帮助中心</h1>
      </div>

      {/* Help Content */}
      <div id="app-content" className="flex flex-col gap-4 p-8">
        {/* Introduction */}
        <HelpSection Icon={Info} title="简介">
          <p className="text-gray-700">
            欢迎使用桌面多模态 AI 助手！无论是屏幕内容分析、文字对话还是实时语音场景，
            该工具都可以帮助您快速截图，分析屏幕内容，并给出解答建议。您可以访问本项目{' '}
            <a
              href="https://github.com/YangHeng66/interview-coder-cn#readme"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-blue-600 hover:underline"
            >
              GitHub 主页
            </a>{' '}
            获取更多帮助信息。
          </p>
          <div className="bg-gray-700/10 rounded-lg p-4">
            <h3 className="font-semibold mb-2">主要功能：</h3>
            <ul className="space-y-1 text-gray-700 list-disc list-inside">
              <li className="flex gap-2">
                <Camera className="h-6 w-4" />
                <span>通过快捷键快速截图，并生成解题建议。</span>
              </li>
              <li className="flex gap-2">
                <MessageCircle className="h-6 w-4" />
                <span>使用独立文字模型进行多轮对话，可手动或自动提交实时语音转录。</span>
              </li>
              <li className="flex gap-2">
                <EyeOff className="h-6 w-4" />
                <span>
                  工具窗口在共享屏幕时自动隐藏(对方不可见)(小部分会议软件可能需要配置才能隐藏)。
                </span>
              </li>
              <li className="flex items-start gap-2">
                <PictureInPicture2 className="h-6 w-4" />
                <span>
                  工具窗口置顶半透明显示，您在做题时光标始终停留在做题区域，不会导致原页面失焦。
                </span>
              </li>
            </ul>
          </div>
        </HelpSection>

        {/* Quick Start */}
        <HelpSection Icon={Lightbulb} title="快速开始">
          <div className="border border-gray-400 rounded-lg p-4">
            <h3 className="font-semibold mb-2">1. 截取屏幕截图</h3>
            <p className="text-sm text-gray-700">
              当您需要分析某个问题时，按下快捷键{' '}
              <ShortcutRenderer shortcut={`${platformAlt}+Enter`} className="text-xs mx-1" />
              截取当前屏幕。截图会立即显示在应用中。
            </p>
          </div>
          <div className="border border-gray-400 rounded-lg p-4">
            <h3 className="font-semibold mb-2">2. 查看结果</h3>
            <p className="text-sm text-gray-700">
              截图完成后，系统会根据当前选择的提示词场景自动分析内容，给出解题思路和答案。
            </p>
          </div>
          <div className="border border-gray-400 rounded-lg p-4">
            <h3 className="font-semibold mb-2">3. 文字与语音对话</h3>
            <p className="text-sm text-gray-700">
              在标题栏切换到「文字对话」，可直接输入问题；开始语音识别后，可从输入区或快捷键发送当前转录，也可以在设置中开启「语音自动回答」，让句末或停顿后的语音自动进入回答队列。
            </p>
          </div>
        </HelpSection>

        {/* Keyboard Shortcuts */}
        <Shortcuts />

        {/* Overlay Toolbar */}
        <OverlayToolbarHelp />

        {/* FAQ */}
        <FAQ />

        {/* Contact Support */}
        <HelpSection Icon={MessageCircle} title="联系支持">
          <p className="text-gray-700">如果您遇到问题或有建议，请通过以下方式联系我们：</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
            <div className="border border-gray-400 rounded-lg p-4">
              <h3 className="font-semibold mb-2 ">GitHub Issues</h3>
              <p className="text-gray-700">
                在{' '}
                <a
                  href="https://github.com/YangHeng66/interview-coder-cn/issues"
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 hover:underline"
                >
                  GitHub Issues
                </a>{' '}
                上提交问题报告和功能请求
              </p>
            </div>
          </div>
        </HelpSection>
      </div>
    </>
  )
}
