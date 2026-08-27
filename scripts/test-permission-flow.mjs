// 端到端验证：--permission-prompt-tool stdio 控制协议闭环
// 收到 can_use_tool 自动允许，断言 Bash 工具真实执行并正常出结果
// 用法: node scripts/test-permission-flow.mjs
import { spawn } from 'child_process'
import { createInterface } from 'readline'

const child = spawn(
  'claude -p --output-format stream-json --input-format stream-json --permission-prompt-tool stdio --permission-mode manual --verbose --model haiku',
  { shell: true, cwd: process.cwd(), windowsHide: true }
)

let sawPermission = false
let sawToolUse = false
let sawToolResult = false
let sawResult = false
let initSent = false
let exitCode = 1

const rl = createInterface({ input: child.stdout })
rl.on('line', (line) => {
  if (!line.trim()) return
  let o
  try {
    o = JSON.parse(line)
  } catch {
    return
  }

  if (o.type === 'system' && o.subtype === 'init') {
    console.log('[init] session', o.session_id)
  }

  if (o.type === 'control_request' && o.request?.subtype === 'can_use_tool') {
    sawPermission = true
    console.log('[perm request]', o.request.tool_name, JSON.stringify(o.request.input))
    const resp = JSON.stringify({
      type: 'control_response',
      response: {
        subtype: 'success',
        request_id: o.request_id,
        response: { behavior: 'allow', updatedInput: o.request.input }
      }
    })
    child.stdin.write(resp + '\n')
    console.log('[perm -> allow]')
    return
  }
  if (o.type === 'control_request') {
    // 其他控制请求（不应出现）：一律拒绝以免挂起
    child.stdin.write(
      JSON.stringify({
        type: 'control_response',
        response: { subtype: 'success', request_id: o.request_id, response: { behavior: 'deny', message: 'test deny' } }
      }) + '\n'
    )
    return
  }
  if (o.type === 'control_response') return

  if (o.type === 'assistant' && o.message?.content) {
    for (const b of o.message.content) {
      if (b.type === 'tool_use') {
        sawToolUse = true
        console.log('[tool_use]', b.name)
      }
    }
  }
  if (o.type === 'user' && o.message?.content) {
    for (const b of o.message.content) {
      if (b.type === 'tool_result') {
        sawToolResult = true
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content)
        console.log('[tool_result]', b.is_error ? 'ERROR' : 'ok', String(text).slice(0, 120))
      }
    }
  }
  if (o.type === 'result') {
    sawResult = true
    console.log(
      `[result] subtype=${o.subtype} cost=$${o.total_cost_usd} denials=${o.permission_denials?.length ?? 0}`
    )
    child.stdin.end()
  }
})

child.stderr.on('data', (d) => process.stderr.write('[stderr] ' + d))
child.on('error', (e) => {
  console.error('[spawn error]', e)
  process.exit(1)
})
child.on('close', (code) => {
  exitCode = code ?? 1
  console.log('[exit]', code)
  report()
})

// 握手 + 用户消息
child.stdin.write(JSON.stringify({ type: 'control_request', request_id: 'init-1', request: { subtype: 'initialize' } }) + '\n')
child.stdin.write(
  JSON.stringify({
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: '请运行 bash 命令 echo hello-permission-e2e 并告诉我输出。' }] }
  }) + '\n'
)

const timer = setTimeout(() => {
  console.error('[timeout] 120s 未完成')
  try { child.kill() } catch {}
  process.exit(1)
}, 120000)

function report() {
  clearTimeout(timer)
  const ok = sawPermission && sawToolUse && sawToolResult && sawResult
  console.log('---')
  console.log(`permission_request=${sawPermission} tool_use=${sawToolUse} tool_result=${sawToolResult} result=${sawResult}`)
  console.log(ok ? 'E2E PASS' : 'E2E FAIL')
  process.exit(ok && exitCode === 0 ? 0 : 1)
}
