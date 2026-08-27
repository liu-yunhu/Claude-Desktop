import { useChat } from '../stores/chat'
import type { PermissionRequestInfo } from '@shared/types'

/** 工具授权横幅：CLI 通过控制协议请求人工授权时显示，用户选择允许/拒绝 */
export function PermissionBanner({ tabId }: { tabId: string }) {
  const pending = useChat((s) => s.tabs.find((t) => t.id === tabId)?.pendingPerms ?? [])
  const respondPermission = useChat((s) => s.respondPermission)
  if (pending.length === 0) return null

  const current: PermissionRequestInfo = pending[0]
  const summary = summarizeInput(current.input)

  return (
    <div className="mx-auto max-w-4xl mb-2 rounded-xl border border-amber-600/60 bg-amber-950/30 px-4 py-3">
      <div className="flex items-start gap-3">
        <span className="text-lg leading-none mt-0.5">⚠️</span>
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] text-amber-100 font-medium">
            {current.title || `Claude 请求使用 ${current.toolName}`}
          </div>
          {current.description && (
            <div className="text-[12px] text-amber-200/70 mt-0.5">{current.description}</div>
          )}
          <pre className="text-[11.5px] text-amber-100/80 bg-black/30 rounded-md p-2 mt-1.5 max-h-28 overflow-auto whitespace-pre-wrap break-all">
            {summary}
          </pre>
        </div>
        <div className="flex flex-col gap-1.5 shrink-0">
          <button
            className="px-4 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-[12.5px] font-medium transition-colors"
            onClick={() => void respondPermission(tabId, current.requestId, true)}
          >
            允许
          </button>
          <button
            className="px-4 py-1.5 rounded-lg bg-[#3a3d4d] hover:bg-[#4a4e62] text-slate-200 text-[12.5px] transition-colors"
            onClick={() => void respondPermission(tabId, current.requestId, false)}
          >
            拒绝
          </button>
        </div>
      </div>
      {pending.length > 1 && (
        <div className="text-[11px] text-amber-200/60 mt-2">还有 {pending.length - 1} 个待处理的授权请求</div>
      )}
    </div>
  )
}

function summarizeInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2).slice(0, 2000)
  } catch {
    return String(input)
  }
}
