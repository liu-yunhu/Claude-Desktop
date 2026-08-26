import { useState } from 'react'
import { useChat } from '../stores/chat'
import { MODELS, EFFORTS, PERMISSION_MODES, COMMON_TOOLS } from '../constants'

/** 当前标签页的会话参数栏：全部映射为 claude CLI 启动参数 */
export function SessionSettingsBar({ tabId }: { tabId: string }) {
  const tab = useChat((s) => s.tabs.find((t) => t.id === tabId))
  const updateOptions = useChat((s) => s.updateOptions)
  const [showTools, setShowTools] = useState(false)
  if (!tab) return null
  const o = tab.options

  return (
    <div className="flex flex-wrap items-center gap-2 px-4 py-2 bg-[#1b1d29] border-b border-[#23252f] text-[12.5px]">
      {/* 工作目录 */}
      <button
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-[#252836] hover:bg-[#2d3145] font-mono max-w-72 transition-colors"
        title="选择工作目录（子进程 cwd）"
        onClick={async () => {
          const dir = await window.api.system.pickDir()
          if (dir) updateOptions(tabId, { workDir: dir })
        }}
      >
        <span>📁</span>
        <span className="truncate">{o.workDir}</span>
      </button>

      {/* 模型 */}
      <Select
        title="claude --model"
        value={o.model ?? ''}
        options={MODELS}
        onChange={(v) => updateOptions(tabId, { model: v || undefined })}
      />

      {/* effort */}
      <Select
        title="claude --effort"
        value={o.effort ?? ''}
        options={EFFORTS}
        onChange={(v) => updateOptions(tabId, { effort: v || undefined })}
      />

      {/* 权限模式 */}
      <Select
        title="claude --permission-mode（下一条消息生效）"
        value={o.permissionMode ?? 'default'}
        options={PERMISSION_MODES}
        dangerValue="bypassPermissions"
        onChange={(v) => updateOptions(tabId, { permissionMode: v })}
      />

      {/* 工具白名单 */}
      <div className="relative">
        <button
          className="px-2.5 py-1 rounded-md bg-[#252836] hover:bg-[#2d3145] transition-colors"
          onClick={() => setShowTools(!showTools)}
        >
          🛠 工具 {o.allowedTools?.length ? `(${o.allowedTools.length})` : ''}
        </button>
        {showTools && (
          <div className="absolute top-full mt-1 left-0 z-50 bg-[#22242f] border border-[#33364a] rounded-lg p-3 w-72 shadow-xl">
            <div className="text-[11px] text-slate-500 mb-2">
              --allowedTools 白名单（留空 = 全部默认工具）。-p 模式无交互授权，需要免确认的工具加到这里。
            </div>
            <div className="grid grid-cols-2 gap-1">
              {COMMON_TOOLS.map((t) => {
                const checked = o.allowedTools?.includes(t) ?? false
                return (
                  <label key={t} className="flex items-center gap-1.5 text-[12px] text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => {
                        const cur = new Set(o.allowedTools ?? [])
                        if (e.target.checked) cur.add(t)
                        else cur.delete(t)
                        updateOptions(tabId, { allowedTools: cur.size ? [...cur] : undefined })
                      }}
                    />
                    {t}
                  </label>
                )
              })}
            </div>
            <input
              className="w-full mt-2 bg-[#1a1c26] border border-[#33364a] rounded-md px-2 py-1.5 text-[12px] focus:outline-none focus:border-[#4a5785] placeholder:text-slate-600"
              placeholder="自定义，如 Bash(git *) 逗号分隔"
              defaultValue={o.allowedTools?.filter((t) => !COMMON_TOOLS.includes(t)).join(', ')}
              onBlur={(e) => {
                const custom = e.target.value
                  .split(',')
                  .map((s) => s.trim())
                  .filter((s) => s && !COMMON_TOOLS.includes(s))
                const std = (o.allowedTools ?? []).filter((t) => COMMON_TOOLS.includes(t))
                const merged = [...std, ...custom]
                updateOptions(tabId, { allowedTools: merged.length ? merged : undefined })
              }}
            />
          </div>
        )}
      </div>

      <div className="flex-1" />
      {o.permissionMode === 'bypassPermissions' && (
        <span className="text-[11.5px] text-rose-400">⚠ 已跳过全部权限检查</span>
      )}
    </div>
  )
}

function Select({
  title,
  value,
  options,
  onChange,
  dangerValue
}: {
  title: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
  dangerValue?: string
}) {
  return (
    <select
      title={title}
      className={`px-2.5 py-1 rounded-md bg-[#252836] hover:bg-[#2d3145] cursor-pointer max-w-56 transition-colors ${
        dangerValue && value === dangerValue ? 'text-rose-400' : ''
      }`}
      value={value}
      onChange={(e) => onChange(e.target.value)}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  )
}
