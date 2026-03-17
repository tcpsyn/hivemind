import { useMemo } from 'react'
import { useActiveTab } from '../state/AppContext'
import AgentListItem from './AgentListItem'
import './AgentList.css'

interface AgentListProps {
  onAgentContextMenu?: (agentId: string, action: string) => void
}

export default function AgentList({ onAgentContextMenu }: AgentListProps) {
  const tab = useActiveTab()

  const sortedAgents = useMemo(() => {
    const agents = Array.from(tab.agents.values())
    return agents.sort((a, b) => {
      if (a.needsInput && !b.needsInput) return -1
      if (!a.needsInput && b.needsInput) return 1
      return 0
    })
  }, [tab.agents])

  return (
    <div className="agent-list" data-testid="agent-list">
      {sortedAgents.length === 0 ? (
        <div className="agent-list-empty">No agents</div>
      ) : (
        sortedAgents.map((agent) => (
          <AgentListItem
            key={agent.id}
            agent={agent}
            onContextMenu={
              onAgentContextMenu
                ? (action) => onAgentContextMenu(agent.id, action)
                : undefined
            }
          />
        ))
      )}
    </div>
  )
}
