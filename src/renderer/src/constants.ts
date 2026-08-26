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
