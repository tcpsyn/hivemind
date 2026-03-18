import { useCallback, useEffect, useRef, useState } from 'react'
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
        window.api.sendTeammateInput({ paneId: agent.paneId, data: 'y\n' })
      } else {
        window.api.agentInput({ agentId: agent.id, data: 'y\n' })
      }
    },
    [agent.id, agent.paneId]
  )

  const handleDeny = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      e.preventDefault()
      if (agent.paneId) {
        window.api.sendTeammateInput({ paneId: agent.paneId, data: 'n\n' })
      } else {
        window.api.agentInput({ agentId: agent.id, data: 'n\n' })
      }
    },
    [agent.id, agent.paneId]
  )

  const classes = [
    'teammate-card',
    isSelected ? 'selected' : '',
    agent.needsInput ? 'needs-input' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} data-testid={`teammate-card-${agent.id}`} onClick={onSelect}>
      <div className="teammate-card-header">
        <AgentAvatar avatar={agent.avatar} color={agent.color} size={24} />
        <div className="teammate-card-info">
          <div className="teammate-card-name-row">
            <span className="teammate-card-name">{agent.name}</span>
            <span
              className={`teammate-status-dot ${agent.status}${isActive ? ' active' : ''}`}
              data-testid="teammate-status-dot"
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
          >
            Approve
          </button>
          <button
            className="btn-deny"
            data-testid="btn-deny"
            onClick={handleDeny}
            onMouseDown={(e) => e.preventDefault()}
          >
            Deny
          </button>
        </div>
      )}
    </div>
  )
}
