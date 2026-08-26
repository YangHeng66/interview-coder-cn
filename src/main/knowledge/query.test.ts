import { describe, expect, it } from 'vitest'
import { buildKnowledgeQueryRewritePrompt, normalizeKnowledgeQueryExpansion } from './query'

describe('knowledge query rewriting', () => {
  it('includes recent conversation so follow-up references can be resolved', () => {
    const prompt = buildKnowledgeQueryRewritePrompt(
      '它怎么避免重复提交？',
      '用户：语音链路怎么实现？\n助手：识别结果会写入转录缓冲区。'
    )

    expect(prompt).toContain('最近对话')
    expect(prompt).toContain('语音链路怎么实现')
    expect(prompt).toContain('当前问题：\n它怎么避免重复提交？')
  })

  it('normalizes plain-text model output into local search text', () => {
    const expansion = normalizeKnowledgeQueryExpansion(`\`\`\`text
QUERY: Electron AI 项目的实时语音转录链路如何实现
TERMS: 音频采集 PCM 16kHz IPC WebSocket ASR partial final TranscriptionBuffer
\`\`\``)

    expect(expansion).toBe(
      'Electron AI 项目的实时语音转录链路如何实现\n音频采集 PCM 16kHz IPC WebSocket ASR partial final TranscriptionBuffer'
    )
  })
})
