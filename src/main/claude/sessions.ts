import { readdir, readFile, stat } from 'fs/promises'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { SessionHistoryItem } from '@shared/types'

/**
 * 会话历史列表：CLI 没有列会话的命令，这里只读取
 * ~/.claude/projects/<编码目录>/*.jsonl 的头部元数据（只读，不修改任何状态）。
 * 恢复会话本身仍通过 `claude --resume <id>` 命令完成。
 */
export async function listSessionHistory(): Promise<SessionHistoryItem[]> {
  const root = join(homedir(), '.claude', 'projects')
  let projectDirs: string[]
  try {
    projectDirs = await readdir(root)
  } catch {
    return []
  }

  const items: SessionHistoryItem[] = []
  for (const dir of projectDirs) {
    const dirPath = join(root, dir)
    let files: string[]
    try {
      files = await readdir(dirPath)
    } catch {
      continue
    }
    for (const f of files) {
      if (!f.endsWith('.jsonl')) continue
      const filePath = join(dirPath, f)
      try {
        const item = await summarizeSessionFile(filePath, dir)
        if (item) items.push(item)
      } catch {
        // 损坏的会话文件直接跳过
      }
    }
  }

  items.sort((a, b) => b.lastModified - a.lastModified)
  return items
}

/** 读文件前 ~64KB，提取 sessionId / cwd / 首条用户消息 / 消息数 */
async function summarizeSessionFile(filePath: string, projectDir: string): Promise<SessionHistoryItem | null> {
  const info = await stat(filePath)
  const handle = await (await import('fs/promises')).open(filePath, 'r')
  try {
    const size = Math.min(info.size, 65536)
    const buf = Buffer.alloc(size)
    await handle.read(buf, 0, size, 0)
    const text = buf.toString('utf8')

    let sessionId = ''
    let cwd = ''
    let title = ''
    let createdAt = info.birthtimeMs || info.mtimeMs
    let messageCount = 0
    let lastCost: number | undefined

    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      let obj: any
      try {
        obj = JSON.parse(line)
      } catch {
        continue
      }
      messageCount++
      if (!sessionId && obj.sessionId) sessionId = obj.sessionId
      if (!sessionId && obj.session_id) sessionId = obj.session_id
      if (!cwd && obj.cwd) cwd = obj.cwd
      if (obj.timestamp && messageCount <= 2) {
        const t = Date.parse(obj.timestamp)
        if (!Number.isNaN(t)) createdAt = Math.min(createdAt, t)
      }
      if (!title && obj.type === 'user' && obj.message?.content) {
        const c = obj.message.content
        if (typeof c === 'string') {
          title = c
        } else if (Array.isArray(c)) {
          const txt = c.find((b: any) => b.type === 'text' && b.text)
          if (txt) title = txt.text
        }
      }
      if (typeof obj.costUSD === 'number') lastCost = obj.costUSD
    }

    if (!sessionId) sessionId = basename(filePath, '.jsonl')
    return {
      sessionId,
      title: title.replace(/\s+/g, ' ').slice(0, 120) || '(无标题会话)',
      cwd: cwd || projectDir,
      projectDir,
      filePath,
      lastModified: info.mtimeMs,
      createdAt,
      messageCount,
      lastCostUsd: lastCost
    }
  } finally {
    await handle.close()
  }
}
