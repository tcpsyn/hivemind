import { useRef } from 'react'
import { useTeammateTerminal } from '../hooks/useTeammateTerminal'
import AgentAvatar from './AgentAvatar'
import type { AgentState } from '../../../shared/types'
import './TerminalPane.css'

interface TeammateTerminalPaneProps {
  agent: AgentState
}

export function TeammateTerminalPane({ agent }: TeammateTerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  useTeammateTerminal(agent.paneId!, containerRef)

  const paneClasses = ['terminal-pane', agent.needsInput ? 'needs-input' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={paneClasses}
      data-testid={`teammate-terminal-pane-${agent.id}`}
    >
      <div
        className="pane-header"
        data-testid="pane-header"
        style={{ borderTopColor: agent.color }}
      >
        <AgentAvatar avatar={agent.avatar} color={agent.color} size={20} />
        <span className="pane-name">{agent.name}</span>
        <span className="pane-role">{agent.role}</span>
        <span className={`status-dot ${agent.status}`} data-testid="status-dot" />
      </div>
      <div className="terminal-container" data-testid="terminal-container" ref={containerRef} />
    </div>
  )
}
