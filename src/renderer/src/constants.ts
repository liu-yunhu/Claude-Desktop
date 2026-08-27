export const MODELS = [
  { value: '', label: '默认（跟随配置）' },
  { value: 'opus', label: 'Opus（最强）' },
  { value: 'sonnet', label: 'Sonnet（均衡）' },
  { value: 'haiku', label: 'Haiku（最快）' },
  { value: 'fable', label: 'Fable' }
]

export const EFFORTS = [
  { value: '', label: '默认' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'XHigh' },
  { value: 'max', label: 'Max' }
]

export const PERMISSION_MODES = [
  { value: 'default', label: 'default（手动确认）', desc: '每次工具调用都需授权' },
  { value: 'acceptEdits', label: 'acceptEdits（自动接受编辑）', desc: '文件编辑免确认' },
  { value: 'dontAsk', label: 'dontAsk（不询问）', desc: '除危险操作外不询问' },
  { value: 'plan', label: 'plan（计划模式）', desc: '只读分析，不改文件' },
  { value: 'auto', label: 'auto（自动）', desc: '自动选择合适时机确认' },
  {
    value: 'bypassPermissions',
    label: 'bypassPermissions（跳过全部权限，危险）',
    desc: '等同 --dangerously-skip-permissions'
  }
]

export const COMMON_TOOLS = [
  'Bash',
  'Edit',
  'Write',
  'Read',
  'Glob',
  'Grep',
  'WebSearch',
  'WebFetch',
  'NotebookEdit',
  'Task',
  'TodoWrite'
]

export type PanelKind = 'settings' | 'mcp' | 'config' | null

/** 斜杠命令提示。local = GUI 内可直接执行；否则 -p 模式不可用，仅填入文本 */
export interface SlashCommand {
  name: string
  desc: string
  local?: boolean
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/clear', desc: '清空当前会话（新建空白会话）', local: true },
  { name: '/config', desc: '打开 CLI 配置（settings.json）', local: true },
  { name: '/mcp', desc: '管理 MCP 服务器', local: true },
  { name: '/help', desc: '显示帮助', local: true },
  { name: '/usage', desc: '查看本会话费用统计', local: true },
  { name: '/doctor', desc: '运行 claude doctor 健康检查', local: true },
  { name: '/model', desc: '切换模型（见上方设置栏）' },
  { name: '/rename', desc: '重命名会话（右键侧栏条目）' },
  { name: '/resume', desc: '查看 / 恢复会话（见左侧栏）' },
  { name: '/compact', desc: '压缩上下文（-p 模式不可用）' },
  { name: '/agents', desc: '后台代理（-p 模式不可用）' },
  { name: '/permissions', desc: '权限设置（-p 模式不可用）' }
]
