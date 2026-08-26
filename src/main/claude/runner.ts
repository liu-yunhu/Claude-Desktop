import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import type { ClaudeStreamEvent, SessionOptions } from '@shared/types'

/**
 * SessionRunner：每个聊天标签页对应一个 Runner。
 * 每条用户消息 spawn 一个 `claude -p --output-format stream-json` 子进程，
 * prompt 通过 stdin 传入（不走 argv，规避 Windows shell 转义与注入问题）。
 */
export class SessionRunner {
  private child: ChildProcess | null = null

  constructor(
    public readonly tabId: string,
    private onEvent: (tabId: string, event: ClaudeStreamEvent) => void,
    private onExit: (tabId: string, code: number | null, err?: string) => void
  ) {}

  get running(): boolean {
    return !!this.child && !this.killed
  }

  private killed = false

  /** 组装 claude 命令参数。所有动态内容要么走 stdin，要么经过 quote() */
  static buildArgs(opts: SessionOptions): string[] {
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages'
    ]
    if (opts.resumeSessionId) {
      args.push('--resume', opts.resumeSessionId)
    } else if (opts.sessionId) {
      args.push('--session-id', opts.sessionId)
    }
    if (opts.model) args.push('--model', opts.model)
    if (opts.effort) args.push('--effort', opts.effort)
    if (opts.permissionMode) args.push('--permission-mode', opts.permissionMode)
    if (opts.allowedTools?.length) args.push('--allowedTools', ...opts.allowedTools)
    if (opts.disallowedTools?.length) args.push('--disallowedTools', ...opts.disallowedTools)
    if (opts.addDirs?.length) {
      for (const d of opts.addDirs) args.push('--add-dir', d)
    }
    if (opts.maxBudgetUsd && opts.maxBudgetUsd > 0) {
      args.push('--max-budget-usd', String(opts.maxBudgetUsd))
    }
    if (opts.dangerouslySkipPermissions) args.push('--dangerously-skip-permissions')
    if (opts.mcpConfig) args.push('--mcp-config', opts.mcpConfig)
    if (opts.name) args.push('--name', opts.name)
    return args
  }

  /**
   * 发送一条用户消息并启动一个 claude 进程。
   * 进程退出后调用方从 result 事件中提取 session_id 用于下一条 --resume。
   */
  send(prompt: string, opts: SessionOptions): void {
    if (this.child) {
      this.onEvent(this.tabId, {
        type: 'gui-error',
        result: '当前标签页已有正在运行的 claude 进程，请先停止或等待完成'
      })
      return
    }
    this.killed = false
    const args = SessionRunner.buildArgs(opts)
    // Windows 上 claude 是 .cmd shim，必须经 shell 启动；
    // 参数均为固定/白名单值，用户内容只走 stdin，无注入风险
    const full = ['claude', ...args.map((a) => SessionRunner.quote(a))].join(' ')
    const child = (this.child = spawn(full, {
      shell: true,
      cwd: opts.workDir,
      env: { ...process.env, FORCE_COLOR: '0' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe']
    }))

    child.stdout!.setEncoding('utf8')
    child.stderr!.setEncoding('utf8')

    const rl = createInterface({ input: child.stdout! })
    rl.on('line', (line) => this.handleLine(line))

    let stderrTail = ''
    child.stderr!.on('data', (d: Buffer) => {
      stderrTail = (stderrTail + d.toString('utf8')).slice(-4000)
    })

    child.on('error', (err) => {
      this.onExit(this.tabId, null, `无法启动 claude 进程: ${err.message}`)
      this.child = null
    })

    child.on('close', (code) => {
      this.child = null
      this.onExit(this.tabId, code, code !== 0 && code !== null ? stderrTail || undefined : undefined)
    })

    // prompt 走 stdin
    child.stdin!.write(prompt)
    child.stdin!.end()
  }

  /** 终止当前进程（停止生成） */
  kill(): boolean {
    if (!this.child) return false
    this.killed = true
    // shell:true 时 kill 只杀 cmd 壳，需要 /T 杀进程树
    if (process.platform === 'win32' && this.child.pid) {
      spawn('taskkill', ['/PID', String(this.child.pid), '/T', '/F'], { windowsHide: true })
    } else {
      this.child.kill('SIGTERM')
    }
    return true
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      const ev = JSON.parse(trimmed) as ClaudeStreamEvent
      this.onEvent(this.tabId, ev)
    } catch {
      // 非 JSON 行（如警告），包成事件透传给 UI 显示
      this.onEvent(this.tabId, { type: 'gui-raw', result: trimmed })
    }
  }

  /** 仅对可能含空格的值加引号 */
  private static quote(v: string): string {
    return /^[\w.,:\/\\@#%^=+-]+$/.test(v) ? v : `"${v.replace(/"/g, '""')}"`
  }
}

/** 所有活跃标签页的 Runner 注册表 */
export class RunnerRegistry {
  private runners = new Map<string, SessionRunner>()

  constructor(
    private onEvent: (tabId: string, event: ClaudeStreamEvent) => void,
    private onExit: (tabId: string, code: number | null, err?: string) => void
  ) {}

  get(tabId: string): SessionRunner | undefined {
    return this.runners.get(tabId)
  }

  ensure(tabId: string): SessionRunner {
    let r = this.runners.get(tabId)
    if (!r) {
      r = new SessionRunner(tabId, this.onEvent, this.onExit)
      this.runners.set(tabId, r)
    }
    return r
  }

  remove(tabId: string): void {
    this.runners.get(tabId)?.kill()
    this.runners.delete(tabId)
  }

  killAll(): void {
    for (const r of this.runners.values()) r.kill()
    this.runners.clear()
  }
}
