import { useEffect, useState } from 'react'
import { useSettings } from '../stores/settings'

/** 应用设置面板（GUI 自身偏好，持久化到 ~/.claude/claude-desktop-settings.json） */
export function SettingsPanel({ onClose }: { onClose: () => void }) {
  const s = useSettings()
  const [workDir, setWorkDir] = useState(s.defaultWorkDir)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    void useSettings.getState().load()
  }, [])

  const doSave = async () => {
    try {
      await useSettings.getState().save({ defaultWorkDir: workDir })
      setSaveError('')
      setSaved(true)
      window.setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setSaveError(`保存失败: ${String(e)}`)
      setSaved(false)
    }
  }

  return (
    <Panel title="应用设置" onClose={onClose}>
      <Field label="默认工作目录（新会话的 cwd）">
        <div className="flex gap-2">
          <input
            className="flex-1 bg-[#1a1c26] border border-[#33364a] rounded-md px-3 py-1.5 text-[13px] font-mono focus:outline-none focus:border-[#4a5785]"
            value={workDir}
            onChange={(e) => setWorkDir(e.target.value)}
          />
          <button
            className="px-3 rounded-md bg-[#252836] hover:bg-[#2d3145] text-[12.5px]"
            onClick={async () => {
              const dir = await window.api.system.pickDir()
              if (dir) setWorkDir(dir)
            }}
          >
            浏览…
          </button>
        </div>
      </Field>

      <Field label="默认模型（--model）">
        <input
          className="w-full bg-[#1a1c26] border border-[#33364a] rounded-md px-3 py-1.5 text-[13px] focus:outline-none focus:border-[#4a5785] placeholder:text-slate-600"
          placeholder="留空 = 跟随 claude 配置，如 opus / sonnet / haiku"
          value={s.defaultModel}
          onChange={(e) => void s.save({ defaultModel: e.target.value })}
        />
      </Field>

      <Field label="默认权限模式（--permission-mode）">
        <select
          className="w-full bg-[#1a1c26] border border-[#33364a] rounded-md px-3 py-1.5 text-[13px]"
          value={s.defaultPermissionMode}
          onChange={(e) => void s.save({ defaultPermissionMode: e.target.value })}
        >
          <option value="default">default（手动确认）</option>
          <option value="acceptEdits">acceptEdits（自动接受编辑）</option>
          <option value="dontAsk">dontAsk（不询问）</option>
          <option value="plan">plan（计划模式）</option>
          <option value="bypassPermissions">bypassPermissions（危险）</option>
        </select>
      </Field>

      <Field label="行为">
        <label className="flex items-center gap-2 text-[13px] text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={s.closeToTray}
            onChange={(e) => void s.save({ closeToTray: e.target.checked })}
          />
          关闭窗口时最小化到系统托盘
        </label>
      </Field>

      <div className="mt-2 flex items-center gap-3">
        <button
          className="px-4 py-1.5 rounded-md bg-[#3d5aa5] hover:bg-[#4868bd] text-white text-[13px] transition-colors"
          onClick={() => void doSave()}
        >
          保存
        </button>
        {saved && <span className="text-[12.5px] text-emerald-400">✓ 已保存（对新会话生效）</span>}
        {saveError && <span className="text-[12.5px] text-rose-400">{saveError}</span>}
      </div>
    </Panel>
  )
}

/** MCP 服务器管理面板（claude mcp 命令封装） */
export function McpPanel({ onClose }: { onClose: () => void }) {
  const [output, setOutput] = useState('点击「刷新列表」执行 claude mcp list')
  const [busy, setBusy] = useState(false)
  const [name, setName] = useState('')
  const [transport, setTransport] = useState<'stdio' | 'sse' | 'http'>('http')
  const [urlOrCmd, setUrlOrCmd] = useState('')
  const [cmdArgs, setCmdArgs] = useState('')

  const run = async (fn: () => Promise<{ ok: boolean; output: string }>) => {
    setBusy(true)
    try {
      const r = await fn()
      setOutput(r.output || '(无输出)')
    } catch (e) {
      setOutput(`执行失败: ${String(e)}`)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Panel title="MCP 服务器（claude mcp）" onClose={onClose}>
      <div className="flex gap-2 mb-3">
        <button
          className="px-3 py-1.5 rounded-md bg-[#3d5aa5] hover:bg-[#4868bd] text-white text-[12.5px] disabled:opacity-50"
          disabled={busy}
          onClick={() => void run(() => window.api.mcp.list())}
        >
          刷新列表
        </button>
      </div>

      <div className="border border-[#2a2d3a] rounded-lg p-3 mb-3">
        <div className="text-[12px] text-slate-400 mb-2">添加服务器（claude mcp add）</div>
        <div className="grid grid-cols-[100px_1fr] gap-2 items-center">
          <span className="text-[12px] text-slate-500">名称</span>
          <input
            className="bg-[#1a1c26] border border-[#33364a] rounded-md px-2.5 py-1.5 text-[12.5px] focus:outline-none"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <span className="text-[12px] text-slate-500">类型</span>
          <select
            className="bg-[#1a1c26] border border-[#33364a] rounded-md px-2.5 py-1.5 text-[12.5px]"
            value={transport}
            onChange={(e) => setTransport(e.target.value as 'stdio' | 'sse' | 'http')}
          >
            <option value="http">HTTP</option>
            <option value="sse">SSE</option>
            <option value="stdio">stdio</option>
          </select>
          <span className="text-[12px] text-slate-500">{transport === 'stdio' ? '命令' : 'URL'}</span>
          <input
            className="bg-[#1a1c26] border border-[#33364a] rounded-md px-2.5 py-1.5 text-[12.5px] font-mono focus:outline-none"
            placeholder={transport === 'stdio' ? 'npx' : 'http://127.0.0.1:3000/mcp'}
            value={urlOrCmd}
            onChange={(e) => setUrlOrCmd(e.target.value)}
          />
          {transport === 'stdio' && (
            <>
              <span className="text-[12px] text-slate-500">参数</span>
              <input
                className="bg-[#1a1c26] border border-[#33364a] rounded-md px-2.5 py-1.5 text-[12.5px] font-mono focus:outline-none"
                placeholder="-y @some/mcp-server"
                value={cmdArgs}
                onChange={(e) => setCmdArgs(e.target.value)}
              />
            </>
          )}
        </div>
        <div className="flex gap-2 mt-2.5">
          <button
            className="px-3 py-1 rounded-md bg-[#2c5a3a] hover:bg-[#367049] text-white text-[12px] disabled:opacity-50"
            disabled={busy || !name || !urlOrCmd}
            onClick={() =>
              void run(() =>
                window.api.mcp.add({
                  name,
                  transport,
                  command: transport === 'stdio' ? urlOrCmd : undefined,
                  url: transport !== 'stdio' ? urlOrCmd : undefined,
                  args: transport === 'stdio' ? cmdArgs.split(' ').filter(Boolean) : undefined,
                  scope: 'user'
                })
              )
            }
          >
            添加（user 作用域）
          </button>
        </div>
      </div>

      <div className="flex gap-2 mb-2">
        <input
          className="flex-1 bg-[#1a1c26] border border-[#33364a] rounded-md px-2.5 py-1.5 text-[12.5px] focus:outline-none"
          placeholder="按名称删除（claude mcp remove）"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          className="px-3 py-1 rounded-md bg-[#5a2c2c] hover:bg-[#703636] text-white text-[12px] disabled:opacity-50"
          disabled={busy || !name}
          onClick={() => void run(() => window.api.mcp.remove(name))}
        >
          删除
        </button>
      </div>

      <pre className="text-[12px] text-slate-300 bg-[#101118] border border-[#2a2d3a] rounded-md p-3 max-h-72 overflow-auto whitespace-pre-wrap">
        {output}
      </pre>
    </Panel>
  )
}

/** CLI 配置面板：~/.claude/settings.json 编辑 + 健康检查 */
export function ConfigPanel({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState('加载中…')
  const [status, setStatus] = useState('')
  const [health, setHealth] = useState('')

  useEffect(() => {
    void window.api.config.readUserSettings().then(setContent)
  }, [])

  return (
    <Panel title="CLI 配置（~/.claude/settings.json）" onClose={onClose}>
      <div className="text-[12px] text-slate-500 mb-2">
        直接编辑 Claude Code 的全局配置文件（permissions、env、hooks 等）
      </div>
      <textarea
        className="w-full h-72 bg-[#101118] border border-[#33364a] rounded-md p-3 text-[12.5px] font-mono focus:outline-none focus:border-[#4a5785] resize-none"
        spellCheck={false}
        value={content}
        onChange={(e) => setContent(e.target.value)}
      />
      <div className="flex items-center gap-2 mt-2">
        <button
          className="px-3 py-1.5 rounded-md bg-[#3d5aa5] hover:bg-[#4868bd] text-white text-[12.5px]"
          onClick={async () => {
            const r = await window.api.config.writeUserSettings(content)
            setStatus(r.ok ? '✓ 已保存' : `✕ ${r.error}`)
          }}
        >
          保存
        </button>
        <button
          className="px-3 py-1.5 rounded-md bg-[#252836] hover:bg-[#2d3145] text-[12.5px]"
          onClick={async () => {
            setStatus('检测中…')
            const r = await window.api.config.healthCheck()
            setHealth(`${r.version}\n\n${r.doctor}`)
            setStatus('')
          }}
        >
          健康检查（claude doctor）
        </button>
        <span className="text-[12px] text-slate-400">{status}</span>
      </div>
      {health && (
        <pre className="mt-2 text-[12px] text-slate-300 bg-[#101118] border border-[#2a2d3a] rounded-md p-3 max-h-60 overflow-auto whitespace-pre-wrap">
          {health}
        </pre>
      )}
    </Panel>
  )
}

/* ---------- 通用 ---------- */

function Panel({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-40" onClick={onClose}>
      <div
        className="bg-[#1b1d29] border border-[#33364a] rounded-xl w-[640px] max-w-[92vw] max-h-[85vh] overflow-y-auto p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-[15px] font-semibold text-slate-100">{title}</h2>
          <button className="text-slate-500 hover:text-slate-200 text-lg" onClick={onClose}>
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3.5">
      <div className="text-[12px] text-slate-400 mb-1.5">{label}</div>
      {children}
    </div>
  )
}
