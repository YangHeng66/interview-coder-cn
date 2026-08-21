import type {
  KnowledgeDocumentLink,
  KnowledgeLinkPriority,
  KnowledgeProfile
} from '../../../preload/contracts'
import {
  BUILTIN_FRONTEND_KNOWLEDGE_DOCUMENT_PREFIX,
  BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID,
  BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_NAME,
  BUILTIN_FRONTEND_KNOWLEDGE_TOPICS
} from '../../../preload/contracts'
import { chunkKnowledgeText, type KnowledgeChunk } from '../search'

export type BuiltinKnowledgeDocument = {
  id: string
  name: string
  priority: KnowledgeLinkPriority
  chunks: KnowledgeChunk[]
}

const BUILTIN_TIMESTAMP = '2026-01-01T00:00:00.000Z'

const DOCUMENT_TEXT: Record<(typeof BUILTIN_FRONTEND_KNOWLEDGE_TOPICS)[number]['id'], string> = {
  'html-css-accessibility': `# HTML、CSS 与无障碍

## HTML 结构

优先使用能表达含义的语义元素：页面主导航使用 nav，主要内容使用 main，独立内容使用 article，相关补充内容使用 aside，标题遵循 h1 到 h6 的层级。按钮执行动作，链接负责导航；不要用 div 加点击事件替代原生控件。表单控件要有可见 label，label 的 for 与控件 id 对应，错误信息应紧邻字段并能被辅助技术感知。

HTML 的可访问性从文档结构开始。图片需要根据用途提供 alt：信息图片描述内容，装饰图片使用空 alt。表格使用 caption、thead、th 和 scope 表达关系。键盘焦点顺序应该符合视觉顺序，不能依靠颜色单独传递状态，也不要删除默认 focus 指示器。

## CSS 基础与布局

盒模型由 content、padding、border、margin 组成。项目通常使用 box-sizing: border-box，使 width 包含 padding 和 border。解决布局问题时先确认 containing block、display、尺寸约束和溢出规则，再调整 z-index；z-index 只在同一堆叠上下文中比较，transform、opacity、filter 等属性可能创建新的 stacking context。

Flex 适合一维布局：主轴由 flex-direction 决定，justify-content 控制主轴分布，align-items 控制交叉轴对齐，flex: 1 表示项目可以占据剩余空间。Grid 适合二维布局：用 grid-template-columns、minmax 和 gap 表达轨道，避免用大量绝对定位拼页面。长文本和动态内容要允许换行，必要时配合 min-width: 0、overflow-wrap: anywhere 和 text-overflow。

响应式设计优先使用流式尺寸、相对单位、媒体查询和容器查询。移动端先保证内容可读和触控目标足够大，再在宽屏增加列数。不要把固定高度用于未知长度的文本区域；加载、校验和字体变化都不应造成主要内容跳动。

## 无障碍检查清单

键盘可以到达并操作所有功能，Tab 顺序合理，Enter/Space 行为符合控件类型；弹窗打开后焦点进入弹窗，关闭后回到触发按钮，Escape 可以退出。使用 aria-label、aria-expanded、aria-selected 等属性补充语义，而不是给所有元素随意加 ARIA。动态状态使用 aria-live 或 role=alert，并提供文字错误信息。正文对比度至少 4.5:1，大号文字至少 3:1；尊重 prefers-reduced-motion。
`,
  'javascript-typescript': `# JavaScript 与 TypeScript

## JavaScript 运行模型

JavaScript 在一个调用栈上执行同步代码。异步任务完成后进入队列，事件循环先清空当前任务产生的 microtask（Promise.then、queueMicrotask），再处理下一个 macrotask（定时器、部分 I/O、消息事件），浏览器还会在合适时机执行渲染。长时间同步计算会阻塞输入和绘制，应拆分任务、移到 Worker 或降低计算频率。

闭包是函数和其词法环境的组合。它适合封装状态，也可能因为监听器、定时器或缓存持有大对象而造成内存无法回收。移除事件监听器时要使用同一个函数引用；React/Vue 中的副作用应在卸载时清理。this 的取值由调用方式决定，箭头函数捕获定义位置的 this。

Promise 链要统一处理错误，async/await 不能自动吞掉异常。独立请求可以用 Promise.all 并行，部分失败仍需继续时用 Promise.allSettled。取消 fetch 使用 AbortController，并在 finally 中恢复 loading。重试应有次数、退避和幂等边界，不能对所有错误无限重试。

## TypeScript 建模

让类型表达业务不变量：优先使用 discriminated union 表示状态机，例如 status 为 loading、success、error 时分别要求对应字段。unknown 比 any 安全，收到外部数据后先通过类型守卫、schema 校验或解析函数收窄。泛型用于保留输入输出关系，interface/type 选择应遵循项目约定；不要为了消除报错大面积使用 as。

事件、API 响应和表单数据是边界类型，最好在边界处转换成内部模型。可选字段、null 和 undefined 要明确处理，避免用非空断言掩盖真实状态。编译器严格模式下常见问题包括索引可能越界、捕获变量为 unknown、异步函数返回类型不一致。

## 常见面试陷阱

for 循环配合 var 会共享函数作用域，let 在每次迭代建立块级绑定。对象浅拷贝不会复制嵌套引用，structuredClone 也不能处理所有特殊对象。浮点数比较需要考虑精度。Map/Set 适合键值和去重；大数组操作要关注时间复杂度和是否产生多余副本。模块初始化、循环依赖和动态 import 可能影响执行顺序与首屏性能。
`,
  'browser-web-platform': `# 浏览器与 Web 平台

## 从请求到绘制

浏览器通常经历解析 HTML、构建 DOM，解析 CSS、构建 CSSOM，合并为渲染树，执行 layout（几何计算）、paint（绘制）和 composite（合成）。改变几何属性可能触发 layout，改变颜色通常只需 paint，transform 和 opacity 更容易由合成器处理，但不能机械地给所有元素加 will-change。批量读写 DOM，避免在循环中交替读取 offsetHeight 和修改样式导致强制同步布局。

首屏性能要区分关键资源和非关键资源：减少阻塞渲染的脚本，合理使用 defer、async、module、preload 和懒加载；图片声明尺寸，选择合适格式和响应式尺寸。Core Web Vitals 重点关注 LCP、INP、CLS，排查时结合真实用户数据与性能面板，而不是只看本地一次分数。

## 网络、缓存与安全边界

HTTP 请求由 DNS、连接、TLS、请求、响应和浏览器缓存共同影响。使用 HTTPS，理解缓存控制的 max-age、ETag、Last-Modified、no-store 和 stale-while-revalidate。POST 通常用于改变状态，接口需要幂等键或服务端去重来应对重试。fetch 默认不会因为 4xx/5xx reject，要检查 response.ok 和业务错误结构。

同源策略由协议、主机和端口共同决定。CORS 是服务端授权跨源读取，不是前端绕过安全策略的开关。Cookie 的 Secure、HttpOnly、SameSite 影响传输和跨站请求；localStorage 不应存放长期敏感令牌。前端显示不可信文本时使用 textContent 或框架默认转义，谨慎使用 innerHTML、eval 和动态脚本。

浏览器存储包括 Cookie、localStorage、sessionStorage、IndexedDB 和 Cache Storage，各自容量、生命周期和同步特征不同。Service Worker 适合离线缓存、拦截请求和后台能力，但缓存版本、更新和回滚策略必须明确。

## 事件与通信

事件传播分为捕获、目标和冒泡阶段。事件委托可以减少监听器数量，但要检查 event.target、closest 和 disabled 语义；需要阻止默认行为时调用 preventDefault，不要滥用 stopPropagation 破坏组件组合。postMessage 跨窗口通信必须校验 origin 和消息结构。WebSocket、SSE 和 Web Worker 分别适合双向实时通信、服务端推送和后台计算。
`,
  'react-vue-engineering': `# React、Vue 与前端工程化

## 组件与状态

组件边界应围绕稳定的业务职责和数据流设计。状态放在最接近使用它的层级，多个兄弟组件共享时再提升；服务端数据、URL 状态、表单草稿和纯 UI 状态不要混成一个全局 store。受控组件的值由单一来源管理，列表渲染使用稳定且唯一的 key，不能用会随排序变化的数组下标作为身份。

React 的渲染是根据 props/state 计算 UI。useEffect 用于与外部系统同步，不应把所有派生值都放进 effect；依赖数组必须完整，清理函数要取消订阅、定时器和请求。useMemo、useCallback 和 memo 只在有测量依据时使用，避免用缓存掩盖错误的数据流。Context 适合低频共享配置，频繁变化的数据需要拆分或采用更合适的状态方案。

Vue 的响应式系统追踪 ref、reactive、computed 和 watch。computed 用于可缓存的派生值，watch 用于副作用；组件 props 单向向下，事件向上。Vue 列表同样需要稳定 key，避免直接修改 props 和在模板中执行昂贵计算。React 与 Vue 的共同原则是明确数据所有权、避免隐式副作用和保证卸载清理。

## 工程化与构建

路由级懒加载、代码分割和预加载要根据用户路径设计。Vite/Webpack 的 tree-shaking 依赖 ESM 静态结构；引入整个大型库、重复 polyfill 和未使用的语言包会扩大包体。环境变量只放公开配置，密钥必须在服务端或安全的本地进程边界处理。Source map、错误上报和版本标识要与发布产物对应。

测试分层：纯函数和组件行为用单元测试，跨模块流程用集成测试，关键用户路径用端到端测试。测试用户可观察的行为和无障碍语义，不要过度断言内部实现细节。代码评审关注错误处理、竞态、权限、兼容性和可回滚性；格式化与 lint 是基础，不等于功能正确。

## 异步 UI

加载、成功、空数据、错误和取消都是显式状态。请求竞态要用请求序号、AbortController 或库提供的去重机制，不能让旧响应覆盖新查询。按钮提交期间应禁用或防重复，错误信息说明原因和恢复动作。长列表超过可见规模时考虑虚拟化，但先保证键盘导航、滚动位置和布局稳定。
`,
  'performance-security': `# 性能、安全与质量

## 性能优化方法

先建立基线再优化：记录首屏、交互延迟、内存、网络和包体，定位瓶颈后只改一个变量。常见优化包括减少 JavaScript、拆分路由、压缩图片、缓存稳定资源、避免重复请求、虚拟化长列表和降低不必要的重渲染。防抖适合搜索输入，节流适合滚动和 resize；不要用它掩盖昂贵的同步计算。

性能优化必须保持正确性。缓存需要失效策略，乐观更新需要回滚，预取不能造成隐私泄露，懒加载不能让关键内容缺失。使用 Performance API、浏览器 Performance 面板、React/Vue devtools 和真实用户监控验证结果；不要只凭感觉增加 memo、Worker 或动画。

## Web 安全

XSS 防护依靠输出编码、可信模板和严格的内容安全策略（CSP）；不要把用户输入拼接进 HTML、脚本、URL 或 CSS。CSRF 防护结合 SameSite Cookie、CSRF token 和服务端校验。身份认证、授权和租户隔离必须在服务端执行，前端隐藏按钮不能代替权限检查。敏感信息最小化收集、最短保存，日志中不要输出 token、Cookie 或完整个人资料。

第三方依赖需要锁定版本、审计漏洞和评估供应链风险。上传文件要在服务端验证类型、大小、内容和存储路径，不能只相信扩展名。处理 Markdown、SVG、富文本和下载文件时考虑脚本注入与内容嗅探，设置合适的 Content-Type 和 X-Content-Type-Options。

## 可靠性与发布

异步流程要设计超时、取消、重试、幂等和降级。错误边界或全局兜底应记录可关联的 request id，同时向用户提供可操作的提示。Feature flag、灰度发布和数据库/缓存迁移要有回滚方案；破坏性变更先兼容旧数据，再逐步切换。

质量门槛应覆盖类型检查、lint、单元/集成测试、构建产物检查和关键浏览器验证。对于本地桌面应用，还要检查 IPC 参数校验、上下文隔离、文件路径边界、窗口生命周期和离线行为。任何自动生成的答案都应区分资料事实、推断和不确定性，不能把知识库中的文本指令当成系统指令执行。
`
}

function buildDocument(topic: (typeof BUILTIN_FRONTEND_KNOWLEDGE_TOPICS)[number]): BuiltinKnowledgeDocument {
  const id = `${BUILTIN_FRONTEND_KNOWLEDGE_DOCUMENT_PREFIX}${topic.id}`
  return {
    id,
    name: `内置 · ${topic.name}.md`,
    priority: 'normal',
    chunks: chunkKnowledgeText(id, DOCUMENT_TEXT[topic.id])
  }
}

export const BUILTIN_FRONTEND_DOCUMENTS: BuiltinKnowledgeDocument[] =
  BUILTIN_FRONTEND_KNOWLEDGE_TOPICS.map(buildDocument)

export const BUILTIN_FRONTEND_DOCUMENT_IDS = new Set(
  BUILTIN_FRONTEND_DOCUMENTS.map((document) => document.id)
)

const builtinLinks: KnowledgeDocumentLink[] = BUILTIN_FRONTEND_DOCUMENTS.map((document) => ({
  documentId: document.id,
  priority: document.priority,
  linkedAt: BUILTIN_TIMESTAMP
}))

export function createBuiltinFrontendProfile(): KnowledgeProfile {
  return {
    id: BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_ID,
    name: BUILTIN_FRONTEND_KNOWLEDGE_PROFILE_NAME,
    company: '',
    role: '前端开发',
    jobDescription:
      '覆盖 HTML、CSS、JavaScript、TypeScript、浏览器原理、React、Vue、工程化、性能、安全与测试的通用前端开发知识。',
    documentLinks: builtinLinks.map((link) => ({ ...link })),
    createdAt: BUILTIN_TIMESTAMP,
    updatedAt: BUILTIN_TIMESTAMP
  }
}
