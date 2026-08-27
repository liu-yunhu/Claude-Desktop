import { readdir, stat, open, appendFile } from 'fs/promises'
import { join, basename } from 'path'
import { homedir } from 'os'
import type { SessionHistoryItem } from '@shared/types'

/**
 * 会话历史列表：CLI 没有列会话的命令，这里只读取
 * ~/.claude/projects/<编码目录>/*.jsonl 的元数据（只读）。
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

/**
 * 重命名会话：向会话 JSONL 追加一行 custom-title。
 * 这是 CLI 的 /rename 与 --name 底层的同一存储机制（已验证二者均写入
 * `{"type":"custom-title","customTitle":...}` 行，且最新一条生效），
 * 因此终端 claude、VS Code 插件、/resume picker 均能识别，且无需消耗 API token。
 */
export async function renameSession(
  filePath: string,
  sessionId: string,
  newName: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const line = JSON.stringify({ type: 'custom-title', customTitle: newName, sessionId })
    // JSONL 每行一条记录；追加前确保独立成行（空行会被各读取方跳过，无害）
    await appendFile(filePath, '\n' + line + '\n', 'utf8')
    return { ok: true }
  } catch (e) {
    return { ok: false, error: `写入会话文件失败: ${(e as Error).message}` }
  }
}

/** 读文件头部 64KB + 尾部 16KB，提取元数据。title 优先取最新的 custom-title。 */
async function summarizeSessionFile(filePath: string, projectDir: string): Promise<SessionHistoryItem | null> {
  const info = await stat(filePath)
  const handle = await open(filePath, 'r')
  try {
    const headSize = Math.min(info.size, 65536)
    const head = Buffer.alloc(headSize)
    await handle.read(head, 0, headSize, 0)

    // 尾部 16KB 用于读取最新的 custom-title（重命名/--name 追加在文件末尾）
    const tailSize = Math.min(info.size, 16384)
    const tail = Buffer.alloc(tailSize)
    if (info.size > 0) await handle.read(tail, 0, tailSize, info.size - tailSize)

    let sessionId = ''
    let cwd = ''
    let fallbackTitle = ''
    let customTitle = ''
    let createdAt = info.birthtimeMs || info.mtimeMs
    let messageCount = 0
    let lastCost: number | undefined

    // 头部：sessionId / cwd / createdAt / 首条用户消息 / 消息数 / 早期 custom-title
    for (const line of head.toString('utf8').split('\n')) {
      const picked = pick(line)
      if (!picked) continue
      const obj = picked
      messageCount++
      if (!sessionId) sessionId = obj.sessionId ?? obj.session_id ?? ''
      if (!cwd && obj.cwd) cwd = obj.cwd
      if (!fallbackTitle && obj.type === 'user' && obj.message?.content) {
        fallbackTitle = extractUserText(obj.message.content)
      }
      if (obj.type === 'custom-title' && obj.customTitle) customTitle = obj.customTitle
      if (typeof obj.costUSD === 'number') lastCost = obj.costUSD
    }

    // 尾部：以最后的 custom-title 为准（重命名追加在此）
    for (const line of tail.toString('utf8').split('\n')) {
      const obj = pick(line)
      if (obj && obj.type === 'custom-title' && obj.customTitle) customTitle = obj.customTitle
    }

    if (!sessionId) sessionId = basename(filePath, '.jsonl')
    const title = (customTitle || fallbackTitle).replace(/\s+/g, ' ').slice(0, 120)
    return {
      sessionId,
      title: title || '(无标题会话)',
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

function pick(line: string): any | null {
  if (!line.trim()) return null
  try {
    return JSON.parse(line)
  } catch {
    return null
  }
}

function extractUserText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const txt = content.find((b: any) => b.type === 'text' && b.text)
    if (txt) return txt.text
  }
  return ''
}
