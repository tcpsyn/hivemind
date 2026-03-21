import { useState, useRef, useCallback, useEffect } from 'react'
import { useAppState, useAppDispatch } from '../state/AppContext'
import type { ActiveTab, TeamStatus } from '../../../shared/types'
import './TopBar.css'

const FEATURE_TABS: { label: string; value: ActiveTab }[] = [
  { label: 'Agents', value: 'agents' },
  { label: 'Editor', value: 'editor' },
  { label: 'Git', value: 'git' }
]

const STATUS_DOT_COLOR: Record<TeamStatus, string> = {
  running: 'var(--status-running)',
  starting: 'var(--status-waiting)',
  stopped: 'var(--status-idle)'
}

export default function TopBar() {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const plusRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handler = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        plusRef.current &&
        !plusRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  const switchTab = useCallback(
    (tabId: string) => {
      dispatch({ type: 'SET_ACTIVE_PROJECT_TAB', payload: tabId })
    },
    [dispatch]
  )

  const closeTab = useCallback(
    (e: React.MouseEvent, tabId: string) => {
      e.stopPropagation()
      const tab = state.tabs.get(tabId)
      if (tab && tab.teamStatus === 'running') {
        if (!window.confirm(`Team is running in "${tab.projectName}". Close tab?`)) return
      }
      dispatch({ type: 'CLOSE_TAB', payload: tabId })
    },
    [dispatch, state.tabs]
  )

  const openProject = useCallback(
    async (projectPath: string) => {
      setMenuOpen(false)
      try {
        const tab = await window.api.tabCreate({ projectPath })
        dispatch({
          type: 'CREATE_TAB',
          payload: { id: tab.tabId, projectPath: tab.projectPath, projectName: tab.projectName }
        })
        dispatch({ type: 'ADD_RECENT_PROJECT', payload: projectPath })
        dispatch({ type: 'SET_TEAM_STATUS', payload: 'starting', tabId: tab.tabId })
        const result = await window.api.teamStart({
          tabId: tab.tabId,
          config: { name: tab.projectName, project: projectPath, agents: [] }
        })
        for (const agent of result.agents) {
          dispatch({ type: 'ADD_AGENT', payload: agent, tabId: tab.tabId })
        }
        if (result.agents.length > 0) {
          dispatch({ type: 'SET_TEAM_LEAD', payload: result.agents[0].id, tabId: tab.tabId })
        }
        dispatch({ type: 'SET_TEAM_STATUS', payload: 'running', tabId: tab.tabId })
      } catch (err) {
        console.error('[TopBar] Failed to open project:', err)
      }
    },
    [dispatch]
  )

  const openFolder = useCallback(async () => {
    setMenuOpen(false)
    const folderPath = await window.api.openFolderDialog()
    if (folderPath) {
      await openProject(folderPath)
    }
  }, [openProject])

  const orderedTabs = state.globalLayout.tabOrder
    .map((id) => state.tabs.get(id))
    .filter((t): t is NonNullable<typeof t> => t != null)

  return (
    <div className="topbar" data-testid="topbar">
      <div className="topbar-project-tabs">
        <div className="project-tabs-scroll">
          {orderedTabs.map((tab) => (
            <button
              key={tab.id}
              className={`project-tab${state.activeTabId === tab.id ? ' active' : ''}`}
              onClick={() => switchTab(tab.id)}
              title={tab.projectPath}
              data-testid={`project-tab-${tab.id}`}
            >
              <span
                className="project-tab-status"
                data-testid="status-dot"
                data-status={tab.teamStatus}
                style={{ backgroundColor: STATUS_DOT_COLOR[tab.teamStatus] }}
              />
              <span className="project-tab-name">{tab.projectName || 'New Tab'}</span>
              <span
                className="project-tab-close"
                onClick={(e) => closeTab(e, tab.id)}
                role="button"
                tabIndex={-1}
                aria-label={`Close ${tab.projectName}`}
              >
                ×
              </span>
            </button>
          ))}
        </div>
        <div className="new-tab-container">
          <button
            ref={plusRef}
            className="new-tab-btn"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="New tab"
            data-testid="new-tab-button"
          >
            +
          </button>
          {menuOpen && (
            <div ref={menuRef} className="new-tab-menu" data-testid="new-tab-menu">
              {state.recentProjects.length > 0 && (
                <>
                  <div className="new-tab-menu-label">Recent Projects</div>
                  {state.recentProjects.slice(0, 5).map((path) => (
                    <button
                      key={path}
                      className="new-tab-menu-item"
                      onClick={() => openProject(path)}
                    >
                      <span className="new-tab-menu-item-name">{path.split('/').pop()}</span>
                      <span className="new-tab-menu-item-path">{path}</span>
                    </button>
                  ))}
                  <div className="new-tab-menu-divider" />
                </>
              )}
              <button className="new-tab-menu-item" onClick={openFolder}>
                Open folder…
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="topbar-drag-spacer" />

      <div className="topbar-feature-tabs">
        {FEATURE_TABS.map((tab) => (
          <button
            key={tab.value}
            className={`topbar-tab${state.activeFeatureTab === tab.value ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_FEATURE_TAB', payload: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  )
}
