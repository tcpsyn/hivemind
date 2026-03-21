import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import AgentAvatar from './AgentAvatar'
import type { AgentState } from '../../../shared/types'
import './TeammateCard.css'

interface TeammateCardProps {
  agent: AgentState
  isSelected: boolean
  onSelect: () => void
}

function formatLastActivity(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000)
  if (seconds < 5) return 'Just now'
  if (seconds < 60) return `${seconds}s ago`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  return `${Math.floor(minutes / 60)}h ago`
}

export function TeammateCard({ agent, isSelected, onSelect }: TeammateCardProps) {
  const { activeTabId } = useAppState()
  const [isActive, setIsActive] = useState(false)
  const activeTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Track actual output activity — subscribe directly to teammate output IPC.
  // Local state only, no context dispatch, no re-render cascade.
  useEffect(() => {
    if (!agent.paneId) return

    const paneId = agent.paneId
    const unsub = window.api?.onTeammateOutput?.((payload) => {
      if (payload.paneId === paneId) {
        setIsActive(true)
        if (activeTimeout.current) clearTimeout(activeTimeout.current)
        activeTimeout.current = setTimeout(() => setIsActive(false), 2000)
      }
    })

    return () => {
      unsub?.()
      if (activeTimeout.current) clearTimeout(activeTimeout.current)
    }
  }, [agent.paneId])

  const handleApprove = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (agent.paneId) {
        // Send Enter key via tmux send-keys (selects default Yes option)
        window.api.sendTeammateInput({
          tabId: activeTabId,
          paneId: agent.paneId,
          data: 'Enter',
          useKeys: true
        })
      } else {
        window.api.agentInput({ tabId: activeTabId, agentId: agent.id, data: 'y\n' })
      }
    },
    [agent.id, agent.paneId, activeTabId]
  )

  const handleApproveAll = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (agent.paneId) {
        // Select option 2: "Yes, and don't ask again" — Down then Enter
        window.api.sendTeammateInput({
          tabId: activeTabId,
          paneId: agent.paneId,
          data: 'Down',
          useKeys: true
        })
        setTimeout(() => {
          window.api.sendTeammateInput({
            tabId: activeTabId,
            paneId: agent.paneId!,
            data: 'Enter',
            useKeys: true
          })
        }, 100)
      }
    },
    [agent.paneId, activeTabId]
  )

  const handleDeny = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (agent.paneId) {
        // Send Escape key via tmux send-keys (cancels the prompt)
        window.api.sendTeammateInput({
          tabId: activeTabId,
          paneId: agent.paneId,
          data: 'Escape',
          useKeys: true
        })
      } else {
        window.api.agentInput({ tabId: activeTabId, agentId: agent.id, data: 'n\n' })
      }
    },
    [agent.id, agent.paneId, activeTabId]
  )

  const classes = [
    'teammate-card',
    isSelected ? 'selected' : '',
    agent.needsInput ? 'needs-input' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      data-testid={`teammate-card-${agent.id}`}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect()
        }
      }}
      role="button"
      tabIndex={0}
    >
      <div className="teammate-card-header">
        <AgentAvatar avatar={agent.avatar} color={agent.color} size={24} />
        <div className="teammate-card-info">
          <div className="teammate-card-name-row">
            <span className="teammate-card-name">{agent.name}</span>
            <span
              className={`status-dot ${agent.status}${isActive ? ' active' : ''}`}
              data-testid="teammate-status-dot"
              role="status"
              aria-label={`Status: ${agent.status}`}
            />
          </div>
          <span className="teammate-card-type">
            {agent.model || agent.agentType || agent.role}
            {agent.contextPercent && (
              <span className="teammate-context"> {agent.contextPercent}</span>
            )}
          </span>
        </div>
      </div>
      <div className="teammate-card-footer">
        {agent.branch && <span className="teammate-branch">{agent.branch}</span>}
        <span className="teammate-last-activity" data-testid="teammate-last-activity">
          {formatLastActivity(agent.lastActivity)}
        </span>
      </div>
      {agent.needsInput && (
        <div className="teammate-card-actions">
          <button
            className="btn-approve"
            data-testid="btn-approve"
            onClick={handleApprove}
            onMouseDown={(e) => e.preventDefault()}
            aria-label={`Approve ${agent.name}`}
          >
            Approve
          </button>
          <button
            className="btn-approve-all"
            data-testid="btn-approve-all"
            onClick={handleApproveAll}
            onMouseDown={(e) => e.preventDefault()}
            aria-label={`Approve all for ${agent.name}`}
          >
            Approve All
          </button>
          <button
            className="btn-deny"
            data-testid="btn-deny"
            onClick={handleDeny}
            onMouseDown={(e) => e.preventDefault()}
            aria-label={`Deny ${agent.name}`}
          >
            Deny
          </button>
        </div>
      )}
    </div>
  )
}
