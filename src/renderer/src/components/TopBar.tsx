import { useAppState, useAppDispatch } from '../state/AppContext'
import type { ActiveTab, AgentStatus } from '../../../shared/types'
import './TopBar.css'

const TABS: { label: string; value: ActiveTab }[] = [
  { label: 'Agents', value: 'agents' },
  { label: 'Editor', value: 'editor' },
  { label: 'Git', value: 'git' }
]

export default function TopBar() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const statusCounts = new Map<AgentStatus, number>()
  for (const agent of state.agents.values()) {
    statusCounts.set(agent.status, (statusCounts.get(agent.status) || 0) + 1)
  }

  const unreadCount = state.notifications.filter((n) => !n.read).length

  return (
    <div className="topbar" data-testid="topbar">
      <div className="topbar-left">
        <span className="topbar-project-name">{state.project.name}</span>
        <span className="topbar-project-path">{state.project.path}</span>
      </div>

      <div className="topbar-center">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            className={`topbar-tab${state.layout.activeTab === tab.value ? ' active' : ''}`}
            onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: tab.value })}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="topbar-right">
        <div className="topbar-status">
          {statusCounts.get('running') && (
            <span className="status-count running">{statusCounts.get('running')} running</span>
          )}
          {statusCounts.get('idle') && (
            <span className="status-count idle">{statusCounts.get('idle')} idle</span>
          )}
          {statusCounts.get('waiting') && (
            <span className="status-count waiting">{statusCounts.get('waiting')} waiting</span>
          )}
          {statusCounts.get('stopped') && (
            <span className="status-count stopped">{statusCounts.get('stopped')} stopped</span>
          )}
        </div>
        {unreadCount > 0 && (
          <span className="notification-badge" data-testid="notification-badge">
            {unreadCount}
          </span>
        )}
      </div>
    </div>
  )
}
