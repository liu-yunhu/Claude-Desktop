import { useEffect, useState } from 'react'
import { useChat } from './stores/chat'
import { useSettings } from './stores/settings'
import { TabBar } from './components/TabBar'
import { SessionSidebar } from './components/SessionSidebar'
import { SessionSettingsBar } from './components/SessionSettingsBar'
import { ChatView } from './components/ChatView'
import { SettingsPanel, McpPanel, ConfigPanel } from './components/Panels'

type PanelKind = 'settings' | 'mcp' | 'config' | null

export default function App() {
  const [panel, setPanel] = useState<PanelKind>(null)
  const tabs = useChat((s) => s.tabs)
  const activeTabId = useChat((s) => s.activeTabId)
  const newTab = useChat((s) => s.newTab)

  // 启动：加载设置 + 订阅主进程事件 + 建第一个标签页
  useEffect(() => {
    void useSettings.getState().load()

    const offEvent = window.api.claude.onEvent(({ tabId, event }) => {
      useChat.getState().applyEvent(tabId, event)
    })
    const offExit = window.api.claude.onExit(({ tabId, code, err }) => {
      useChat.getState().handleExit(tabId, code, err)
    })
    // StrictMode 下 effect 会双触发，仅在没有标签页时自动创建
    if (useChat.getState().tabs.length === 0) void newTab()

    return () => {
      offEvent()
      offExit()
    }
  }, [newTab])

  const activeTab = tabs.find((t) => t.id === activeTabId)

  return (
    <div className="h-full flex flex-col bg-[#16171f]">
      <TabBar />
      <div className="flex flex-1 min-h-0">
        <SessionSidebar onOpenPanel={setPanel} />
        <div className="flex flex-col flex-1 min-w-0">
          {activeTab ? (
            <>
              <SessionSettingsBar tabId={activeTab.id} />
              <ChatView tabId={activeTab.id} />
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-500">
              没有打开的会话，点击左上角「新建会话」
            </div>
          )}
        </div>
      </div>

      {panel === 'settings' && <SettingsPanel onClose={() => setPanel(null)} />}
      {panel === 'mcp' && <McpPanel onClose={() => setPanel(null)} />}
      {panel === 'config' && <ConfigPanel onClose={() => setPanel(null)} />}
    </div>
  )
}
