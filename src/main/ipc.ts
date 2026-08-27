import { ipcMain, dialog, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { RunnerRegistry } from './claude/runner'
import { listSessionHistory, renameSession, deleteSessionFile } from './claude/sessions'
import { readSessionTranscript } from './claude/transcript'
import { mcpApi } from './claude/mcp'
import { configApi } from './claude/config'
import type { SessionOptions } from '@shared/types'
import { appState } from './state'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const registry = new RunnerRegistry(
    (tabId, event) => getWindow()?.webContents.send('claude:event', { tabId, event }),
    (tabId, code, err) => getWindow()?.webContents.send('claude:exit', { tabId, code, err }),
    (info) =>
      getWindow()?.webContents.send('claude:permission', {
        tabId: info.tabId,
        requestId: info.requestId,
        toolName: info.toolName,
        input: info.input,
        title: info.title,
        description: info.description
      }),
    (requestId) => getWindow()?.webContents.send('claude:permission-cancel', { requestId })
  )

  // ---- 聊天 ----

  ipcMain.handle('claude:send', (_e, tabId: string, prompt: string, opts: SessionOptions) => {
    registry.ensure(tabId).send(prompt, opts)
    return { ok: true }
  })

  ipcMain.handle('claude:stop', (_e, tabId: string) => {
    return { ok: registry.get(tabId)?.kill() ?? false }
  })

  ipcMain.handle(
    'claude:permission-response',
    (_e, tabId: string, requestId: string, allow: boolean, denyMessage?: string) => {
      return { ok: registry.get(tabId)?.respondPermission(requestId, allow, denyMessage) ?? false }
    }
  )

  ipcMain.handle('claude:new-uuid', () => randomUUID())

  // ---- 会话历史 ----

  ipcMain.handle('sessions:list', () => listSessionHistory())
  ipcMain.handle('sessions:transcript', (_e, filePath: string) => readSessionTranscript(filePath))
  ipcMain.handle('sessions:rename', (_e, filePath: string, sessionId: string, newName: string) =>
    renameSession(filePath, sessionId, newName)
  )
  ipcMain.handle('sessions:delete', async (_e, filePath: string, title: string) => {
    const opts = {
      type: 'warning' as const,
      buttons: ['删除', '取消'],
      defaultId: 1, // 默认聚焦「取消」，防误删
      cancelId: 1,
      title: '删除会话',
      message: `确定删除会话「${title}」吗？`,
      detail: '将永久删除该会话文件，此操作不可恢复。'
    }
    const win = getWindow()
    const r = win ? await dialog.showMessageBox(win, opts) : await dialog.showMessageBox(opts)
    if (r.response !== 0) return { deleted: false }
    const res = await deleteSessionFile(filePath)
    return res.ok ? { deleted: true } : { deleted: false, error: res.error }
  })

  // ---- MCP ----

  ipcMain.handle('mcp:list', (_e, cwd?: string) => mcpApi.list(cwd))
  ipcMain.handle('mcp:get', (_e, name: string, cwd?: string) => mcpApi.get(name, cwd))
  ipcMain.handle('mcp:add', (_e, args: Parameters<typeof mcpApi.add>[0]) => mcpApi.add(args))
  ipcMain.handle('mcp:remove', (_e, name: string, cwd?: string) => mcpApi.remove(name, cwd))

  // ---- 配置 ----

  ipcMain.handle('config:read-user', () => configApi.readUserSettings())
  ipcMain.handle('config:write-user', (_e, content: string) => configApi.writeUserSettings(content))
  ipcMain.handle('config:read-app', () => configApi.readAppSettings())
  ipcMain.handle('config:write-app', (_e, settings: Record<string, unknown>) =>
    configApi.writeAppSettings(settings)
  )
  ipcMain.handle('config:health', () => configApi.healthCheck())

  // ---- 系统 ----

  ipcMain.handle('dialog:pick-dir', async () => {
    const r = await dialog.showOpenDialog(getWindow() ?? new BrowserWindow(), {
      properties: ['openDirectory', 'createDirectory']
    })
    return r.canceled ? null : r.filePaths[0]
  })

  ipcMain.handle('app:set-close-to-tray', (_e, enabled: boolean) => {
    appState.closeToTray = enabled
    return { ok: true }
  })
}
