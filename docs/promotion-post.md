# 桌面多模态 AI 助手：把截图、语音和岗位资料放进同一个工作区

面试准备、技术学习或遇到需要快速理解的屏幕内容时，你是否也在截图工具、聊天窗口、录音软件和资料文件之间来回切换？

我做了一个开源的 Electron 桌面应用，把这些输入方式放进同一个工作区：**桌面多模态 AI 助手**。

项目地址：
https://github.com/YangHeng66/interview-coder-cn

## 它能做什么

- **截图分析**：使用全局快捷键截取屏幕，调用视觉模型流式生成解答；支持追加截图、上下文追问和自定义提示词场景。
- **文字对话**：独立的多轮对话工作区，支持 DeepSeek、OpenAI 兼容服务，以及 Markdown、JSON、CSV、代码和文本附件。
- **实时语音转录**：支持阿里云百炼和火山引擎豆包，可选择系统音频、麦克风或混合音频；转录内容可以随截图提交，也可以直接发送到文字对话。
- **本地岗位知识库**：按岗位保存公司、JD、简历、项目说明和面试笔记；本地解析 PDF、DOCX、TXT、Markdown，并用本地索引检索相关片段。
- **桌面辅助操作**：透明置顶窗口、鼠标穿透、独立悬浮工具条、窗口移动和快捷键自定义，让高频操作更顺手。

## 我比较在意的实现细节

- Electron 主进程负责 AI 请求、截图和语音连接，渲染进程通过类型化 IPC 通信。
- AI 输出使用流式传输，新的文字或语音问题到达后会立即中断当前回答，并处理迟到的数据片段。
- 岗位文档在本机解析、分段和建立索引；发送给模型的是当前问题命中的少量片段，而不是整个文档库。
- 支持 OpenAI 兼容接口，截图模型和文字模型可以分别配置，方便按自己的服务商和模型组合使用。

## 快速开始

```bash
git clone https://github.com/YangHeng66/interview-coder-cn.git
cd interview-coder-cn
npm install
npm run dev
```

启动后，在「设置」中配置截图模型；文字对话和语音转录可以按需单独配置。

## 项目截图

![截图分析与解答](https://raw.githubusercontent.com/YangHeng66/interview-coder-cn/main/docs/images/01-screenshot-analysis.png)

![文字对话工作区](https://raw.githubusercontent.com/YangHeng66/interview-coder-cn/main/docs/images/02-text-chat.png)

![岗位知识库](https://raw.githubusercontent.com/YangHeng66/interview-coder-cn/main/docs/images/03-knowledge-base.png)

## 适合谁

- 想把 AI 截图分析、文字问答和语音输入放在一起的人
- 需要整理不同岗位资料、简历和 JD 的求职者
- 想研究 Electron、React、流式 AI、实时 ASR 和本地检索实现的开发者

项目目前采用 CC BY-NC 4.0，仅允许非商业使用。API Key 和应用设置保存在本机，内容保护可以降低常见屏幕捕获路径中的暴露，但不同系统和会议软件仍需要自行验证。

如果这个项目对你有帮助，欢迎在 GitHub 点一个 **Star**，也欢迎通过 Issue 反馈体验问题或提出想法。Star 会帮助更多需要桌面 AI 工作区的人发现它。

**GitHub：** https://github.com/YangHeng66/interview-coder-cn
