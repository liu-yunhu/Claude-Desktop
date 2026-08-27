import { useEffect } from 'react'
import { useChat } from './stores/chat'
import { useSettings } from './stores/settings'
import { TabBar } from './components/TabBar'
import { SessionSidebar } from './components/SessionSidebar'
import { SessionSettingsBar } from './components/SessionSettingsBar'
import { ChatView } from './components/ChatView'
import { SettingsPanel, McpPanel, ConfigPanel } from './components/Panels'

// 模块级标志：newTab 是异步的（内部 await newUuid 后才 set），
// StrictMode 双触发时两轮 effect 都会读到 tabs.length===0，导致重复建标签页。
// 用同步标志保证启动阶段只建一次。
let bootstrapped = false

export default function App() {
  const panel = useChat((s) => s.panel)
  const setPanel = useChat((s) => s.setPanel)
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
    if (!bootstrapped) {
      bootstrapped = true
      void newTab()
    }

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
