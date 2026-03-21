import { useEffect, useRef, useState } from 'react'
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

  const classes = ['teammate-card', isSelected ? 'selected' : ''].filter(Boolean).join(' ')

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
    </div>
  )
}
