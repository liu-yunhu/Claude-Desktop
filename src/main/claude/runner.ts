import { spawn, ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import type { ClaudeStreamEvent, SessionOptions, PermissionRequestInfo } from '@shared/types'

/**
 * SessionRunner：每个聊天标签页对应一个 Runner。
 * 每条用户消息 spawn 一个 `claude -p` 子进程，prompt 经 stdin 以 stream-json 传入
 * （不走 argv，规避 Windows shell 转义与注入问题）。
 *
 * 启用 `--permission-prompt-tool stdio` 后，CLI 遇到需要人工授权的工具会通过
 * stdout 发送 control_request(can_use_tool)，本类转发给宿主，并把用户在 GUI 的
 * 选择以 control_response 写回 stdin（协议与官方 Agent SDK 内部实现一致）。
 */
export class SessionRunner {
  private child: ChildProcess | null = null
  /** 等待 GUI 决策的授权请求 */
  private pendingPerms = new Map<string, PermissionRequestInfo>()
  private initSeq = 0

  constructor(
    public readonly tabId: string,
    private onEvent: (tabId: string, event: ClaudeStreamEvent) => void,
    private onExit: (tabId: string, code: number | null, err?: string) => void,
    private onPermissionRequest: (info: PermissionRequestInfo & { tabId: string }) => void,
    private onPermissionCancel: (requestId: string) => void
  ) {}

  get running(): boolean {
    return !!this.child && !this.killed
  }

  get pendingCount(): number {
    return this.pendingPerms.size
  }

  private killed = false

  /** 组装 claude 命令参数。所有动态内容要么走 stdin，要么经过 quote() */
  static buildArgs(opts: SessionOptions): string[] {
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--input-format',
      'stream-json',
      // 启用人机授权通道：CLI 把权限询问作为 control_request 发到 stdout
      '--permission-prompt-tool',
      'stdio',
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
      for (const [id] of this.pendingPerms) this.onPermissionCancel(id)
      this.pendingPerms.clear()
      this.onExit(this.tabId, code, code !== 0 && code !== null ? stderrTail || undefined : undefined)
    })

    // 控制通道握手（SDK 同款初始化），随后写入用户消息；stdin 保持打开以便回写授权应答
    child.stdin!.write(
      JSON.stringify({ type: 'control_request', request_id: `init-${++this.initSeq}`, request: { subtype: 'initialize' } }) + '\n'
    )
    child.stdin!.write(
      JSON.stringify({
        type: 'user',
        message: { role: 'user', content: [{ type: 'text', text: prompt }] }
      }) + '\n'
    )
  }

  /** GUI 对一次授权请求的决策，写回控制协议。updatedInput 用于 AskUserQuestion 等需要回填用户输入的工具 */
  respondPermission(requestId: string, allow: boolean, denyMessage?: string, updatedInput?: Record<string, unknown>): boolean {
    const pending = this.pendingPerms.get(requestId)
    if (!pending || !this.child) return false
    this.pendingPerms.delete(requestId)
    this.writeStdin(
      JSON.stringify({
        type: 'control_response',
        response: {
          subtype: 'success',
          request_id: requestId,
          response: allow
            ? { behavior: 'allow', updatedInput: updatedInput ?? pending.input }
            : { behavior: 'deny', message: denyMessage || '用户在 Claude Desktop 中拒绝了此操作' }
        }
      })
    )
    return true
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

  private writeStdin(line: string): void {
    try {
      this.child?.stdin?.write(line + '\n')
    } catch {
      // 进程已退出时写 stdin 失败可安全忽略
    }
  }

  private handleLine(line: string): void {
    const trimmed = line.trim()
    if (!trimmed) return
    let ev: ClaudeStreamEvent & { request_id?: string; request?: Record<string, unknown> }
    try {
      ev = JSON.parse(trimmed)
    } catch {
      // 非 JSON 行（如警告），包成事件透传给 UI 显示
      this.onEvent(this.tabId, { type: 'gui-raw', result: trimmed })
      return
    }

    // 控制协议：CLI 权限询问 → 转发 GUI
    if (ev.type === 'control_request') {
      const req = ev.request as Record<string, unknown> | undefined
      if (req && req.subtype === 'can_use_tool') {
        const requestId = String(ev.request_id ?? '')
        if (requestId) {
          const info = {
            requestId,
            tabId: this.tabId,
            toolName: String(req.tool_name ?? 'unknown'),
            input: (req.input ?? {}) as Record<string, unknown>,
            title: typeof req.title === 'string' ? req.title : undefined,
            description: typeof req.description === 'string' ? req.description : undefined
          }
          this.pendingPerms.set(requestId, info)
          this.onPermissionRequest(info)
        }
      }
      return
    }
    if (ev.type === 'control_cancel_request') {
      const requestId = String(ev.request_id ?? '')
      if (this.pendingPerms.delete(requestId)) this.onPermissionCancel(requestId)
      return
    }
    if (ev.type === 'control_response') return // initialize 应答等，忽略

    if (ev.type === 'result') {
      // result 是本轮最后事件。-p 进程在 stdin 关闭前不会自行退出（保持打开会泄漏进程、
      // 挡住下一次 send），收到 result 后关闭 stdin 让进程收尾退出，close 时自然释放槽位
      try {
        this.child?.stdin?.end()
      } catch {
        // 进程已退出时忽略
      }
    }

    this.onEvent(this.tabId, ev as ClaudeStreamEvent)
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
    private onExit: (tabId: string, code: number | null, err?: string) => void,
    private onPermissionRequest: (info: PermissionRequestInfo & { tabId: string }) => void,
    private onPermissionCancel: (requestId: string) => void
  ) {}

  get(tabId: string): SessionRunner | undefined {
    return this.runners.get(tabId)
  }

  ensure(tabId: string): SessionRunner {
    let r = this.runners.get(tabId)
    if (!r) {
      r = new SessionRunner(tabId, this.onEvent, this.onExit, this.onPermissionRequest, this.onPermissionCancel)
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
