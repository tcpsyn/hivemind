import { useRef } from 'react'
import { useTeammateTerminal } from '../hooks/useTeammateTerminal'
import { usePermissionDetector } from '../hooks/usePermissionDetector'
import { useAppState } from '../state/AppContext'
import AgentAvatar from './AgentAvatar'
import type { AgentState } from '../../../shared/types'
import './TerminalPane.css'

interface TeammateTerminalPaneProps {
  agent: AgentState
}

export function TeammateTerminalPane({ agent }: TeammateTerminalPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const { activeTabId } = useAppState()
  useTeammateTerminal(activeTabId, agent.paneId!, containerRef)
  const { promptVisible, approve, approveAll, deny } = usePermissionDetector(
    activeTabId,
    agent.id,
    agent.paneId
  )

  // Show buttons if either the renderer-side detector OR the main process
  // status polling detected a permission prompt. Main process detection
  // works even when this component isn't mounted (via 1s capture-pane polling).
  const showButtons = promptVisible || agent.needsInput

  const paneClasses = ['terminal-pane', showButtons ? 'needs-input' : ''].filter(Boolean).join(' ')

  return (
    <div className={paneClasses} data-testid={`teammate-terminal-pane-${agent.id}`}>
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
      {showButtons && (
        <div className="terminal-prompt-overlay" data-testid="permission-prompt-overlay">
          <button
            className="btn-approve"
            data-testid="btn-approve"
            onClick={approve}
            aria-label={`Approve ${agent.name}`}
          >
            Approve
          </button>
          <button
            className="btn-approve-all"
            data-testid="btn-approve-all"
            onClick={approveAll}
            aria-label={`Approve all for ${agent.name}`}
          >
            Approve All
          </button>
          <button
            className="btn-deny"
            data-testid="btn-deny"
            onClick={deny}
            aria-label={`Deny ${agent.name}`}
          >
            Deny
          </button>
        </div>
      )}
    </div>
  )
}
