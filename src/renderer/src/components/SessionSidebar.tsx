import { useEffect, useMemo, useRef, useState } from 'react'
import { useChat } from '../stores/chat'
import { ContextMenu, type ContextMenuState } from './ContextMenu'
import type { SessionHistoryItem } from '@shared/types'

/** 左侧栏：会话历史（读取 ~/.claude/projects 的 CLI 会话文件），按工作目录折叠分组 */
export function SessionSidebar({ onOpenPanel }: { onOpenPanel: (p: 'settings' | 'mcp' | 'config') => void }) {
  const history = useChat((s) => s.history)
  const loading = useChat((s) => s.historyLoading)
  const resumeSession = useChat((s) => s.resumeSession)
  const newTab = useChat((s) => s.newTab)
  const [search, setSearch] = useState('')
  // 折叠的目录集合（默认全部折叠，点击目录行展开/收起）
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [menu, setMenu] = useState<ContextMenuState | null>(null)
  const [editing, setEditing] = useState<{ id: string; value: string } | null>(null)
  const [renameError, setRenameError] = useState('')

  useEffect(() => {
    void useChat.getState().loadHistory()
  }, [])

  const searching = search.trim() !== ''
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

  const toggle = (cwd: string) =>
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(cwd)) next.delete(cwd)
      else next.add(cwd)
      return next
    })

  const startRename = (h: SessionHistoryItem) => {
    setEditing({ id: h.sessionId, value: h.title })
    setMenu(null)
  }

  // 删除会话：主进程弹原生确认框，确认后删文件
  const removeSession = async (h: SessionHistoryItem) => {
    const r = await window.api.sessions.delete(h.filePath, h.title)
    if (r.deleted) {
      void useChat.getState().loadHistory()
      useChat.getState().closeBySession(h.sessionId)
    } else if (r.error) {
      setRenameError(r.error)
    }
  }

  // 重命名：向 CLI 会话文件追加 custom-title 行（/rename、--name 的同一存储机制）
  const commitRename = async () => {
    if (!editing) return
    const h = history.find((x) => x.sessionId === editing.id)
    const newName = editing.value.trim()
    setEditing(null)
    if (!h || !newName || newName === h.title) return
    const r = await window.api.sessions.rename(h.filePath, h.sessionId, newName)
    if (r.ok) {
      void useChat.getState().loadHistory()
      useChat.getState().renameOpenTab(h.sessionId, newName)
    } else setRenameError(r.error ?? '重命名失败')
  }

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
        {renameError && (
          <div
            className="mt-1 px-2 py-1 rounded-md text-[11px] text-rose-300 bg-rose-950/40 border border-rose-900/40 cursor-pointer"
            onClick={() => setRenameError('')}
            title="点击关闭"
          >
            {renameError}
          </div>
        )}
      </div>

      {/* 历史列表：目录级折叠分组 */}
      <div className="flex-1 overflow-y-auto px-1.5">
        {loading && <div className="text-xs text-slate-500 p-2">加载中…</div>}
        {!loading && grouped.length === 0 && (
          <div className="text-xs text-slate-600 p-2">暂无历史会话</div>
        )}
        {grouped.map(([cwd, items]) => {
          const isCollapsed = collapsed.has(cwd)
          const showItems = searching || !isCollapsed
          return (
            <div key={cwd} className="mb-0.5">
              <button
                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-[#1e2029] text-left transition-colors"
                onClick={() => toggle(cwd)}
                title={cwd || '(未知目录)'}
              >
                <span className="text-slate-600 text-[10px] w-3 shrink-0">
                  {searching ? '·' : isCollapsed ? '▸' : '▾'}
                </span>
                <span className="text-[12px] text-slate-400 truncate flex-1">📁 {dirName(cwd)}</span>
                <span className="text-[10.5px] text-slate-600 shrink-0">{items.length}</span>
              </button>
              {showItems &&
                items.map((h) =>
                  editing?.id === h.sessionId ? (
                    <div key={h.sessionId} className="pl-7 pr-2 py-0.5">
                      <RenameInput
                        value={editing.value}
                        onChange={(v) => setEditing({ id: h.sessionId, value: v })}
                        onCommit={() => void commitRename()}
                        onCancel={() => setEditing(null)}
                      />
                    </div>
                  ) : (
                    <button
                      key={h.sessionId}
                      className="w-full text-left pl-7 pr-2 py-1.5 rounded-md hover:bg-[#22242f] text-[12.5px] transition-colors group"
                      onClick={() => void resumeSession(h)}
                      onContextMenu={(e) => {
                        e.preventDefault()
                        setMenu({
                          x: e.clientX,
                          y: e.clientY,
                          items: [
                            { label: '重命名', onClick: () => startRename(h) },
                            { label: '删除', danger: true, onClick: () => void removeSession(h) }
                          ]
                        })
                      }}
                      title={`${h.title}\n\n${new Date(h.lastModified).toLocaleString()}\n${h.sessionId}`}
                    >
                      <div className="text-slate-300 truncate">{h.title}</div>
                      <div className="text-[10.5px] text-slate-600 flex gap-2 mt-0.5">
                        <span>{timeAgo(h.lastModified)}</span>
                        {h.lastCostUsd !== undefined && <span>${h.lastCostUsd.toFixed(3)}</span>}
                      </div>
                    </button>
                  )
                )}
            </div>
          )
        })}
      </div>

      {/* 底部入口 */}
      <div className="border-t border-[#23252f] p-1.5 flex flex-col gap-0.5">
        <SidebarBtn label="⚙️ 应用设置" onClick={() => onOpenPanel('settings')} />
        <SidebarBtn label="🔌 MCP 服务器" onClick={() => onOpenPanel('mcp')} />
        <SidebarBtn label="📝 CLI 配置" onClick={() => onOpenPanel('config')} />
      </div>

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}

/** 内联重命名输入框：Enter 保存 / Esc 取消 / 失焦保存 */
function RenameInput({
  value,
  onChange,
  onCommit,
  onCancel
}: {
  value: string
  onChange: (v: string) => void
  onCommit: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
    ref.current?.select()
  }, [])
  return (
    <input
      ref={ref}
      className="w-full bg-[#1a1c26] border border-[#4a5785] rounded-md px-2 py-1 text-[12.5px] text-slate-100 focus:outline-none"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') onCommit()
        else if (e.key === 'Escape') onCancel()
      }}
      onBlur={onCommit}
      placeholder="输入新名称"
    />
  )
}

/** 从路径取目录名（兼容 Windows 与 POSIX 分隔符） */
function dirName(path: string): string {
  if (!path) return '(未知目录)'
  const parts = path.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
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
