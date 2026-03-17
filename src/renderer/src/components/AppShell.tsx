import { useMemo } from 'react'
import { useAppState, useAppDispatch } from '../state/AppContext'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useLayoutPersistence, createLocalStorage } from '../hooks/useLayoutPersistence'
import { useAgentManager } from '../hooks/useAgentManager'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import BottomBar from './BottomBar'
import { PaneGrid } from './PaneGrid'
import './AppShell.css'

const storage = createLocalStorage()

export default function AppShell() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  useKeyboardShortcuts()
  useLayoutPersistence(storage)
  useAgentManager()

  const agents = useMemo(() => Array.from(state.agents.values()), [state.agents])

  return (
    <div className="app-shell">
      <TopBar />
      <Sidebar />
      <div className="main-content" data-testid="main-content">
        {state.layout.activeTab === 'agents' && agents.length > 0 && (
          <PaneGrid agents={agents} />
        )}
      </div>
      <BottomBar />
      <button
        className="sidebar-toggle"
        data-testid="sidebar-toggle"
        onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
        title={state.layout.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {state.layout.sidebarCollapsed ? '\u25b6' : '\u25c0'}
      </button>
    </div>
  )
}
