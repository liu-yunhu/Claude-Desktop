// 主进程 <-> 渲染进程共享的类型定义

/** claude -p --output-format stream-json 输出的原始事件（只声明用到的部分） */
export interface ClaudeStreamEvent {
  type: string
  subtype?: string
  session_id?: string
  uuid?: string
  // system/init
  cwd?: string
  tools?: string[]
  model?: string
  // stream_event（--include-partial-messages）
  event?: {
    type: string
    index?: number
    delta?: {
      type?: string
      thinking?: string
      text?: string
      partial_json?: string
      stop_reason?: string | null
    }
    content_block?: { type: string; id?: string; name?: string; text?: string }
    message?: { usage?: Record<string, number> }
  }
  // assistant / user
  message?: {
    id?: string
    role?: string
    model?: string
    content: Array<{
      type: string
      id?: string
      name?: string
      text?: string
      thinking?: string
      input?: unknown
      content?: Array<{ type: string; text?: string } | { type: string }>
      tool_use_id?: string
      is_error?: boolean
    }>
  }
  parent_tool_use_id?: string | null
  // result
  result?: string
  total_cost_usd?: number
  duration_ms?: number
  duration_api_ms?: number
  num_turns?: number
  usage?: Record<string, number>
  permission_denials?: unknown[]
  is_error?: boolean
  subtype_error?: string
  // system/thinking_tokens
  estimated_tokens?: number
}

/** GUI 授权框所需的一次工具授权请求信息（对应控制协议的 can_use_tool） */
export interface PermissionRequestInfo {
  requestId: string
  toolName: string
  input: Record<string, unknown>
  /** CLI 生成的完整提示句（如 "Claude wants to run…"），优先展示 */
  title?: string
  description?: string
}

/** 会话运行参数（映射为 claude CLI 启动参数） */
export interface SessionOptions {
  /** 工作目录（cwd） */
  workDir: string
  /** --session-id（新会话预生成） */
  sessionId?: string
  /** --resume 的会话 ID */
  resumeSessionId?: string
  /** --model */
  model?: string
  /** --effort */
  effort?: string
  /** --permission-mode */
  permissionMode?: string
  /** --allowedTools */
  allowedTools?: string[]
  /** --disallowedTools */
  disallowedTools?: string[]
  /** --add-dir */
  addDirs?: string[]
  /** --max-budget-usd */
  maxBudgetUsd?: number
  /** --dangerously-skip-permissions */
  dangerouslySkipPermissions?: boolean
  /** --mcp-config */
  mcpConfig?: string
  /** 会话显示名（--name） */
  name?: string
}

export interface SessionHistoryItem {
  sessionId: string
  title: string
  cwd: string
  projectDir: string
  filePath: string
  lastModified: number
  createdAt: number
  messageCount: number
  lastCostUsd?: number
}

export interface AppSettings {
  theme: 'dark' | 'light'
  defaultWorkDir: string
  defaultModel: string
  defaultEffort: string
  defaultPermissionMode: string
  closeToTray: boolean
  lastOpenedDirs: string[]
}

/** 主进程推给渲染进程的 IPC 事件 */
export type MainEvent =
  | { channel: 'claude:event'; tabId: string; event: ClaudeStreamEvent }
  | { channel: 'claude:exit'; tabId: string; code: number | null; err?: string }
  | { channel: 'claude:error'; tabId: string; error: string }
