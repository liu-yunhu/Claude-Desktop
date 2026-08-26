import { runClaudeCommand } from './command'

/** MCP 服务器管理：全部通过 `claude mcp ...` 命令实现 */
export const mcpApi = {
  async list(cwd?: string) {
    const r = await runClaudeCommand(['mcp', 'list'], { cwd, timeoutMs: 60000 })
    return { ok: r.code === 0, output: r.stdout + (r.stderr ? `\n${r.stderr}` : '') }
  },

  async get(name: string, cwd?: string) {
    const r = await runClaudeCommand(['mcp', 'get', name], { cwd, timeoutMs: 30000 })
    return { ok: r.code === 0, output: r.stdout + (r.stderr ? `\n${r.stderr}` : '') }
  },

  async add(args: {
    name: string
    transport: 'stdio' | 'sse' | 'http'
    command?: string
    url?: string
    args?: string[]
    scope?: 'local' | 'project' | 'user'
    env?: Record<string, string>
    cwd?: string
  }) {
    const cmd = ['mcp', 'add', '--transport', args.transport]
    if (args.scope) cmd.push('--scope', args.scope)
    if (args.transport === 'stdio') {
      cmd.push('--', args.name, args.command || '', ...(args.args || []))
    } else {
      cmd.push(args.name, args.url || '')
    }
    if (args.env && Object.keys(args.env).length) {
      // -e KEY=VALUE 必须在 -- 之前
      const envFlags: string[] = []
      for (const [k, v] of Object.entries(args.env)) envFlags.push('-e', `${k}=${v}`)
      const idx = cmd.indexOf(args.transport === 'stdio' ? '--' : args.name)
      cmd.splice(idx, 0, ...envFlags)
    }
    const r = await runClaudeCommand(cmd, { cwd: args.cwd, timeoutMs: 30000 })
    return { ok: r.code === 0, output: r.stdout + (r.stderr ? `\n${r.stderr}` : '') }
  },

  async remove(name: string, cwd?: string) {
    const r = await runClaudeCommand(['mcp', 'remove', name], { cwd, timeoutMs: 30000 })
    return { ok: r.code === 0, output: r.stdout + (r.stderr ? `\n${r.stderr}` : '') }
  }
}
