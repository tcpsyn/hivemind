import { useMemo } from 'react'
import { useAppState } from '../state/AppContext'
import AgentListItem from './AgentListItem'
import './AgentList.css'

export default function AgentList() {
  const state = useAppState()

  const sortedAgents = useMemo(() => {
    const agents = Array.from(state.agents.values())
    return agents.sort((a, b) => {
      if (a.needsInput && !b.needsInput) return -1
      if (!a.needsInput && b.needsInput) return 1
      return 0
    })
  }, [state.agents])

  return (
    <div className="agent-list" data-testid="agent-list">
      {sortedAgents.length === 0 ? (
        <div className="agent-list-empty">No agents</div>
      ) : (
        sortedAgents.map((agent) => <AgentListItem key={agent.id} agent={agent} />)
      )}
    </div>
  )
}
