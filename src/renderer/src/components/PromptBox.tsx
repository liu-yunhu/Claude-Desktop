import { useRef, useState } from 'react'
import { useChat } from '../stores/chat'

/** 底部输入框：Enter 发送 / Shift+Enter 换行 / 运行中变停止按钮 */
export function PromptBox({ tabId, running }: { tabId: string; running: boolean }) {
  const [value, setValue] = useState('')
  const taRef = useRef<HTMLTextAreaElement>(null)
  const send = useChat((s) => s.send)
  const stop = useChat((s) => s.stop)

  const doSend = () => {
    const text = value.trim()
    if (!text || running) return
    setValue('')
    if (taRef.current) taRef.current.style.height = 'auto'
    void send(text)
  }

  return (
    <div className="border-t border-[#23252f] bg-[#181924] px-4 py-3">
      <div className="flex gap-2 items-end max-w-4xl mx-auto">
        <textarea
          ref={taRef}
          className="flex-1 resize-none bg-[#22242f] border border-[#33364a] rounded-xl px-4 py-3 text-[14px] leading-relaxed
            focus:outline-none focus:border-[#4a5785] placeholder:text-slate-600 max-h-48"
          rows={1}
          placeholder={running ? 'claude 正在执行…（可停止后继续输入）' : '向 Claude 发送消息…'}
          value={value}
          disabled={running}
          onChange={(e) => {
            setValue(e.target.value)
            // 自适应高度
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 192) + 'px'
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              doSend()
            }
          }}
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
