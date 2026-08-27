import { create } from 'zustand'
import type {
  ClaudeStreamEvent,
  SessionOptions,
  SessionHistoryItem,
  PermissionRequestInfo
} from '@shared/types'
import { useSettings } from './settings'
import type { PanelKind } from '../constants'

/** 一次工具调用 */
export interface ToolCall {
  id: string
  name: string
  /** 工具入参（Edit 的 old_string/new_string、Bash 的 command 等） */
  input?: Record<string, unknown>
  /** stream-json 部分消息期间累积的入参 JSON 片段 */
  inputPartial?: string
  status: 'running' | 'done' | 'error'
  result?: string
  isError?: boolean
}

/** 聊天流中的一条消息 */
export interface MessageItem {
  id: string
  role: 'user' | 'assistant' | 'system'
  /** 用户消息文本 */
  text?: string
  /** 思考内容 */
  thinking?: string
  /** 助手正文 */
  body?: string
  /** 本条消息里的工具调用 */
  tools: ToolCall[]
  streaming: boolean
  /** thinking_tokens 计数（system 事件） */
  thinkingTokens?: number
  /** 本轮费用（result 事件回填，挂在最后一条 assistant 消息上） */
  cost?: number
  durationMs?: number
  usage?: Record<string, number>
  model?: string
}

export interface Tab {
  id: string
  title: string
  messages: MessageItem[]
  options: SessionOptions
  /** init 事件返回的 session_id（与 options.sessionId 一致；resume 时为被恢复的会话） */
  activeSessionId?: string
  running: boolean
  totalCost: number
  lastError?: string
  /** 恢复历史会话时标记 */
  resumedFrom?: string
  /** 等待用户授权的工具调用（can_use_tool 控制请求） */
  pendingPerms: PermissionRequestInfo[]
  /** stream_event 的 content_block 索引 -> 本轮 live 消息内的块索引 */
  liveBlockMap: Map<number, number>
  liveMsgId?: string
}

export interface ChatState {
  tabs: Tab[]
  activeTabId: string
  history: SessionHistoryItem[]
  historyLoading: boolean
  panel: PanelKind
  // actions
  newTab: (workDir?: string) => Promise<void>
  closeTab: (tabId: string) => void
  closeTabs: (tabIds: string[]) => void
  setActiveTab: (tabId: string) => void
  setPanel: (p: PanelKind) => void
  insertSystemMessage: (tabId: string, text: string) => void
  updateOptions: (tabId: string, patch: Partial<SessionOptions>) => void
  send: (prompt: string) => Promise<void>
  stop: () => Promise<void>
  applyEvent: (tabId: string, ev: ClaudeStreamEvent) => void
  handleExit: (tabId: string, code: number | null, err?: string) => void
  loadHistory: () => Promise<void>
  resumeSession: (item: SessionHistoryItem) => Promise<void>
  renameOpenTab: (sessionId: string, title: string) => void
  closeBySession: (sessionId: string) => void
  moveTab: (draggedId: string, targetIndex: number) => void
  applyPermissionRequest: (info: PermissionRequestInfo & { tabId: string }) => void
  cancelPermission: (requestId: string) => void
  respondPermission: (tabId: string, requestId: string, allow: boolean) => Promise<void>
  loadTranscript: (tabId: string) => Promise<void>
}

let msgSeq = 0
const nextId = () => `m${++msgSeq}`

const uid = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2)

export const useChat = create<ChatState>((set, get) => ({
  tabs: [],
  activeTabId: '',
  history: [],
  historyLoading: false,
  panel: null,

  setPanel: (p) => set({ panel: p }),

  insertSystemMessage: (tabId, text) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === tabId
          ? { ...t, messages: [...t.messages, { id: nextId(), role: 'system', text, tools: [], streaming: false }] }
          : t
      )
    }))
  },

  newTab: async (workDir) => {
    const tabId = uid()
    const sessionId = await window.api.claude.newUuid()
    const settings = useSettings.getState()
    const tab: Tab = {
      id: tabId,
      title: '新会话',
      messages: [],
      options: {
        workDir: workDir || settings.defaultWorkDir,
        sessionId,
        model: settings.defaultModel || undefined,
        effort: settings.defaultEffort || undefined,
        permissionMode: settings.defaultPermissionMode
      },
      running: false,
      totalCost: 0,
      pendingPerms: [],
      liveBlockMap: new Map()
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tabId }))
  },

  closeTab: (tabId) => {
    void window.api.claude.stop(tabId)
    set((s) => {
      const tabs = s.tabs.filter((t) => t.id !== tabId)
      const activeTabId = s.activeTabId === tabId ? (tabs[0]?.id ?? '') : s.activeTabId
      return { tabs, activeTabId }
    })
  },

  closeTabs: (tabIds) => {
    for (const id of tabIds) void window.api.claude.stop(id)
    set((s) => {
      const tabs = s.tabs.filter((t) => !tabIds.includes(t.id))
      const activeTabId = tabIds.includes(s.activeTabId) ? (tabs[0]?.id ?? '') : s.activeTabId
      return { tabs, activeTabId }
    })
  },

  setActiveTab: (tabId) => set({ activeTabId: tabId }),

  updateOptions: (tabId, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? { ...t, options: { ...t.options, ...patch } } : t))
    })),

  send: async (prompt) => {
    const { activeTabId, tabs } = get()
    const tab = tabs.find((t) => t.id === activeTabId)
    if (!tab || tab.running) return

    const isFirst = tab.messages.length === 0
    const userMsg: MessageItem = { id: nextId(), role: 'user', text: prompt, tools: [], streaming: false }
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === activeTabId
          ? {
              ...t,
              running: true,
              lastError: undefined,
              // 第一条消息后使用 --resume 串接（session 已存在）
              options: t.messages.length > 0 ? { ...t.options, resumeSessionId: t.activeSessionId ?? t.options.sessionId } : t.options,
              messages: [...t.messages, userMsg]
            }
          : t
      )
    }))
    // 首条消息即上侧边栏：磁盘文件要等 CLI 启动才写出，先用内存数据占位，
    // loadHistory 合并时同 sessionId 的磁盘记录会覆盖它
    if (isFirst) {
      const now = Date.now()
      set((s) => ({
        history: [
          {
            sessionId: tab.options.sessionId ?? '',
            title: prompt.replace(/\s+/g, ' ').slice(0, 120) || '(无标题会话)',
            cwd: tab.options.workDir,
            projectDir: '',
            filePath: '',
            lastModified: now,
            createdAt: now,
            messageCount: 1
          },
          ...s.history
        ]
      }))
    }
    const current = get().tabs.find((t) => t.id === activeTabId)!
    await window.api.claude.send(activeTabId, prompt, current.options)
  },

  stop: async () => {
    const { activeTabId } = get()
    await window.api.claude.stop(activeTabId)
  },

  applyEvent: (tabId, ev) => {
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === tabId ? reduceEvent(t, ev) : t))
    }))
  },

  handleExit: (tabId, code, err) => {
    set((s) => ({
      tabs: s.tabs.map((t) => {
        if (t.id !== tabId) return t
        const messages = t.messages.map((m) => ({ ...m, streaming: false }))
        const last = messages[messages.length - 1]
        if (code !== 0 && err && last && last.role === 'assistant') {
          messages.push({
            id: nextId(),
            role: 'system',
            text: `claude 进程异常退出 (code ${code})：\n${err}`,
            tools: [],
            streaming: false
          })
        }
        return { ...t, messages, running: false, pendingPerms: [] }
      })
    }))
    // 进程退出即本轮已写盘（~/.claude/projects/<uuid>.jsonl），刷新侧边栏历史
    void get().loadHistory()
  },

  loadHistory: async () => {
    set({ historyLoading: true })
    try {
      const fresh = await window.api.sessions.list()
      const diskIds = new Set(fresh.map((h) => h.sessionId))
      // 保留磁盘上还没有的乐观占位条目（首条消息已发、CLI 尚未写盘）。
      // 占位条目特征是 filePath 为空；有 filePath 而磁盘上没有 = 已被删除，须丢弃
      set({ history: [...get().history.filter((h) => h.filePath === '' && !diskIds.has(h.sessionId)), ...fresh] })
    } finally {
      set({ historyLoading: false })
    }
  },

  resumeSession: async (item) => {
    // 该会话已打开则直接切换，不重复开 tab
    const existing = get().tabs.find(
      (t) => t.activeSessionId === item.sessionId || t.options.resumeSessionId === item.sessionId
    )
    if (existing) {
      set({ activeTabId: existing.id })
      return
    }
    const tabId = uid()
    const tab: Tab = {
      id: tabId,
      title: item.title.slice(0, 24) || '恢复的会话',
      messages: [
        {
          id: nextId(),
          role: 'system',
          text: `已恢复会话 ${item.sessionId.slice(0, 8)}…（工作目录：${item.cwd}）。点击消息加载按钮可查看历史消息。`,
          tools: [],
          streaming: false
        }
      ],
      options: {
        workDir: item.cwd,
        resumeSessionId: item.sessionId,
        model: useSettings.getState().defaultModel || undefined,
        effort: useSettings.getState().defaultEffort || undefined,
        permissionMode: useSettings.getState().defaultPermissionMode
      },
      activeSessionId: item.sessionId,
      running: false,
      totalCost: 0,
      resumedFrom: item.filePath,
      pendingPerms: [],
      liveBlockMap: new Map()
    }
    set((s) => ({ tabs: [...s.tabs, tab], activeTabId: tabId }))
    await get().loadTranscript(tabId)
  },

  loadTranscript: async (tabId) => {
    const tab = get().tabs.find((t) => t.id === tabId)
    if (!tab?.resumedFrom) return
    const transcript = await window.api.sessions.transcript(tab.resumedFrom)
    const messages: MessageItem[] = transcript.map((t) => ({
      id: nextId(),
      role: t.role,
      text: t.text,
      thinking: t.thinking,
      body: t.role === 'assistant' ? t.text : undefined,
      tools: t.tools,
      streaming: false,
      model: t.model
    }))
    setTranscript(tabId, messages)
  },

  renameOpenTab: (sessionId, title) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.activeSessionId === sessionId || t.options.resumeSessionId === sessionId
          ? { ...t, title: title.slice(0, 24) || t.title }
          : t
      )
    }))
  },

  closeBySession: (sessionId) => {
    const tab = get().tabs.find(
      (t) => t.activeSessionId === sessionId || t.options.resumeSessionId === sessionId
    )
    if (tab) get().closeTab(tab.id)
  },

  moveTab: (draggedId, targetIndex) => {
    set((s) => {
      const from = s.tabs.findIndex((t) => t.id === draggedId)
      if (from < 0 || from === targetIndex) return s
      const tabs = [...s.tabs]
      const [moved] = tabs.splice(from, 1)
      // 被拖 tab 原位置在目标之前时，移除后目标索引左移一位
      const idx = from < targetIndex ? targetIndex - 1 : targetIndex
      tabs.splice(Math.min(idx, tabs.length), 0, moved)
      return { tabs }
    })
  },

  applyPermissionRequest: (info) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.id === info.tabId
          ? {
              ...t,
              pendingPerms: [
                ...t.pendingPerms,
                {
                  requestId: info.requestId,
                  toolName: info.toolName,
                  input: info.input,
                  title: info.title,
                  description: info.description
                }
              ]
            }
          : t
      )
    }))
  },

  cancelPermission: (requestId) => {
    set((s) => ({
      tabs: s.tabs.map((t) =>
        t.pendingPerms.some((p) => p.requestId === requestId)
          ? { ...t, pendingPerms: t.pendingPerms.filter((p) => p.requestId !== requestId) }
          : t
      )
    }))
  },

  respondPermission: async (tabId, requestId, allow) => {
    await window.api.claude.respondPermission(tabId, requestId, allow)
    get().cancelPermission(requestId)
  }
}))

/** 恢复会话时把 CLI 会话文件中读出的历史消息填入标签页 */
export function setTranscript(tabId: string, messages: MessageItem[]): void {
  useChat.setState((s) => ({
    tabs: s.tabs.map((t) =>
      t.id === tabId
        ? { ...t, messages: [...messages, ...t.messages.filter((m) => m.role !== 'system')] }
        : t
    )
  }))
}

/** ============ 事件归约：stream-json 事件 -> Tab 状态 ============ */

function reduceEvent(tab: Tab, ev: ClaudeStreamEvent): Tab {
  switch (ev.type) {
    case 'gui-error':
    case 'gui-raw': {
      const msg: MessageItem = {
        id: nextId(),
        role: 'system',
        text: ev.result,
        tools: [],
        streaming: false
      }
      return { ...tab, messages: [...tab.messages, msg] }
    }

    case 'system': {
      if (ev.subtype === 'init') {
        return {
          ...tab,
          activeSessionId: ev.session_id ?? tab.activeSessionId,
          title:
            tab.title === '新会话' && ev.session_id
              ? '会话 ' + ev.session_id.slice(0, 8)
              : tab.title
        }
      }
      if (ev.subtype === 'thinking_tokens') {
        // 高频事件：更新 live 消息上的计数
        return updateLive(tab, (m) => ({
          ...m,
          thinkingTokens: ev.estimated_tokens ?? m.thinkingTokens
        }))
      }
      return tab
    }

    case 'stream_event': {
      const se = ev.event
      if (!se) return tab
      if (se.type === 'content_block_start') {
        const block = se.content_block
        const idx = se.index ?? 0
        let tab2 = ensureLive(tab)
        tab2 = updateLive(tab2, (m) => {
          const tools = [...m.tools]
          if (block?.type === 'tool_use') {
            tools.push({
              id: block.id ?? `t${idx}`,
              name: block.name ?? 'unknown',
              inputPartial: '',
              status: 'running'
            })
            return { ...m, tools }
          }
          if (block?.type === 'text') {
            return { ...m, body: (m.body ?? '') + (block.text ?? '') }
          }
          return m // thinking block：delta 累积
        })
        return tab2
      }
      if (se.type === 'content_block_delta') {
        const d = se.delta
        return updateLive(tab, (m) => {
          if (d?.type === 'text_delta') return { ...m, body: (m.body ?? '') + (d.text ?? '') }
          if (d?.type === 'thinking_delta') return { ...m, thinking: (m.thinking ?? '') + (d.thinking ?? '') }
          if (d?.type === 'input_json_delta' && d.partial_json) {
            const tools = [...m.tools]
            const last = tools.length - 1
            if (last >= 0) tools[last] = { ...tools[last], inputPartial: (tools[last].inputPartial ?? '') + d.partial_json }
            return { ...m, tools }
          }
          return m
        })
      }
      if (se.type === 'content_block_stop') {
        return updateLive(tab, (m) => {
          // 工具入参 JSON 解析完成，转为结构化 input
          const tools = m.tools.map((t) => {
            if (t.inputPartial) {
              try {
                return { ...t, input: JSON.parse(t.inputPartial) as Record<string, unknown>, inputPartial: undefined }
              } catch {
                return t
              }
            }
            return t
          })
          return { ...m, tools }
        })
      }
      return tab
    }

    case 'assistant': {
      // 一条完整 assistant 消息：用权威内容替换流式累积，然后结束 live 消息
      const content = ev.message?.content ?? []
      let tab2 = ensureLive(tab)
      tab2 = updateLive(tab2, (m) => {
        const body = content.filter((b) => b.type === 'text').map((b) => b.text ?? '').join('')
        const thinking = content.find((b) => b.type === 'thinking')?.thinking ?? m.thinking
        const tools = content
          .filter((b) => b.type === 'tool_use')
          .map((b) => {
            const existing = m.tools.find((t) => t.id === b.id)
            return {
              id: b.id ?? uid(),
              name: b.name ?? 'unknown',
              input: (b.input ?? existing?.input) as Record<string, unknown> | undefined,
              status: existing?.status ?? ('running' as const)
            }
          })
        return { ...m, body, thinking, tools, model: ev.message?.model ?? m.model }
      })
      // 结束 live：下一条消息重新开始
      return finalizeLive(tab2)
    }

    case 'user': {
      // 工具结果回填（按 tool_use_id 配对）
      const content = ev.message?.content ?? []
      const results = content.filter((b) => b.type === 'tool_result')
      if (results.length === 0) return tab
      let messages = [...tab.messages]
      for (const r of results) {
        const tid = r.tool_use_id
        let text = ''
        if (typeof r.content === 'string') text = r.content
        else if (Array.isArray(r.content)) {
          text = r.content.map((b) => ('text' in b ? b.text ?? '' : JSON.stringify(b))).join('')
        }
        messages = messages.map((m) =>
          m.role === 'assistant'
            ? {
                ...m,
                tools: m.tools.map((t) =>
                  t.id === tid ? { ...t, status: r.is_error ? 'error' : 'done', result: text, isError: r.is_error } : t
                )
              }
            : m
        )
      }
      return { ...tab, messages }
    }

    case 'result': {
      const cost = ev.total_cost_usd ?? 0
      let messages = [...tab.messages]
      // 把本轮统计挂到最后一条 assistant 消息
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'assistant') {
          messages[i] = {
            ...messages[i],
            cost,
            durationMs: ev.duration_ms,
            usage: ev.usage,
            streaming: false
          }
          break
        }
      }
      const tab2: Tab = {
        ...tab,
        messages,
        totalCost: tab.totalCost + cost,
        activeSessionId: ev.session_id ?? tab.activeSessionId,
        running: ev.type === 'result' ? false : tab.running
      }
      if (ev.permission_denials && ev.permission_denials.length > 0) {
        tab2.messages = [
          ...tab2.messages,
          {
            id: nextId(),
            role: 'system',
            text: `有 ${ev.permission_denials.length} 个工具调用因权限被拒绝（-p 模式无交互授权，可在设置中调整权限模式或 allowedTools 白名单）`,
            tools: [],
            streaming: false
          }
        ]
      }
      return tab2
    }

    default:
      return tab
  }
}

/** 确保 live 消息存在（流式块写入的目标） */
function ensureLive(tab: Tab): Tab {
  const last = tab.messages[tab.messages.length - 1]
  if (last && last.role === 'assistant' && last.streaming) return tab
  const live: MessageItem = { id: nextId(), role: 'assistant', tools: [], streaming: true }
  return { ...tab, messages: [...tab.messages, live] }
}

function updateLive(tab: Tab, fn: (m: MessageItem) => MessageItem): Tab {
  const idx = tab.messages.length - 1
  if (idx < 0) return tab
  const last = tab.messages[idx]
  if (last.role !== 'assistant' || !last.streaming) return tab
  const messages = [...tab.messages]
  messages[idx] = fn(last)
  return { ...tab, messages }
}

/** 结束当前 live 消息（下一条 assistant 重新开 live） */
function finalizeLive(tab: Tab): Tab {
  const idx = tab.messages.length - 1
  if (idx < 0) return tab
  const last = tab.messages[idx]
  if (last.role !== 'assistant') return tab
  const messages = [...tab.messages]
  messages[idx] = { ...last, streaming: false }
  return { ...tab, messages }
}
