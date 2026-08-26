import { spawn } from 'child_process'

/** 以命令方式运行 claude 子命令，收集 stdout/stderr（用于 mcp / doctor / version 等管理操作） */
export function runClaudeCommand(
  args: string[],
  opts: { cwd?: string; timeoutMs?: number } = {}
): Promise<{ code: number | null; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const full = ['claude', ...args.map((a) => quote(a))].join(' ')
    const child = spawn(full, {
      shell: true,
      cwd: opts.cwd || process.cwd(),
      windowsHide: true,
      env: { ...process.env, FORCE_COLOR: '0' },
      stdio: ['ignore', 'pipe', 'pipe']
    })
    let stdout = ''
    let stderr = ''
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          try {
            child.kill()
          } catch {}
        }, opts.timeoutMs)
      : null
    child.stdout?.on('data', (d) => (stdout += d.toString('utf8')))
    child.stderr?.on('data', (d) => (stderr += d.toString('utf8')))
    child.on('error', (err) => {
      if (timer) clearTimeout(timer)
      resolve({ code: null, stdout, stderr: stderr + String(err) })
    })
    child.on('close', (code) => {
      if (timer) clearTimeout(timer)
      resolve({ code, stdout, stderr })
    })
  })
}

function quote(a: string): string {
  return /^[\w.,:\/\\@#%^=+-]*$/.test(a) ? a : `"${a.replace(/"/g, '""')}"`
}
