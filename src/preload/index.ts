import { contextBridge, ipcRenderer } from 'electron'
import type { ClaudeStreamEvent, SessionOptions, SessionHistoryItem } from '../shared/types'

const api = {
  // 聊天
  claude: {
    send: (tabId: string, prompt: string, opts: SessionOptions) =>
      ipcRenderer.invoke('claude:send', tabId, prompt, opts),
    stop: (tabId: string) => ipcRenderer.invoke('claude:stop', tabId),
    respondPermission: (
      tabId: string,
      requestId: string,
      allow: boolean,
      denyMessage?: string,
      updatedInput?: Record<string, unknown>
    ) =>
      ipcRenderer.invoke(
        'claude:permission-response',
        tabId,
        requestId,
        allow,
        denyMessage,
        updatedInput
      ) as Promise<{ ok: boolean }>,
    onPermissionRequest: (
      cb: (p: {
        tabId: string
        requestId: string
        toolName: string
        input: Record<string, unknown>
        title?: string
        description?: string
      }) => void
    ) => {
      const listener = (_e: unknown, p: Parameters<typeof cb>[0]) => cb(p)
      ipcRenderer.on('claude:permission', listener as never)
      return () => ipcRenderer.removeListener('claude:permission', listener as never)
    },
    onPermissionCancel: (cb: (p: { requestId: string }) => void) => {
      const listener = (_e: unknown, p: { requestId: string }) => cb(p)
      ipcRenderer.on('claude:permission-cancel', listener as never)
      return () => ipcRenderer.removeListener('claude:permission-cancel', listener as never)
    },
    newUuid: () => ipcRenderer.invoke('claude:new-uuid'),
    onEvent: (cb: (payload: { tabId: string; event: ClaudeStreamEvent }) => void) => {
      const listener = (_e: unknown, payload: { tabId: string; event: ClaudeStreamEvent }) => cb(payload)
      ipcRenderer.on('claude:event', listener as never)
      return () => ipcRenderer.removeListener('claude:event', listener as never)
    },
    onExit: (cb: (payload: { tabId: string; code: number | null; err?: string }) => void) => {
      const listener = (_e: unknown, payload: { tabId: string; code: number | null; err?: string }) =>
        cb(payload)
      ipcRenderer.on('claude:exit', listener as never)
      return () => ipcRenderer.removeListener('claude:exit', listener as never)
    }
  },

  // 会话历史
  sessions: {
    list: () => ipcRenderer.invoke('sessions:list') as Promise<SessionHistoryItem[]>,
    transcript: (filePath: string) =>
      ipcRenderer.invoke('sessions:transcript', filePath) as Promise<
        Array<{
          role: 'user' | 'assistant'
          text?: string
          thinking?: string
          tools: Array<{
            id: string
            name: string
            input?: Record<string, unknown>
            status: 'running' | 'done' | 'error'
            result?: string
          }>
          model?: string
        }>
      >,
    rename: (filePath: string, sessionId: string, newName: string) =>
      ipcRenderer.invoke('sessions:rename', filePath, sessionId, newName) as Promise<{
        ok: boolean
        error?: string
      }>,
    delete: (filePath: string, title: string) =>
      ipcRenderer.invoke('sessions:delete', filePath, title) as Promise<{
        deleted: boolean
        error?: string
      }>,
    openInTerminal: (sessionId: string, cwd: string) =>
      ipcRenderer.invoke('sessions:open-in-terminal', sessionId, cwd) as Promise<{ ok: boolean }>
  },

  // MCP 管理
  mcp: {
    list: (cwd?: string) => ipcRenderer.invoke('mcp:list', cwd) as Promise<{ ok: boolean; output: string }>,
    get: (name: string, cwd?: string) =>
      ipcRenderer.invoke('mcp:get', name, cwd) as Promise<{ ok: boolean; output: string }>,
    add: (args: unknown) => ipcRenderer.invoke('mcp:add', args) as Promise<{ ok: boolean; output: string }>,
    remove: (name: string, cwd?: string) =>
      ipcRenderer.invoke('mcp:remove', name, cwd) as Promise<{ ok: boolean; output: string }>
  },

  // 配置
  config: {
    readUserSettings: () => ipcRenderer.invoke('config:read-user') as Promise<string>,
    writeUserSettings: (content: string) =>
      ipcRenderer.invoke('config:write-user', content) as Promise<{ ok: boolean; error?: string }>,
    readAppSettings: () => ipcRenderer.invoke('config:read-app') as Promise<Record<string, unknown>>,
    writeAppSettings: (settings: Record<string, unknown>) => ipcRenderer.invoke('config:write-app', settings),
    healthCheck: () =>
      ipcRenderer.invoke('config:health') as Promise<{ version: string; doctor: string }>
  },

  // 系统
  system: {
    pickDir: () => ipcRenderer.invoke('dialog:pick-dir') as Promise<string | null>,
    setCloseToTray: (enabled: boolean) => ipcRenderer.invoke('app:set-close-to-tray', enabled)
  }
}

export type Api = typeof api

contextBridge.exposeInMainWorld('api', api)
