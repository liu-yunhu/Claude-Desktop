import { useState } from 'react'
import type { MessageItem } from '../stores/chat'
import { Markdown } from '../lib/Markdown'
import { ToolCard } from './ToolCard'

/** 单条消息：用户 / 助手 / 系统提示 */
export function MessageBubble({ msg }: { msg: MessageItem }) {
  if (msg.role === 'user') {
    return (
      <div className="flex justify-end my-3">
        <div className="max-w-[85%] rounded-xl rounded-br-sm bg-[#2b3a5e] px-4 py-2.5 text-[14px] leading-relaxed whitespace-pre-wrap break-words">
          {msg.text}
        </div>
      </div>
    )
  }

  if (msg.role === 'system') {
    return (
      <div className="my-2 text-[12.5px] text-amber-300/80 bg-amber-950/20 border border-amber-900/40 rounded-lg px-3 py-2 whitespace-pre-wrap break-words">
        {msg.text}
      </div>
    )
  }

  // assistant
  return (
    <div className="my-3 max-w-full">
      {msg.thinking ? <ThinkingBlock text={msg.thinking} tokens={msg.thinkingTokens} live={msg.streaming} /> : null}
      {msg.tools.map((t) => (
        <ToolCard key={t.id} tool={t} />
      ))}
      {msg.body ? (
        <div className={msg.streaming && !msg.body ? '' : ''}>
          <Markdown text={msg.body} />
        </div>
      ) : msg.streaming && !msg.thinking && msg.tools.length === 0 ? (
        <div className="text-slate-500 text-sm stream-cursor"> </div>
      ) : null}

      {/* 轮次统计 */}
      {(msg.cost !== undefined || msg.durationMs !== undefined) && (
        <div className="flex gap-3 text-[11px] text-slate-500 mt-1.5">
          {msg.model && <span>{msg.model}</span>}
          {msg.cost !== undefined && <span>${msg.cost.toFixed(4)}</span>}
          {msg.usage?.input_tokens !== undefined && (
            <span>
              in {msg.usage.input_tokens.toLocaleString()} / out {(msg.usage.output_tokens ?? 0).toLocaleString()}
            </span>
          )}
          {msg.durationMs !== undefined && <span>{(msg.durationMs / 1000).toFixed(1)}s</span>}
        </div>
      )}
    </div>
  )
}

function ThinkingBlock({ text, tokens, live }: { text: string; tokens?: number; live: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="mb-2">
      <button
        className="flex items-center gap-2 text-xs text-slate-400 hover:text-slate-200 transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span>{live ? '🧠' : '💭'}</span>
        <span>思考过程</span>
        {tokens !== undefined && tokens > 0 && <span className="text-slate-600">≈{tokens} tokens</span>}
        <span>{open ? '▾' : '▸'}</span>
      </button>
      {open && (
        <pre className="text-[12.5px] text-slate-400 italic bg-[#181925] border border-[#252836] rounded-md p-3 mt-1 max-h-72 overflow-y-auto whitespace-pre-wrap break-words">
          {text}
        </pre>
      )}
    </div>
  )
}
