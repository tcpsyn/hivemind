import { useRef } from 'react'
import { useTerminal } from '../hooks/useTerminal'
import { useAppDispatch } from '../state/AppContext'
import type { AgentState } from '../../../shared/types'
import './TerminalPane.css'

interface TerminalPaneProps {
  agent: AgentState
}

export function TerminalPane({ agent }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dispatch = useAppDispatch()
  useTerminal(agent.id, containerRef)

  const paneClasses = ['terminal-pane', agent.needsInput ? 'needs-input' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={paneClasses} data-testid={`terminal-pane-${agent.id}`}>
      <div
        className="pane-header"
        data-testid="pane-header"
        style={{ borderTopColor: agent.color }}
        onDoubleClick={() => dispatch({ type: 'MAXIMIZE_PANE', payload: agent.id })}
      >
        <span className="pane-avatar" style={{ color: agent.color }}>
          {agent.avatar}
        </span>
        <span className="pane-name">{agent.name}</span>
        <span className="pane-role">{agent.role}</span>
        <span className={`status-dot ${agent.status}`} data-testid="status-dot" />
      </div>
      <div className="terminal-container" data-testid="terminal-container" ref={containerRef} />
    </div>
  )
}
