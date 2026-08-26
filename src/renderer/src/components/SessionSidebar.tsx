import { useEffect, useMemo, useState } from 'react'
import { useChat } from '../stores/chat'
import type { SessionHistoryItem } from '@shared/types'

/** 左侧栏：会话历史（读取 ~/.claude/projects 的 CLI 会话文件） */
export function SessionSidebar({ onOpenPanel }: { onOpenPanel: (p: 'settings' | 'mcp' | 'config') => void }) {
  const history = useChat((s) => s.history)
  const loading = useChat((s) => s.historyLoading)
  const resumeSession = useChat((s) => s.resumeSession)
  const newTab = useChat((s) => s.newTab)
  const [search, setSearch] = useState('')

  useEffect(() => {
    void useChat.getState().loadHistory()
  }, [])

  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase()
    const filtered = q
      ? history.filter(
          (h) => h.title.toLowerCase().includes(q) || h.cwd.toLowerCase().includes(q) || h.sessionId.includes(q)
        )
      : history
    const map = new Map<string, SessionHistoryItem[]>()
    for (const h of filtered.slice(0, 300)) {
      const arr = map.get(h.cwd) ?? []
      arr.push(h)
      map.set(h.cwd, arr)
    }
    return [...map.entries()]
  }, [history, search])

  return (
    <div className="w-64 shrink-0 flex flex-col bg-[#15161e] border-r border-[#23252f]">
      {/* 新建 */}
      <div className="p-2.5">
        <button
          className="w-full py-2 rounded-lg bg-[#3d5aa5] hover:bg-[#4868bd] text-white text-[13px] font-medium transition-colors"
          onClick={() => void newTab()}
        >
          ＋ 新建会话
        </button>
      </div>

      {/* 搜索 */}
      <div className="px-2.5 pb-2">
        <input
          className="w-full bg-[#1e2029] border border-[#2c2f3d] rounded-lg px-3 py-1.5 text-[12.5px] focus:outline-none focus:border-[#4a5785] placeholder:text-slate-600"
          placeholder="搜索会话…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* 历史列表 */}
      <div className="flex-1 overflow-y-auto px-1.5">
        {loading && <div className="text-xs text-slate-500 p-2">加载中…</div>}
        {!loading && grouped.length === 0 && (
          <div className="text-xs text-slate-600 p-2">暂无历史会话</div>
        )}
        {grouped.map(([cwd, items]) => (
          <div key={cwd} className="mb-2">
            <div className="px-2 py-1 text-[11px] text-slate-500 truncate font-mono" title={cwd}>
              {cwd}
            </div>
            {items.map((h) => (
              <button
                key={h.sessionId}
                className="w-full text-left px-2 py-1.5 rounded-md hover:bg-[#22242f] text-[12.5px] transition-colors group"
                onClick={() => void resumeSession(h)}
                title={`${h.title}\n\n${new Date(h.lastModified).toLocaleString()}\n${h.sessionId}`}
              >
                <div className="text-slate-300 truncate">{h.title}</div>
                <div className="text-[10.5px] text-slate-600 flex gap-2 mt-0.5">
                  <span>{timeAgo(h.lastModified)}</span>
                  {h.lastCostUsd !== undefined && <span>${h.lastCostUsd.toFixed(3)}</span>}
                </div>
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* 底部入口 */}
      <div className="border-t border-[#23252f] p-1.5 flex flex-col gap-0.5">
        <SidebarBtn label="⚙️ 应用设置" onClick={() => onOpenPanel('settings')} />
        <SidebarBtn label="🔌 MCP 服务器" onClick={() => onOpenPanel('mcp')} />
        <SidebarBtn label="📝 CLI 配置" onClick={() => onOpenPanel('config')} />
      </div>
    </div>
  )
}

function SidebarBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      className="text-left px-2.5 py-1.5 rounded-md text-[12.5px] text-slate-400 hover:text-slate-100 hover:bg-[#22242f] transition-colors"
      onClick={onClick}
    >
      {label}
    </button>
  )
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts
  const min = Math.floor(diff / 60000)
  if (min < 1) return '刚刚'
  if (min < 60) return `${min} 分钟前`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h} 小时前`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d} 天前`
  return new Date(ts).toLocaleDateString()
}
