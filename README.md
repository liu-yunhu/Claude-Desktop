# Claude Desktop

Claude Code CLI 的桌面 GUI 封装。

**核心原则：所有操作均通过执行 `claude` CLI 命令完成。** 应用本身不实现任何 AI 逻辑、不直连 API、不存储会话状态——它只是把 `claude` 命令封装成图形界面。

## 特性

- **流式聊天**：逐 token 输出、thinking 折叠、markdown + 代码高亮
- **工具可视化**：Edit/Write 显示行级 diff、Bash 显示命令与输出、WebSearch 显示来源
- **多标签会话**：每个标签页独立的工作目录 / 模型 / 权限模式 / 子进程
- **会话历史**：读取 `~/.claude/projects/` 下的 CLI 会话文件，恢复走 `claude --resume`
- **会话参数**：模型、effort、权限模式、allowedTools 白名单、附加目录、每轮预算上限
- **费用统计**：每轮 / 每会话的美元成本与 token 用量（来自 result 事件）
- **MCP 管理**：`claude mcp list / add / remove` 的面板封装
- **配置管理**：`~/.claude/settings.json` 编辑 + `claude doctor` 健康检查
- **系统集成**：关闭到托盘、深色主题

## 技术栈

| 层 | 技术 |
|---|---|
| 桌面框架 | Electron 44 |
| 构建 | electron-vite + TypeScript |
| 前端 | React 19 + Tailwind CSS 4 + zustand |
| 渲染 | react-markdown + remark-gfm + rehype-highlight |
| 打包 | electron-builder（NSIS） |

## 快速开始

### 前置条件

- Node.js ≥ 20，npm
- 已安装并登录 [Claude Code](https://docs.anthropic.com/claude-code)（`claude` 命令可用）

### 开发

```bash
npm install
npm run dev
```

> Windows 首次 `npm install` 后如提示 electron 二进制缺失（allow-scripts 拦截），执行：
> `npm approve-scripts electron esbuild && node node_modules/electron/install.js`

### 打包

```bash
npm run build:win
```

产物输出到 `dist/`。首次打包需联网下载 electron-builder 的 NSIS 依赖，耗时较长。

## 工作原理

每条用户消息对应一个 `claude` 子进程：

```
claude -p --output-format stream-json --verbose --include-partial-messages
       [--session-id <新会话 uuid>]  或  [--resume <上一轮 session_id>]
       [--model x] [--permission-mode y] [--effort z] [--allowedTools ...]
       [--add-dir ...] [--max-budget-usd n]
```

- **prompt 走 stdin**，不走 argv——规避 Windows 下 `.cmd` shim 的 shell 转义与命令注入问题
- 主进程逐行解析 stdout 的 stream-json 事件，经 IPC 推送给渲染进程实时渲染
- 首轮用预生成的 `--session-id`（UUID），后续轮次用返回的 `session_id` 做 `--resume` 串接
- **停止生成 = kill 子进程**；会话已落盘，中断后仍可 `--resume` 恢复

### GUI 操作 → CLI 命令映射

| GUI 操作 | 实际执行的命令 |
|---|---|
| 发送消息 | `claude -p --output-format stream-json ...`（prompt 经 stdin） |
| 继续会话 | 追加 `--resume <session_id>` |
| 切换模型 | 追加 `--model <alias>` |
| 切换 effort | 追加 `--effort <level>` |
| 权限模式 | 追加 `--permission-mode <mode>` |
| 工具白名单 | 追加 `--allowedTools <tools>` |
| 会话历史列表 | 读取 `~/.claude/projects/*/*.jsonl`（CLI 无列会话命令，唯一读文件操作） |
| 恢复历史消息 | 解析会话 JSONL 文件（只读） |
| MCP 列表/添加/删除 | `claude mcp list / add / remove` |
| 编辑全局配置 | 读写 `~/.claude/settings.json` |
| 健康检查 | `claude --version` + `claude doctor` |

## 目录结构

```
src/
  main/claude/
    runner.ts      # 子进程 spawn / stream-json 流解析 / kill
    sessions.ts    # 会话历史列表（读 ~/.claude/projects）
    transcript.ts  # 会话转录（重建历史消息）
    mcp.ts         # claude mcp 命令封装
    command.ts     # 通用 claude 子命令执行器
    config.ts      # settings.json 读写 + 健康检查
  main/
    index.ts       # 窗口 / 托盘 / 生命周期
    ipc.ts         # IPC handler 注册
    state.ts       # 主进程共享状态
  preload/index.ts # contextBridge 桥接
  renderer/src/
    App.tsx        # 多标签布局
    components/    # 聊天 / 工具卡片 / diff / 面板 / 侧栏
    stores/        # zustand：事件归约 + 设置
  shared/types.ts  # 主进程 / 渲染进程共享类型
resources/icon.png # 应用图标
```

## 配置

- **GUI 自身设置**：`~/.claude/claude-desktop-settings.json`（默认工作目录、默认模型、托盘偏好等）
- **Claude Code 全局配置**：`~/.claude/settings.json`（可在「CLI 配置」面板中直接编辑）

## 已知限制

- `-p` 非交互模式**没有权限弹窗**：待授权工具会被直接拒绝。通过「权限模式 + allowedTools 白名单」弥补（会话设置栏可调，选中 `bypassPermissions` 有红色警告）。
- 每条消息有约 1–2s 的进程冷启动（换取无状态、可恢复的稳健架构）。
- 斜杠命令（`/compact`、`/clear` 等）在 `-p` 模式不可用。
