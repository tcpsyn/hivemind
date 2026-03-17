import { useCallback, useMemo } from 'react'
import { useAppState, useAppDispatch } from '../state/AppContext'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useLayoutPersistence, createLocalStorage } from '../hooks/useLayoutPersistence'
import { useAgentManager } from '../hooks/useAgentManager'
import ErrorBoundary from './ErrorBoundary'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import BottomBar from './BottomBar'
import { PaneGrid } from './PaneGrid'
import { LeadLayout } from './LeadLayout'
import EditorView from './EditorView'
import './AppShell.css'

const storage = createLocalStorage()

export default function AppShell() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  useKeyboardShortcuts()
  useLayoutPersistence(storage)
  const { stopAgent, restartAgent } = useAgentManager()

  const agents = useMemo(() => Array.from(state.agents.values()), [state.agents])

  const handleAgentContextMenu = useCallback(
    (agentId: string, action: string) => {
      switch (action) {
        case 'stop':
          stopAgent(agentId)
          break
        case 'restart':
          restartAgent(agentId)
          break
      }
    },
    [stopAgent, restartAgent]
  )

  return (
    <div className="app-shell">
      <TopBar />
      <ErrorBoundary fallbackLabel="Sidebar error">
        <Sidebar onAgentContextMenu={handleAgentContextMenu} />
      </ErrorBoundary>
      <div className="main-content" data-testid="main-content">
        {state.layout.activeTab === 'agents' && (
          <ErrorBoundary fallbackLabel="Terminal grid error">
            {agents.length > 0 ? (
              state.layout.viewMode === 'lead' && state.layout.teamLeadId ? (
                <LeadLayout />
              ) : (
                <PaneGrid agents={agents} />
              )
            ) : (
              <div className="main-empty-state">
                <span className="main-empty-text">No agents running</span>
                <span className="main-empty-hint">Start a team to begin</span>
              </div>
            )}
          </ErrorBoundary>
        )}
        {state.layout.activeTab === 'editor' && (
          <ErrorBoundary fallbackLabel="Editor error">
            <EditorView />
          </ErrorBoundary>
        )}
        {state.layout.activeTab === 'git' && (
          <div className="main-empty-state">
            <span className="main-empty-text">Git integration coming soon</span>
            <span className="main-empty-hint">Branch, diff, and commit management</span>
          </div>
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
