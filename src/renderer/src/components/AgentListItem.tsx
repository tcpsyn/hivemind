import { useState, useEffect, useRef, useCallback } from 'react'
import AgentAvatar from './AgentAvatar'
import type { AgentState, AgentStatus } from '../../../shared/types'
import './AgentListItem.css'

interface AgentListItemProps {
  agent: AgentState
  onClick?: () => void
  onContextMenu?: (action: string) => void
}

const STATUS_LABELS: Record<AgentStatus, string> = {
  running: 'Running',
  idle: 'Idle',
  waiting: 'Waiting',
  stopped: 'Stopped'
}

const CONTEXT_ACTIONS = [
  { id: 'restart', label: 'Restart' },
  { id: 'stop', label: 'Stop' },
  { id: 'history', label: 'View History' }
]

export default function AgentListItem({ agent, onClick, onContextMenu }: AgentListItemProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 })
  const menuRef = useRef<HTMLDivElement>(null)

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    setMenuPos({ x: e.clientX, y: e.clientY })
    setMenuOpen(true)
  }, [])

  const handleMenuAction = useCallback(
    (action: string) => {
      setMenuOpen(false)
      onContextMenu?.(action)
    },
    [onContextMenu]
  )

  useEffect(() => {
    if (!menuOpen) return
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

  return (
    <>
      <div
        className={`agent-list-item${agent.needsInput ? ' needs-input' : ''}`}
        data-testid={`agent-list-item-${agent.id}`}
        style={{ borderLeftColor: agent.color }}
        onClick={onClick}
        onContextMenu={handleContextMenu}
      >
        <AgentAvatar avatar={agent.avatar} color={agent.color} />
        <div className="agent-list-item-info">
          <span className="agent-list-item-name">{agent.name}</span>
          <span className="agent-list-item-role">{agent.role}</span>
        </div>
        <div className="agent-list-item-status">
          <span className={`status-badge ${agent.status}`} data-testid="status-badge" />
          <span className="status-text">{STATUS_LABELS[agent.status]}</span>
        </div>
      </div>
      {menuOpen && (
        <div
          ref={menuRef}
          className="agent-context-menu"
          style={{ left: menuPos.x, top: menuPos.y }}
        >
          {CONTEXT_ACTIONS.map(action => (
            <button
              key={action.id}
              className="agent-context-menu-item"
              onClick={() => handleMenuAction(action.id)}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </>
  )
}
