import { readFile, writeFile } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { existsSync } from 'fs'
import { runClaudeCommand } from './command'

const USER_SETTINGS = join(homedir(), '.claude', 'settings.json')
const APP_SETTINGS = join(homedir(), '.claude', 'claude-desktop-settings.json')

/** ~/.claude/settings.json 的查看与编辑（Claude Code 的全局配置） */
export const configApi = {
  async readUserSettings(): Promise<string> {
    try {
      return await readFile(USER_SETTINGS, 'utf8')
    } catch {
      return '{}'
    }
  },

  async writeUserSettings(content: string): Promise<{ ok: boolean; error?: string }> {
    try {
      JSON.parse(content) // 校验 JSON 合法
    } catch (e) {
      return { ok: false, error: `JSON 解析失败: ${(e as Error).message}` }
    }
    await writeFile(USER_SETTINGS, content, 'utf8')
    return { ok: true }
  },

  /** GUI 应用自身设置 */
  async readAppSettings(): Promise<Record<string, unknown>> {
    try {
      if (existsSync(APP_SETTINGS)) return JSON.parse(await readFile(APP_SETTINGS, 'utf8'))
    } catch {}
    return {}
  },

  async writeAppSettings(settings: Record<string, unknown>): Promise<void> {
    await writeFile(APP_SETTINGS, JSON.stringify(settings, null, 2), 'utf8')
  },

  /** 健康检查：claude --version 与 claude doctor */
  async healthCheck(): Promise<{ version: string; doctor: string }> {
    const v = await runClaudeCommand(['--version'], { timeoutMs: 20000 })
    const d = await runClaudeCommand(['doctor'], { timeoutMs: 60000 })
    return {
      version: v.stdout.trim() || v.stderr.trim() || '(未检测到)',
      doctor: d.stdout + (d.stderr ? `\n${d.stderr}` : '')
    }
  }
}
