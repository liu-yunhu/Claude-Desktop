import { useState } from 'react'
import type { ToolCall } from '../stores/chat'
import { DiffView } from './DiffView'

const TOOL_COLORS: Record<string, string> = {
  Bash: '#e0af68',
  Edit: '#9ece6a',
  Write: '#9ece6a',
  Read: '#7aa2f7',
  Glob: '#7dcfff',
  Grep: '#7dcfff',
  WebSearch: '#bb9af7',
  WebFetch: '#bb9af7',
  Task: '#ff9e64',
  NotebookEdit: '#9ece6a'
}

/** 工具调用卡片：按工具类型展示入参摘要 + 可展开详情 + 结果 */
export function ToolCard({ tool }: { tool: ToolCall }) {
  const [open, setOpen] = useState(false)
  const color = TOOL_COLORS[tool.name] ?? '#8b90a0'
  const statusIcon = tool.status === 'running' ? '⏳' : tool.status === 'error' ? '✕' : '✓'
  const statusColor =
    tool.status === 'running' ? 'text-amber-400' : tool.status === 'error' ? 'text-rose-400' : 'text-emerald-400'

  const summary = toolSummary(tool)
  const isDiffTool = tool.name === 'Edit' || tool.name === 'Write' || tool.name === 'NotebookEdit'

  return (
    <div className="my-1.5 border border-[#2a2d3a] rounded-lg bg-[#1b1d29] overflow-hidden">
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#22243350] transition-colors"
        onClick={() => setOpen(!open)}
      >
        <span className={`text-xs ${statusColor} ${tool.status === 'running' ? 'animate-pulse' : ''}`}>
          {statusIcon}
        </span>
        <span className="text-xs font-semibold" style={{ color }}>
          {tool.name}
        </span>
        <span className="text-xs text-slate-400 truncate flex-1 font-mono">{summary}</span>
        {tool.isError && <span className="text-[11px] text-rose-400">错误</span>}
        <span className="text-slate-500 text-xs">{open ? '▾' : '▸'}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 border-t border-[#2a2d3a]">
          {/* 入参 */}
          {isDiffTool ? (
            <DiffView oldText={str(tool.input?.old_string)} newText={str(tool.input?.new_string)} />
          ) : null}
          {tool.name === 'Edit' && tool.input?.file_path ? (
            <div className="text-xs text-slate-400 mt-1 font-mono">文件: {str(tool.input.file_path)}</div>
          ) : null}
          {tool.name === 'Write' && tool.input?.file_path ? (
            <div className="text-xs text-slate-400 mt-1 font-mono">文件: {str(tool.input.file_path)}</div>
          ) : null}
          {!isDiffTool && tool.input && (
            <pre className="text-[12px] text-slate-300 bg-[#101118] rounded-md p-2 mt-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all">
              {formatInput(tool.input)}
            </pre>
          )}

          {/* 结果 */}
          {tool.result !== undefined && (
            <div className="mt-2">
              <div className="text-[11px] text-slate-500 mb-1">结果{tool.isError ? '（错误）' : ''}</div>
              <pre
                className={`text-[12px] rounded-md p-2 overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap break-all ${
                  tool.isError ? 'text-rose-300 bg-rose-950/30' : 'text-slate-300 bg-[#101118]'
                }`}
              >
                {tool.result?.slice(0, 5000) || '(空)'}
              </pre>
            </div>
          )}
          {tool.status === 'running' && (
            <div className="text-xs text-amber-400/80 mt-2 animate-pulse">执行中…</div>
          )}
        </div>
      )}
    </div>
  )
}

function toolSummary(tool: ToolCall): string {
  const i = tool.input ?? {}
  switch (tool.name) {
    case 'Bash':
      return str(i.command) || '(command)'
    case 'Edit':
    case 'Write':
    case 'Read':
      return str(i.file_path) || '(file)'
    case 'Glob':
      return str(i.pattern) || '(pattern)'
    case 'Grep':
      return str(i.pattern) || '(pattern)'
    case 'WebSearch':
      return str(i.query) || '(query)'
    case 'WebFetch':
      return str(i.url) || '(url)'
    case 'Task':
      return `${str(i.description) || '(task)'}`
    default:
      return Object.keys(i).slice(0, 3).join(', ')
  }
}

function str(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

function formatInput(input: Record<string, unknown>): string {
  try {
    return JSON.stringify(input, null, 2)
  } catch {
    return String(input)
  }
}
