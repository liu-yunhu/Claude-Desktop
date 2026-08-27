import { useEffect } from 'react'

export interface ContextMenuItem {
  label: string
  danger?: boolean
  disabled?: boolean
  onClick: () => void
}

export interface ContextMenuState {
  x: number
  y: number
  items: ContextMenuItem[]
}

/** 通用右键菜单：全屏透明遮罩 + 定位浮层，点外部 / Esc 关闭 */
export function ContextMenu({ menu, onClose }: { menu: ContextMenuState; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // 简单边界处理，避免菜单溢出窗口
  const left = Math.min(menu.x, window.innerWidth - 180)
  const top = Math.min(menu.y, window.innerHeight - menu.items.length * 32 - 16)

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault()
        onClose()
      }}
    >
      <div
        className="absolute min-w-36 bg-[#22242f] border border-[#33364a] rounded-lg py-1 shadow-2xl"
        style={{ left, top }}
        onClick={(e) => e.stopPropagation()}
      >
        {menu.items.map((it, i) => (
          <button
            key={i}
            disabled={it.disabled}
            className={`w-full text-left px-3 py-1.5 text-[12.5px] whitespace-nowrap transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
              it.danger ? 'text-rose-400 hover:bg-rose-950/40' : 'text-slate-200 hover:bg-[#2d3145]'
            }`}
            onClick={() => {
              it.onClick()
              onClose()
            }}
          >
            {it.label}
          </button>
        ))}
      </div>
    </div>
  )
}
