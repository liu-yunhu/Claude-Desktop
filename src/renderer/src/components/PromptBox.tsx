import { useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useChat } from '../stores/chat'
import { SLASH_COMMANDS, type SlashCommand } from '../constants'

const HELP_TEXT = `可用斜杠命令：
${SLASH_COMMANDS.map((c) => `  ${c.name.padEnd(14)} ${c.desc}`).join('\n')}
注：标注「-p 模式不可用」的命令在 GUI（claude -p 非交互模式）下无法执行。`

/** 底部输入框：Enter 发送 / Shift+Enter 换行 / 运行中变停止按钮 / 斜杠命令提示 */
export function PromptBox({ tabId, running }: { tabId: string; running: boolean }) {
  const [value, setValue] = useState('')
  const [slashIndex, setSlashIndex] = useState(0)
  const taRef = useRef<HTMLTextAreaElement>(null)
  const send = useChat((s) => s.send)
  const stop = useChat((s) => s.stop)
  const newTab = useChat((s) => s.newTab)
  const setPanel = useChat((s) => s.setPanel)
  const insertSystemMessage = useChat((s) => s.insertSystemMessage)

  // 输入以 "/" 开头且无空格时，弹出命令提示
  const matches = useMemo(() => {
    if (!value.startsWith('/') || value.includes(' ') || value === '/') {
      return SLASH_COMMANDS
    }
    return SLASH_COMMANDS.filter((c) => c.name.startsWith(value))
  }, [value])

  const slashOpen = value.startsWith('/') && !value.includes(' ')

  const doSend = () => {
    const text = value.trim()
    if (!text || running) return
    setValue('')
    if (taRef.current) taRef.current.style.height = 'auto'
    void send(text)
  }

  const execLocal = (cmd: SlashCommand) => {
    switch (cmd.name) {
      case '/clear':
        void newTab()
        break
      case '/config':
        setPanel('config')
        break
      case '/mcp':
        setPanel('mcp')
        break
      case '/help':
        insertSystemMessage(tabId, HELP_TEXT)
        break
      case '/usage': {
        const t = useChat.getState().tabs.find((x) => x.id === tabId)
        insertSystemMessage(tabId, `本会话累计费用 $${(t?.totalCost ?? 0).toFixed(4)}（来自 result 事件统计）`)
        break
      }
      case '/doctor': {
        insertSystemMessage(tabId, '正在运行 claude doctor…')
        void window.api.config.healthCheck().then((r) => {
          insertSystemMessage(tabId, `claude --version\n${r.version}\n\nclaude doctor\n${r.doctor}`)
        })
        break
      }
      default:
        break
    }
  }

  const selectCommand = (cmd: SlashCommand) => {
    if (cmd.local) {
      execLocal(cmd)
      setValue('')
      if (taRef.current) taRef.current.style.height = 'auto'
    } else {
      setValue(cmd.name + ' ')
      taRef.current?.focus()
    }
  }

  const onKeyDown = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return
    if (slashOpen && matches.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setSlashIndex((i) => (i + 1) % matches.length)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setSlashIndex((i) => (i - 1 + matches.length) % matches.length)
        return
      }
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        selectCommand(matches[slashIndex])
        return
      }
      if (e.key === 'Escape') {
        e.preventDefault()
        setValue('')
        return
      }
      if (e.key === 'Tab') {
        e.preventDefault()
        selectCommand(matches[slashIndex])
        return
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      doSend()
    }
  }

  return (
    <div className="border-t border-[#23252f] bg-[#181924] px-4 py-3">
      <div className="relative flex gap-2 items-end max-w-4xl mx-auto">
        {/* 斜杠命令提示菜单 */}
        {slashOpen && matches.length > 0 && (
          <div className="absolute bottom-full left-0 mb-1.5 w-full max-w-md bg-[#22242f] border border-[#33364a] rounded-lg py-1 shadow-2xl z-20">
            {matches.map((c, i) => (
              <button
                key={c.name}
                className={`w-full text-left px-3 py-1.5 flex items-baseline gap-2 transition-colors ${
                  i === slashIndex ? 'bg-[#2d3145]' : ''
                } ${c.local ? '' : 'opacity-50'}`}
                onMouseEnter={() => setSlashIndex(i)}
                onClick={() => selectCommand(c)}
              >
                <span className="text-[12.5px] font-mono text-slate-100 shrink-0">{c.name}</span>
                <span className="text-[11.5px] text-slate-400 truncate">{c.desc}</span>
              </button>
            ))}
          </div>
        )}

        <textarea
          ref={taRef}
          className="flex-1 resize-none bg-[#22242f] border border-[#33364a] rounded-xl px-4 py-3 text-[14px] leading-relaxed
            focus:outline-none focus:border-[#4a5785] placeholder:text-slate-600 max-h-48"
          rows={1}
          placeholder={running ? 'claude 正在执行…（可停止后继续输入）' : '向 Claude 发送消息… 输入 / 查看命令'}
          value={value}
          disabled={running}
          onChange={(e) => {
            setValue(e.target.value)
            setSlashIndex(0)
            // 自适应高度
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 192) + 'px'
          }}
          onKeyDown={onKeyDown}
        />
        {running ? (
          <button
            className="shrink-0 h-11 px-5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white text-sm font-medium transition-colors"
            onClick={() => void stop()}
          >
            ■ 停止
          </button>
        ) : (
          <button
            className="shrink-0 h-11 px-5 rounded-xl bg-[#3d5aa5] hover:bg-[#4868bd] text-white text-sm font-medium transition-colors disabled:opacity-40"
            disabled={!value.trim()}
            onClick={doSend}
          >
            发送 ⏎
          </button>
        )}
      </div>
      <div className="text-[11px] text-slate-600 mt-1.5 text-center">
        每条消息通过 <code className="text-slate-500">claude -p --output-format stream-json</code> 子进程执行
      </div>
    </div>
  )
}
