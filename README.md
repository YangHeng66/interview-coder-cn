# 截屏解题助手

<p align="center">
  <img src="./build/icon.png" alt="截屏解题助手" width="128" />
</p>

<p align="center">
  面向中文用户的 Electron AI 桌面助手，提供截屏分析、文字对话和实时语音转录。
</p>

## 功能概览

### 截图解题

- 使用全局快捷键截取屏幕，调用视觉模型并流式展示解答
- 支持追加多张截图、结合上下文继续分析和发送追问
- 预置「解算法题」「英语考试」「通用问答」场景，可新增自定义提示词场景
- 可将实时语音转录内容随截图一起提交
- 支持按需将截图自动保存到指定目录

### 文字对话

- 与截图解题使用相互独立的模型和 API 配置
- 内置 DeepSeek 配置，也支持自定义 OpenAI 兼容服务
- 支持 Chat Completions 和 Responses（Codex）协议
- 支持多轮流式对话、自定义系统提示词、停止生成和清空会话
- 支持附加文本、Markdown、JSON、CSV、代码等常见文本文件
- 单次最多添加 5 个文件，每个文件最大 1 MB，文本总量最多 200,000 个字符
- 可将正在进行的语音转录直接发送到文字对话，无需停止转录

### 桌面辅助

- 主窗口透明、置顶，并通过 Electron 内容保护降低被屏幕捕获的概率
- 支持鼠标穿透，不抢占底层页面的鼠标操作
- 独立悬浮工具条可通过点击或悬停触发常用操作
- 支持快捷键调整透明度、移动窗口、翻页和显示/隐藏窗口
- macOS 可选择隐藏 Dock 图标

## 环境要求

- Node.js 22（推荐）
- npm
- Windows 10/11、macOS 或主流 Linux 桌面环境

## 快速开始

### 1. 安装依赖

```bash
npm install
```

如果 Electron 下载失败，可临时指定镜像后重新安装：

```bash
ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/ npm install
```

PowerShell：

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm install
```

### 2. 启动开发环境

```bash
npm run dev
```

### 3. 配置截图模型

进入应用的「设置 -> 截图模型」，配置 API 协议、Base URL、API Key 和模型名称。

| API 协议           | 适用场景                                    | Base URL 示例                                       |
| ------------------ | ------------------------------------------- | --------------------------------------------------- |
| Chat Completions   | 硅基流动、OpenRouter 及其他 OpenAI 兼容服务 | `https://openrouter.ai/api/v1`                      |
| Responses（Codex） | 支持 OpenAI Responses API 的服务            | 使用服务商提供的 API 根地址，通常不要手动追加 `/v1` |

也可以在项目根目录创建 `.env`，为截图模型提供初始配置：

```env
API_BASE_URL="https://openrouter.ai/api/v1"
API_KEY="your-api-key"
MODEL="gpt-5-mini"
```

`.env` 仅作为主进程的初始默认值。应用内保存的设置会优先使用，且 `.env` 已被 Git 忽略。

### 4. 配置文字对话模型

进入「设置 -> 文字对话模型」：

- 选择 `DeepSeek` 时，只需填写 API Key 并选择模型
- 选择「自定义 OpenAI 兼容服务」时，可分别配置 API 协议、Base URL、API Key 和模型名称
- 系统提示词可以独立编辑，不影响截图解题场景

### 5. 配置语音转录（可选）

语音转录使用阿里云百炼 Fun-ASR，需要单独的百炼平台 API Key：

1. 在[百炼平台](https://bailian.console.aliyun.com/cn-beijing?tab=model#/api-key)创建 API Key
2. 在「设置 -> 语音转录」中填写 API Key
3. 选择系统音频或麦克风作为输入设备
4. 使用快捷键开始转录，随后随截图提交或单独发送到文字对话

## 默认快捷键

所有快捷键都可以在设置页面修改。macOS 上的 `Alt` 对应 `Option`，`Ctrl` 对应 `Command`。

| 操作                 | Windows / Linux        | macOS                      |
| -------------------- | ---------------------- | -------------------------- |
| 显示或隐藏窗口       | `Ctrl + H`             | `Option + H`               |
| 切换鼠标穿透         | `Ctrl + M`             | `Option + M`               |
| 截图并新建解题对话   | `Ctrl + Enter`         | `Option + Enter`           |
| 追加截图             | `Ctrl + Shift + Enter` | `Option + Shift + Enter`   |
| 停止生成             | `Ctrl + .`             | `Option + .`               |
| 开始或暂停语音转录   | `Ctrl + T`             | `Option + T`               |
| 清除未提交的转录     | `Ctrl + Shift + T`     | `Option + Shift + T`       |
| 将转录发送到文字对话 | `Ctrl + Alt + Enter`   | `Command + Option + Enter` |
| 向上 / 向下翻页      | `Ctrl + J / K`         | `Command + J / K`          |
| 移动窗口             | `Ctrl + 方向键`        | `Command + 方向键`         |

## 构建与打包

```bash
# 类型检查并构建应用
npm run build

# 生成 Windows NSIS 安装包
npm run build:win

# 生成 macOS DMG
npm run build:mac

# 生成 Linux 安装包
npm run build:linux

# 仅生成未封装目录
npm run build:unpack
```

构建产物位于 `dist/`。

### macOS 打包说明

- 建议在真实 macOS 环境或 GitHub Actions 的 `macos-latest` 环境中执行
- 当前配置未启用 Apple 代码签名和公证，DMG 适合测试使用
- 未签名应用首次打开时可能被 Gatekeeper 拦截
- 当前未明确生成 Intel、Apple Silicon 双架构或 Universal 安装包
- macOS 自动更新当前处于关闭状态

### GitHub Actions 发布

推送符合 `v*` 格式的版本标签后，工作流会分别在 Windows 和 macOS 环境打包，并创建包含安装包的草稿 Release：

```bash
git tag v1.8.0
git push origin v1.8.0
```

发布前请先同步修改 `package.json` 中的版本号，并检查草稿 Release 中的安装包。

## 隐私与屏幕保护说明

- 截图会发送到你配置的截图模型服务商
- 文字消息和附件内容会发送到你配置的文字对话服务商
- 启用语音转录后，音频数据会发送到阿里云百炼
- API Key 和应用设置保存在本机，请勿提交 `.env`、日志或任何真实密钥
- 内容保护的实际效果受操作系统、会议软件和捕获方式影响，请在正式使用前使用目标环境自行测试

## 常见问题

### 截图后没有生成内容

确认 API Key、模型名称和 API Base URL 均正确。Chat Completions 服务通常需要以 `/v1` 结尾的地址；Responses 服务应使用服务商提供的 API 根地址。

### 文字对话无法发送

文字对话拥有独立配置。即使截图模型已经可用，也仍需在「文字对话模型」中配置 API Key 和模型。

### 分享屏幕时一定不会显示吗

不能绝对保证。应用启用了 Electron 内容保护，但不同会议软件、浏览器和系统录屏方式的行为可能不同，必须提前测试。

### 从哪里下载安装包

可前往项目的 [Releases](https://github.com/YangHeng66/interview-coder-cn/releases) 页面查看已发布版本。

## 技术栈

- Electron 37 + electron-vite 4
- React 19 + TypeScript 5.8
- Tailwind CSS 4 + shadcn/ui
- Zustand 5
- Vercel AI SDK + OpenAI-compatible providers
- electron-builder

## 许可与归属

本项目采用 [CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh) 许可，仅允许非商业使用。

当前重构版本由 **YangHeng66** 维护。项目最初基于 Gavin Wang 的 Interview Coder CN 演进；来源署名不会因仓库提交历史重建而失效。项目使用的第三方依赖仍分别遵循其各自许可证。

## 反馈

问题和建议请提交到 [GitHub Issues](https://github.com/YangHeng66/interview-coder-cn/issues)。
