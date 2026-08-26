import { readFile } from 'fs/promises'
import type { SessionHistoryItem } from '@shared/types'

export interface TranscriptMessage {
  role: 'user' | 'assistant'
  text?: string
  thinking?: string
  tools: Array<{
    id: string
    name: string
    input?: Record<string, unknown>
    status: 'running' | 'done' | 'error'
    result?: string
  }>
  model?: string
}

/**
 * 读取一个会话 JSONL 文件，重建可在 GUI 展示的对话记录（只读操作）。
 * type=user 且 content 含 tool_result 的行是工具结果（跳过），
 * type=user 的纯文本行是真实用户输入。
 */
export async function readSessionTranscript(filePath: string): Promise<TranscriptMessage[]> {
  const raw = await readFile(filePath, 'utf8')
  const out: TranscriptMessage[] = []
  let msgSeq = 0

  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }

    if (obj.type === 'user' && obj.message?.content) {
      const c = obj.message.content
      let text = ''
      if (typeof c === 'string') {
        text = c
      } else if (Array.isArray(c)) {
        const blocks = c as Array<Record<string, unknown>>
        // 包含 tool_result 的是工具结果行，不是用户输入
        if (blocks.some((b) => b.type === 'tool_result')) continue
        text = blocks.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('')
      }
      if (text.trim()) {
        out.push({ role: 'user', text, tools: [] })
      }
    } else if (obj.type === 'assistant' && obj.message?.content) {
      const blocks = obj.message.content as Array<Record<string, unknown>>
      const text = blocks.filter((b) => b.type === 'text').map((b) => String(b.text ?? '')).join('')
      const thinking = String(blocks.find((b) => b.type === 'thinking')?.thinking ?? '')
      const tools = blocks
        .filter((b) => b.type === 'tool_use')
        .map((b) => ({
          id: String(b.id ?? `t${msgSeq++}`),
          name: String(b.name ?? 'unknown'),
          input: b.input as Record<string, unknown> | undefined,
          status: 'done' as const
        }))
      if (text.trim() || thinking.trim() || tools.length) {
        out.push({ role: 'assistant', text: text || undefined, thinking: thinking || undefined, tools, model: obj.message?.model })
      }
    }
  }

  // 工具结果回填
  for (const line of raw.split('\n')) {
    if (!line.trim()) continue
    let obj: any
    try {
      obj = JSON.parse(line)
    } catch {
      continue
    }
    if (obj.type !== 'user' || !Array.isArray(obj.message?.content)) continue
    for (const b of obj.message.content as Array<Record<string, unknown>>) {
      if (b.type !== 'tool_result') continue
      const tid = String(b.tool_use_id ?? '')
      let text = ''
      const inner = b.content
      if (typeof inner === 'string') text = inner
      else if (Array.isArray(inner)) {
        text = inner.map((x: Record<string, unknown>) => String((x as any).text ?? '')).join('')
      }
      outer: for (const m of out) {
        for (const t of m.tools) {
          if (t.id === tid) {
            t.result = text
            t.status = b.is_error ? 'error' : 'done'
            break outer
          }
        }
      }
    }
  }

  return out.slice(-200) // 最多展示最近 200 条，防止超大会话卡 UI
}
