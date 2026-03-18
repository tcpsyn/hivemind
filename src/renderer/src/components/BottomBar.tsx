import { useActiveTab } from '../state/AppContext'
import type { AgentStatus } from '../../../shared/types'
import './BottomBar.css'

export default function BottomBar() {
  const tab = useActiveTab()

  const statusCounts = new Map<AgentStatus, number>()
  let lastActivity = 0

  for (const agent of tab.agents.values()) {
    statusCounts.set(agent.status, (statusCounts.get(agent.status) || 0) + 1)
    if (agent.lastActivity > lastActivity) {
      lastActivity = agent.lastActivity
    }
  }

  const hasAgents = tab.agents.size > 0

  const summaryParts: string[] = []
  if (statusCounts.get('running')) summaryParts.push(`${statusCounts.get('running')} running`)
  if (statusCounts.get('idle')) summaryParts.push(`${statusCounts.get('idle')} idle`)
  if (statusCounts.get('waiting')) summaryParts.push(`${statusCounts.get('waiting')} waiting`)
  if (statusCounts.get('stopped')) summaryParts.push(`${statusCounts.get('stopped')} stopped`)

  const formatTime = (ts: number) => {
    const date = new Date(ts)
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  }

  return (
    <div className="bottombar" data-testid="bottombar">
      <div className="bottombar-left">
        {hasAgents ? (
          <span className="agent-summary">{summaryParts.join(' \u00b7 ')}</span>
        ) : (
          <span className="agent-summary muted">No agents</span>
        )}
      </div>
      <div className="bottombar-right">
        {lastActivity > 0 && (
          <span className="last-activity" data-testid="last-activity">
            Last activity: {formatTime(lastActivity)}
          </span>
        )}
      </div>
    </div>
  )
}
