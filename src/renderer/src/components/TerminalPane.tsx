import { useRef } from 'react'
import { useTerminal } from '../hooks/useTerminal'
import { useAppDispatch, useAppState } from '../state/AppContext'
import AgentAvatar from './AgentAvatar'
import type { AgentState } from '../../../shared/types'
import './TerminalPane.css'

interface TerminalPaneProps {
  agent: AgentState
}

export function TerminalPane({ agent }: TerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const dispatch = useAppDispatch()
  const { activeTabId } = useAppState()
  useTerminal(activeTabId, agent.id, containerRef)

  const paneClasses = ['terminal-pane', agent.needsInput ? 'needs-input' : '']
    .filter(Boolean)
    .join(' ')

  return (
    <div className={paneClasses} data-testid={`terminal-pane-${agent.id}`}>
      <div
        className="pane-header"
        data-testid="pane-header"
        style={{ borderTopColor: agent.color }}
        onDoubleClick={() => dispatch({ type: 'MAXIMIZE_PANE', payload: agent.id, tabId: activeTabId })}
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
