import { ipcMain, dialog, BrowserWindow } from 'electron'
import { randomUUID } from 'crypto'
import { RunnerRegistry } from './claude/runner'
import { listSessionHistory, renameSession } from './claude/sessions'
import { readSessionTranscript } from './claude/transcript'
import { mcpApi } from './claude/mcp'
import { configApi } from './claude/config'
import type { SessionOptions } from '@shared/types'
import { appState } from './state'

export function registerIpc(getWindow: () => BrowserWindow | null): void {
  const registry = new RunnerRegistry(
    (tabId, event) => getWindow()?.webContents.send('claude:event', { tabId, event }),
    (tabId, code, err) => getWindow()?.webContents.send('claude:exit', { tabId, code, err })
  )

  // ---- 聊天 ----

  ipcMain.handle('claude:send', (_e, tabId: string, prompt: string, opts: SessionOptions) => {
    registry.ensure(tabId).send(prompt, opts)
    return { ok: true }
  })

  ipcMain.handle('claude:stop', (_e, tabId: string) => {
    return { ok: registry.get(tabId)?.kill() ?? false }
  })

  ipcMain.handle('claude:new-uuid', () => randomUUID())

  // ---- 会话历史 ----

  ipcMain.handle('sessions:list', () => listSessionHistory())
  ipcMain.handle('sessions:transcript', (_e, filePath: string) => readSessionTranscript(filePath))
  ipcMain.handle('sessions:rename', (_e, filePath: string, sessionId: string, newName: string) =>
    renameSession(filePath, sessionId, newName)
  )

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
