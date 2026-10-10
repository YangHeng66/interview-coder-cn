import { readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * setContentProtection only blanks pixels drawn by our own windows. Anything the
 * OS draws on our behalf — native tooltips, native popups/pickers, dialogs,
 * notifications, extra windows — is captured by screen sharing. These rules
 * keep such surfaces out of the codebase.
 */

type Rule = { name: string; pattern: RegExp }

/** Components whose `title` prop is rendered as content, not as a DOM attribute */
const TITLE_PROP_COMPONENTS = new Set(['HelpSection'])

const RENDERER_RULES: Rule[] = [
  { name: '原生 <select>（系统绘制下拉层）', pattern: /<select\b/g },
  { name: '原生 <datalist>（系统绘制下拉层）', pattern: /<datalist\b/g },
  {
    name: '原生日期/颜色/文件选择器 input',
    pattern: /\btype=["'](?:date|time|datetime-local|month|week|color|file)["']/g
  },
  { name: 'File System Access 原生选择器', pattern: /\bshow(?:Open|Save|Directory)\w*Picker\(/g },
  {
    name: 'alert/confirm/prompt 原生对话框',
    pattern: /(?<![\w.])(?:window\.)?(?:alert|confirm|prompt)\s*\(/g
  },
  { name: 'window.open 新窗口', pattern: /\bwindow\.open\s*\(/g },
  { name: '系统通知', pattern: /\bnew\s+Notification\s*\(/g }
]

const MAIN_RULES: Rule[] = [
  { name: '原生 dialog', pattern: /\bdialog\.show\w*/g },
  { name: '原生菜单', pattern: /\bMenu\.(?:buildFromTemplate|setApplicationMenu)\b|\.popup\s*\(/g },
  { name: '系统托盘', pattern: /\bnew\s+Tray\s*\(/g },
  { name: '系统通知', pattern: /\bnew\s+Notification\s*\(/g }
]

function lineOf(source: string, index: number): number {
  return source.slice(0, index).split('\n').length
}

function findRuleViolations(source: string, rules: Rule[]): string[] {
  return rules.flatMap(({ name, pattern }) =>
    [...source.matchAll(pattern)].map((match) => `${name} @L${lineOf(source, match.index)}`)
  )
}

/** A JSX `title=` on a DOM element or UI primitive becomes a native OS tooltip */
function findTitleAttributes(source: string): string[] {
  return [...source.matchAll(/\stitle=[{"']/g)].flatMap((match) => {
    const before = source.slice(0, match.index)
    const tag = /<([A-Za-z][\w.]*)[^<]*$/.exec(before)?.[1]
    if (tag && TITLE_PROP_COMPONENTS.has(tag)) return []
    return [`title 属性（原生 tooltip）<${tag ?? '?'}> @L${lineOf(source, match.index)}`]
  })
}

function findUnprotectedWindows(source: string): string[] {
  if (!/\bnew\s+BrowserWindow\s*\(/.test(source)) return []
  const problems: string[] = []
  if (!/\b(?:setContentProtection|applyContentProtection)\s*\(/.test(source)) {
    problems.push('创建 BrowserWindow 但未设置 content protection')
  }
  if (!/\btitle:\s*''/.test(source)) {
    problems.push("创建 BrowserWindow 但未设置空标题 title: ''（会出现在共享窗口列表）")
  }
  return problems
}

function listSourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    if (!/\.(?:tsx?|jsx?)$/.test(entry.name) || /\.test\.tsx?$/.test(entry.name)) return []
    return [path]
  })
}

function scan(dir: string, check: (source: string) => string[]): string[] {
  return listSourceFiles(dir).flatMap((file) =>
    check(readFileSync(file, 'utf8')).map(
      (problem) => `${relative(process.cwd(), file)}: ${problem}`
    )
  )
}

const rendererCheck = (source: string): string[] => [
  ...findRuleViolations(source, RENDERER_RULES),
  ...findTitleAttributes(source)
]
const mainCheck = (source: string): string[] => [
  ...findRuleViolations(source, MAIN_RULES),
  ...findUnprotectedWindows(source)
]

describe('防录屏护栏规则本身', () => {
  it('能识别会被录屏捕获的渲染层写法', () => {
    const leaky = [
      '<button title="设置" />',
      '<Button title={label} />',
      '<select value={x} />',
      '<input list="a" /><datalist id="a" />',
      '<input type="color" />',
      '<input type="file" />',
      'window.alert("x")',
      'confirm("确定？")',
      'window.open(url)',
      'new Notification("x")',
      'await showOpenFilePicker()'
    ]
    for (const snippet of leaky) expect(rendererCheck(snippet), snippet).not.toHaveLength(0)
  })

  it('不误伤安全写法', () => {
    const safe = [
      '<HelpSection Icon={Info} title="简介">',
      '<button aria-label="设置" />',
      '<button data-tooltip="设置" />',
      'buildPrompt(scene)',
      'store.prompt(text)',
      '<input type="text" />'
    ]
    for (const snippet of safe) expect(rendererCheck(snippet), snippet).toEqual([])
  })

  it('能识别未受保护的窗口和原生弹层', () => {
    expect(mainCheck("new BrowserWindow({ title: '' })")).not.toHaveLength(0)
    expect(mainCheck('new BrowserWindow({}); win.setContentProtection(true)')).not.toHaveLength(0)
    expect(mainCheck("new BrowserWindow({ title: '' }); applyContentProtection(win)")).toEqual([])
    expect(mainCheck('dialog.showOpenDialog(win)')).not.toHaveLength(0)
    expect(mainCheck('Menu.buildFromTemplate([])')).not.toHaveLength(0)
  })
})

describe('防录屏护栏：源码扫描', () => {
  it('渲染层不使用系统绘制的弹层或原生 tooltip', () => {
    expect(scan(join(process.cwd(), 'src/renderer/src'), rendererCheck)).toEqual([])
  })

  it('主进程窗口全部受保护且不弹原生 UI', () => {
    expect(scan(join(process.cwd(), 'src/main'), mainCheck)).toEqual([])
  })
})
