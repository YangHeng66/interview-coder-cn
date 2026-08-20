# 截屏解题助手 / 编码面试助手 / 在线考试助手

<p align="center">
  <img src="./build/icon.png" alt="截屏解题助手" width="128" />
</p>

## 项目简介

这是一个面向中文用户的截屏解题助手：按下快捷键截取屏幕，AI 实时分析屏幕上的题目并给出解答。窗口对屏幕分享软件隐身，且不会抢占焦点。适配国内 AI 生态，简单易用。

### 核心能力

- **截屏解题**：通过快捷键抓取屏幕内容（可附带电脑声音的实时转录文字），发送给视觉大模型分析，流式展示解答；支持追加截图和追问，保持对话上下文连续
- **场景化提示词**：预置「解算法题」「英语考试」「通用问答」三个场景，一键切换；也可以添加自定义场景，扩展到任意题型
- **屏幕分享隐身**：即使被要求分享屏幕，对方也看不到本助手的窗口
- **不抢占焦点**：窗口置顶半透明展示，不会导致原页面失焦，可规避“跳出网页”检测

### 适用场景

- **编程面试 / 笔试**：分析屏幕上的题目，实时给出解题思路和代码，支持 Python、JavaScript、Java、C++ 等主流编程语言
- **英语机试**：切换到「英语考试」场景，还可结合语音转录处理听力题
- **在线考试**：单选、多选、解答等通用题型，切换到「通用问答」场景即可
- **其他场景**：添加自定义提示词场景，自行扩展


## 如何使用

> 编译安装包可从本项目的 [Releases](https://github.com/YangHeng66/interview-coder-cn/releases) 页面下载。

### 1. 安装依赖

注：项目运行依赖 Node.js 环境，如未安装请先安装 [下载地址](https://nodejs.org/zh-cn/download)。

```bash
$ npm install
```

### 2. 启动程序开始正常使用

```bash
$ npm run dev
```

### 3. 配置 API Key

> 注意，应大家的要求，从 1.6 版本开始，添加了对「硅基流动」API 的支持，方便大家使用国内模型。

启动程序后，进入「设置」页面，选择 API 协议并配置 `API Base URL` 和 `API Key`：

- `Chat Completions`：适用于硅基流动、OpenRouter 等 OpenAI 兼容服务，Base URL 通常以 `/v1` 结尾。
- `Responses（Codex）`：适用于 Codex 自定义服务商使用的 Responses API，Base URL 与 Codex 的 `base_url` 保持一致，不额外添加 `/v1`。

API 地址和 API Key 需要从支持 OpenAI API 的代理服务商处获取。如国内的 [硅基流动](https://cloud.siliconflow.cn/i/SG8C0772) 或国外的 [OpenRouter](https://openrouter.ai/) 等服务商，支持支付宝付款。

当然，如果你（人在海外）可以直接使用 OpenAI 官方的 API 更好，只需要配置 `API Key` 就够了。

> 也可以在项目根目录创建 `.env` 文件预配置，程序启动后会自动读取作为默认值。

```env
API_BASE_URL="https://openrouter.ai/api/v1" # 聚合服务的 API 地址，这里以 OpenRouter 为例
API_KEY="sk-1234567890" # 代理服务商的 API Key，这里只是示例，需要改成你自己的
```

### 4. （可选）配置语音转录

语音转录功能可以实时将电脑播放的声音（如面试官讲话、听力音频）转为文字，并在截图时一起提交给 AI 辅助分析题意。

目前该功能固定使用 Fun-ASR 模型 (0.02元/分钟，新用户有10小时免费额度)，需要配置阿里云百炼平台的 API Key：

1. 访问 [百炼平台控制台](https://help.aliyun.com/zh/model-studio/get-api-key) 注册并创建 API Key
2. 在应用「设置」页面的「语音转录」部分填入 API Key
3. 使用快捷键（默认 `Alt+T` / `Ctrl+T`）开始/暂停语音转录

## 关于隐身能力的说明

目前隐身功能适配市面上大部分会议软件(如 腾讯会议 等)，但很少部分软件和浏览器可能无法正常隐身。使用前自己做好测试，本项目不承担任何责任。相关问题欢迎在本项目的 [Issues](https://github.com/YangHeng66/interview-coder-cn/issues) 中讨论。


## 许可协议（License）

本项目采用 **[CC BY-NC 4.0](https://creativecommons.org/licenses/by-nc/4.0/deed.zh)** 协议许可。

您可以自由使用、复制、修改本项目代码，但 **禁止任何形式的商业用途**，包括但不限于售卖、集成入商业产品、SaaS 服务等。

本仓库由 **YangHeng66** 维护，基于 Gavin Wang 的 Interview Coder CN 修改并重新发布。相较原作，本版本增加了 Responses API（Codex 自定义服务商）等功能。原作及本版本均依照 CC BY-NC 4.0 许可，原作者和历史贡献者署名保留在 Git 提交历史中。
