import { useState } from 'react'
import { useChat } from '../stores/chat'
import type { PermissionRequestInfo } from '@shared/types'

/** AskUserQuestion 的 questions[i] 结构（对应 CLI 工具入参 schema） */
interface AskQuestion {
  question: string
  header?: string
  options?: Array<{ label: string; description?: string }>
  multiSelect?: boolean
}

/** 工具授权横幅：CLI 通过控制协议请求人工授权时显示，用户选择允许/拒绝 */
export function PermissionBanner({ tabId }: { tabId: string }) {
  const pending = useChat((s) => s.tabs.find((t) => t.id === tabId)?.pendingPerms ?? [])
  const respondPermission = useChat((s) => s.respondPermission)
  if (pending.length === 0) return null

  const current: PermissionRequestInfo = pending[0]
  const questions = parseQuestions(current.input)
  if (questions) {
    return (
      <>
        <AskQuestionCard
          key={current.requestId}
          tabId={tabId}
          request={current}
          questions={questions}
        />
        {pending.length > 1 && (
          <div className="mx-auto max-w-4xl mb-2 text-[11px] text-slate-400">
            还有 {pending.length - 1} 个待处理的请求
          </div>
        )}
      </>
    )
  }
  return <ToolPermissionCard tabId={tabId} current={current} pendingCount={pending.length} />
}

function parseQuestions(input: Record<string, unknown>): AskQuestion[] | null {
  const qs = input?.questions
  if (!Array.isArray(qs) || qs.length === 0) return null
  return qs.filter(
    (q): q is AskQuestion => !!q && typeof q === 'object' && typeof (q as AskQuestion).question === 'string'
  )
}

/** AskUserQuestion 专用卡片：一题一页的分步问答（类 Cursor），单选自动进下一题 */
function AskQuestionCard({
  tabId,
  request,
  questions
}: {
  tabId: string
  request: PermissionRequestInfo
  questions: AskQuestion[]
}) {
  const respondPermission = useChat((s) => s.respondPermission)
  const total = questions.length
  const [step, setStep] = useState(0)
  const [selected, setSelected] = useState<Record<string, string[]>>({})
  const [note, setNote] = useState('')

  const q = questions[Math.min(step, total - 1)]
  const isLast = step >= total - 1
  const answered = Object.values(selected).some((a) => a.length > 0)

  const toggle = (label: string) => {
    const cur = selected[q.question] ?? []
    const isOn = cur.includes(label)
    const next = isOn ? cur.filter((l) => l !== label) : q.multiSelect ? [...cur, label] : [label]
    setSelected((prev) => ({ ...prev, [q.question]: next }))
    // 单选选中即自动进入下一题
    if (!q.multiSelect && !isOn && !isLast) setStep(step + 1)
  }

  const submit = () => {
    const answers: Record<string, string> = {}
    for (const [qq, labels] of Object.entries(selected)) {
      if (labels.length > 0) answers[qq] = labels.join(',')
    }
    const updatedInput: Record<string, unknown> = { ...request.input, answers }
    if (note.trim()) updatedInput.response = note.trim()
    void respondPermission(tabId, request.requestId, true, updatedInput)
  }

  return (
    <div className="mx-auto max-w-4xl mb-2 rounded-xl border border-sky-600/60 bg-sky-950/30 px-4 py-3">
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[15px] leading-none">💬</span>
          <span className="text-[13.5px] text-sky-100 font-medium">Claude 想向你确认几个问题</span>
        </div>
        {total > 1 && (
          <span className="text-[11.5px] text-sky-200/70">问题 {step + 1} / {total}</span>
        )}
      </div>
      {total > 1 && (
        <div className="h-0.5 rounded bg-slate-700/50 mb-2 overflow-hidden">
          <div
            className="h-full bg-sky-500 transition-all duration-200"
            style={{ width: `${((step + 1) / total) * 100}%` }}
          />
        </div>
      )}
      <div key={q.question}>
        {q.header && <div className="text-[12.5px] text-sky-200 font-semibold">{q.header}</div>}
        <div className="text-[13px] text-sky-100 mt-0.5">{q.question}</div>
        <div className={`flex flex-wrap gap-1.5 mt-1.5 ${q.multiSelect ? '' : 'flex-col'}`}>
          {(q.options ?? []).map((opt) => {
            const active = (selected[q.question] ?? []).includes(opt.label)
            return (
              <button
                key={opt.label}
                className={`px-3 py-2 rounded-lg border text-[12.5px] text-left transition-colors ${
                  active
                    ? 'border-sky-400 bg-sky-700/60 text-white'
                    : 'border-slate-600 bg-[#2c2f3d] hover:bg-[#3a3d4d] text-slate-200'
                }`}
                onClick={() => toggle(opt.label)}
              >
                <div className="font-medium">{opt.label}</div>
                {opt.description && (
                  <div className={`text-[11.5px] mt-0.5 ${active ? 'text-sky-100/80' : 'text-slate-400'}`}>
                    {opt.description}
                  </div>
                )}
              </button>
            )
          })}
        </div>
      </div>
      <input
        className="w-full mt-3 px-3 py-1.5 rounded-lg bg-black/30 border border-slate-600 text-[12.5px] text-slate-200 placeholder-slate-500 outline-none focus:border-sky-500"
        placeholder="补充说明（可选）"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <div className="flex items-center gap-2 mt-2.5">
        {total > 1 && (
          <>
            <button
              className={`px-3 py-1.5 rounded-lg text-[12.5px] transition-colors ${
                step === 0
                  ? 'bg-[#2a2d3a] text-slate-600 cursor-not-allowed'
                  : 'bg-[#3a3d4d] hover:bg-[#4a4e62] text-slate-200'
              }`}
              disabled={step === 0}
              onClick={() => setStep(step - 1)}
            >
              上一个
            </button>
            <button
              className={`px-3 py-1.5 rounded-lg text-[12.5px] transition-colors ${
                isLast
                  ? 'bg-[#2a2d3a] text-slate-600 cursor-not-allowed'
                  : 'bg-[#3a3d4d] hover:bg-[#4a4e62] text-slate-200'
              }`}
              disabled={isLast}
              onClick={() => setStep(step + 1)}
            >
              下一个
            </button>
          </>
        )}
        <div className="flex-1" />
        <button
          className="px-4 py-1.5 rounded-lg bg-[#3a3d4d] hover:bg-[#4a4e62] text-slate-200 text-[12.5px] transition-colors"
          onClick={() => void respondPermission(tabId, request.requestId, false)}
        >
          跳过
        </button>
        <button
          className={`px-4 py-1.5 rounded-lg text-white text-[12.5px] font-medium transition-colors ${
            answered
              ? 'bg-sky-700 hover:bg-sky-600'
              : 'bg-slate-700 text-slate-400 cursor-not-allowed'
          }`}
          disabled={!answered}
          onClick={submit}
        >
          提交回答
        </button>
      </div>
    </div>
  )
}

/** 普通工具授权卡片：原有样式与允许/拒绝逻辑 */
function ToolPermissionCard({
  tabId,
  current,
  pendingCount
}: {
  tabId: string
  current: PermissionRequestInfo
  pendingCount: number
}) {
  const respondPermission = useChat((s) => s.respondPermission)
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
      {pendingCount > 1 && (
        <div className="text-[11px] text-amber-200/60 mt-2">还有 {pendingCount - 1} 个待处理的授权请求</div>
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
