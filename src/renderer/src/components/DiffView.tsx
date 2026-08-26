/** Edit/Write 工具的 old_string/new_string 行级 diff 渲染 */

interface DiffViewProps {
  oldText?: string
  newText?: string
}

export function DiffView({ oldText, newText }: DiffViewProps) {
  const lines = computeDiffLines(oldText ?? '', newText ?? '')
  const addCount = lines.filter((l) => l.type === 'add').length
  const delCount = lines.filter((l) => l.type === 'del').length

  return (
    <div className="my-1">
      <div className="text-xs text-slate-400 mb-1">
        <span className="text-emerald-400">+{addCount}</span>{' '}
        <span className="text-rose-400">-{delCount}</span>
      </div>
      <pre className="text-[12.5px] leading-5 bg-[#101118] border border-[#2a2d3a] rounded-md overflow-x-auto max-h-96 overflow-y-auto">
        {lines.map((l, i) => (
          <div
            key={i}
            className={
              l.type === 'add' ? 'diff-add' : l.type === 'del' ? 'diff-del' : 'text-slate-400'
            }
          >
            <span className="inline-block w-6 select-none text-center opacity-60">{l.marker}</span>
            {l.text || ' '}
          </div>
        ))}
      </pre>
    </div>
  )
}

interface DiffLine {
  type: 'add' | 'del' | 'ctx'
  marker: string
  text: string
}

/** 简易 LCS 行 diff */
function computeDiffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n')
  const b = newText.split('\n')
  const n = a.length
  const m = b.length

  // 超长输入直接并排显示，避免 O(n*m) 爆内存
  if (n * m > 250000) {
    return [
      ...a.map((t) => ({ type: 'del' as const, marker: '-', text: t })),
      ...b.map((t) => ({ type: 'add' as const, marker: '+', text: t }))
    ]
  }

  // dp[i][j] = a[i:] 与 b[j:] 的 LCS 长度
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0))
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
    }
  }

  const out: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      out.push({ type: 'ctx', marker: ' ', text: a[i] })
      i++
      j++
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      out.push({ type: 'del', marker: '-', text: a[i] })
      i++
    } else {
      out.push({ type: 'add', marker: '+', text: b[j] })
      j++
    }
  }
  while (i < n) out.push({ type: 'del', marker: '-', text: a[i++] })
  while (j < m) out.push({ type: 'add', marker: '+', text: b[j++] })
  return out
}
