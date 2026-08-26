# Claude Desktop

Claude Code CLI 的桌面 GUI 封装。**所有交互均通过执行 `claude` CLI 命令完成** —— 应用本身不实现任何 AI 逻辑、不直连 API、不存储会话状态。

## 运行

```bash
npm install          # 首次
npm run dev          # 开发模式（热更新）
npm run build:win    # 打包 NSIS 安装包（首次会下载打包依赖，较慢）
```

> Windows 首次 `npm install` 后如提示 `electron` 二进制缺失，运行
> `npm approve-scripts electron esbuild && node node_modules/electron/install.js`。

## 原理

每条用户消息 = 一个 `claude` 子进程：

```
claude -p --output-format stream-json --verbose --include-partial-messages
       [--session-id <新会话 uuid>] 或 [--resume <上一轮 session_id>]
       [--model x] [--permission-mode y] [--effort z] [--allowedTools ...]
```

- prompt 走 **stdin**（不走 argv，规避 Windows shell 注入/转义问题）
- 逐行解析 stdout 的 stream-json 事件，IPC 推送渲染进程实时渲染
- 首轮用预生成的 `--session-id`，后续用返回的 `session_id` 做 `--resume` 串接
- 停止生成 = kill 子进程（会话已落盘，仍可 `--resume` 恢复）

## 功能

- 流式聊天 + thinking 折叠 + markdown/代码高亮
- 工具调用卡片（Edit/Write 行级 diff、Bash 命令、WebSearch 来源等）
- 多标签并行会话（各自独立工作目录 / 模型 / 权限）
- 会话历史侧栏（读取 `~/.claude/projects/` 的 CLI 会话文件，恢复走 `--resume`）
- 模型 / effort / 权限模式 / allowedTools / 附加目录 / 预算上限
- 费用与 token 统计（来自 result 事件）
- MCP 管理（`claude mcp list/add/remove`）
- `~/.claude/settings.json` 编辑 + `claude doctor` 健康检查
- 系统托盘 / 深色主题

## 目录结构

```
src/
  main/claude/    runner.ts（子进程/流解析）sessions.ts（历史）transcript.ts（转录）
                  mcp.ts command.ts config.ts
  main/           index.ts（窗口/托盘）ipc.ts（IPC handler）
  preload/        contextBridge 桥接
  renderer/src/   App + components（聊天/工具卡片/面板）+ stores（zustand 事件归约）
  shared/types.ts 主进程/渲染进程共享类型
```

## 已知限制

- `-p` 非交互模式没有权限弹窗：待授权工具会被直接拒绝。通过权限模式预设 + allowedTools 白名单弥补（设置栏可调）。
- 每条消息有 ~1–2s 进程冷启动（换取无状态、可恢复的稳健架构）。
- 斜杠命令（/compact 等）在 `-p` 模式不可用。
