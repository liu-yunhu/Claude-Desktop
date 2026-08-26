import { useEffect, useRef, useState } from 'react'
import { useChat } from '../stores/chat'
import { MessageBubble } from './MessageBubble'
import { PromptBox } from './PromptBox'

/** 聊天主视图：消息流 + 输入框 */
export function ChatView({ tabId }: { tabId: string }) {
  const tab = useChat((s) => s.tabs.find((t) => t.id === tabId))
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  })

  if (!tab) return null

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* 会话状态条 */}
      <div className="flex items-center gap-3 px-4 py-1.5 text-[11px] text-slate-500 border-b border-[#23252f] bg-[#181924]">
        <span className="font-mono truncate max-w-[45%]" title={tab.options.workDir}>
          📁 {tab.options.workDir}
        </span>
        {tab.activeSessionId && (
          <span className="font-mono">#{tab.activeSessionId.slice(0, 8)}</span>
        )}
        <span className={tab.running ? 'text-amber-400 animate-pulse' : ''}>
          {tab.running ? '● 运行中' : '● 空闲'}
        </span>
        <span>累计 ${tab.totalCost.toFixed(4)}</span>
        <span className="flex-1" />
        <button
          className="hover:text-slate-300 underline underline-offset-2"
          onClick={() => useChat.getState().loadTranscript(tabId)}
          title="从 CLI 会话文件重新加载历史消息"
          disabled={!tab.resumedFrom}
        >
          重新加载历史
        </button>
      </div>

      {/* 消息流 */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-6 py-2"
        onScroll={(e) => {
          const el = e.currentTarget
          setAutoScroll(el.scrollHeight - el.scrollTop - el.clientHeight < 80)
        }}
      >
        {tab.messages.length === 0 && <EmptyState />}
        {tab.messages.map((m) => (
          <MessageBubble key={m.id} msg={m} />
        ))}
      </div>

      {/* 输入框 */}
      <PromptBox tabId={tabId} running={tab.running} />
    </div>
  )
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-slate-500 gap-2 select-none">
      <div className="text-4xl">🤖</div>
      <div className="text-lg text-slate-400">Claude Code GUI</div>
      <div className="text-sm">所有交互均通过执行 claude CLI 命令完成</div>
      <div className="text-xs mt-3 flex flex-col items-center gap-1">
        <span>提示：在上方设置栏选择工作目录 / 模型 / 权限模式</span>
        <span>Enter 发送 · Shift+Enter 换行</span>
      </div>
    </div>
  )
}
