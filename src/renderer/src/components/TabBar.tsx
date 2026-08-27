import { useState, type MouseEvent as ReactMouseEvent } from 'react'
import { useChat } from '../stores/chat'
import { ContextMenu, type ContextMenuState } from './ContextMenu'

/** 顶部多标签栏（每个标签 = 一个独立 claude 会话进程组 + 独立工作目录） */
export function TabBar() {
  const tabs = useChat((s) => s.tabs)
  const activeTabId = useChat((s) => s.activeTabId)
  const setActiveTab = useChat((s) => s.setActiveTab)
  const closeTab = useChat((s) => s.closeTab)
  const closeTabs = useChat((s) => s.closeTabs)
  const newTab = useChat((s) => s.newTab)
  const [menu, setMenu] = useState<ContextMenuState | null>(null)

  const openMenu = (e: ReactMouseEvent<HTMLDivElement>, tabId: string) => {
    e.preventDefault()
    const idx = tabs.findIndex((t) => t.id === tabId)
    const leftIds = tabs.slice(0, idx).map((t) => t.id)
    const rightIds = tabs.slice(idx + 1).map((t) => t.id)
    setMenu({
      x: e.clientX,
      y: e.clientY,
      items: [
        { label: '关闭', onClick: () => closeTab(tabId) },
        {
          label: '关闭其他',
          disabled: tabs.length <= 1,
          onClick: () => closeTabs([...leftIds, ...rightIds])
        },
        { label: '关闭左侧', disabled: leftIds.length === 0, onClick: () => closeTabs(leftIds) },
        { label: '关闭右侧', disabled: rightIds.length === 0, onClick: () => closeTabs(rightIds) }
      ]
    })
  }

  return (
    <div className="flex items-end bg-[#13141c] border-b border-[#23252f] px-1 pt-1 select-none">
      <div className="flex items-end overflow-x-auto flex-1">
        {tabs.map((t) => (
          <div
            key={t.id}
            className={`group flex items-center gap-2 px-3.5 py-2 rounded-t-lg cursor-pointer text-[13px] whitespace-nowrap max-w-56 transition-colors ${
              t.id === activeTabId
                ? 'bg-[#22242f] text-slate-100 border-t border-x border-[#33364a]'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a1c26]'
            }`}
            onClick={() => setActiveTab(t.id)}
            onContextMenu={(e) => openMenu(e, t.id)}
          >
            {t.running && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse shrink-0" />}
            <span className="truncate">{t.title}</span>
            <button
              className="opacity-0 group-hover:opacity-100 hover:text-rose-400 text-slate-500 shrink-0"
              onClick={(e) => {
                e.stopPropagation()
                closeTab(t.id)
              }}
              title="关闭标签页"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
      <button
        className="px-3 py-2 text-slate-400 hover:text-slate-100 hover:bg-[#1a1c26] rounded-t-lg text-sm"
        onClick={() => void newTab()}
        title="新建会话（独立工作目录）"
      >
        ＋
      </button>

      {menu && <ContextMenu menu={menu} onClose={() => setMenu(null)} />}
    </div>
  )
}
