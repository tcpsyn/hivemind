import { useMemo, useCallback, useRef, useState } from 'react'
import { useAppState, useAppDispatch, useActiveTab } from '../state/AppContext'
import { TerminalPane } from './TerminalPane'
import { TeammateTerminalPane } from './TeammateTerminalPane'
import { TeammateCard } from './TeammateCard'
import type { AgentState } from '../../../shared/types'
import './CompanionPanel.css'

function CollapseButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      className="companion-collapse-btn"
      onClick={onClick}
      title="Collapse panel (⌘\)"
      aria-label="Collapse companion panel"
    >
      ▸
    </button>
  )
}

interface CompanionPanelProps {
  teammates: AgentState[]
}

const MIN_DASHBOARD_HEIGHT = 100
const MIN_TERMINAL_HEIGHT = 100

export function CompanionPanel({ teammates }: CompanionPanelProps) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const tab = useActiveTab()
  const selectedId = tab.layout.selectedTeammateId
  const panelRef = useRef<HTMLDivElement>(null)
  const [dashboardHeight, setDashboardHeight] = useState<number | null>(null)
  const isDragging = useRef(false)

  const sortedTeammates = useMemo(() => {
    return [...teammates].sort((a, b) => {
      if (a.needsInput && !b.needsInput) return -1
      if (!a.needsInput && b.needsInput) return 1
      return 0
    })
  }, [teammates])

  const selectedAgent = useMemo(() => {
    if (!selectedId) return null
    return teammates.find((t) => t.id === selectedId) ?? null
  }, [teammates, selectedId])

  const handleSelect = useCallback(
    (agentId: string) => {
      dispatch({ type: 'SELECT_TEAMMATE', payload: agentId, tabId: state.activeTabId })
    },
    [dispatch]
  )

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true

      const startY = e.clientY
      const panel = panelRef.current
      if (!panel) return
      const startHeight = dashboardHeight ?? panel.clientHeight * 0.4

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current || !panel) return
        const delta = ev.clientY - startY
        const panelHeight = panel.clientHeight
        const newHeight = Math.max(
          MIN_DASHBOARD_HEIGHT,
          Math.min(panelHeight - MIN_TERMINAL_HEIGHT, startHeight + delta)
        )
        setDashboardHeight(newHeight)
      }

      const handleMouseUp = () => {
        isDragging.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [dashboardHeight]
  )

  if (teammates.length === 0) {
    return (
      <div className="companion-panel" data-testid="companion-panel" ref={panelRef}>
        <div className="companion-empty">
          <span className="companion-empty-text">Waiting for teammates...</span>
        </div>
      </div>
    )
  }

  return (
    <div className="companion-panel" data-testid="companion-panel" ref={panelRef}>
      <div
        className="companion-dashboard"
        style={dashboardHeight ? { height: `${dashboardHeight}px`, flex: 'none' } : undefined}
      >
        <div className="companion-dashboard-header">
          <span className="companion-dashboard-title">Teammates</span>
          <span className="companion-dashboard-count">{teammates.length}</span>
          <CollapseButton onClick={() => dispatch({ type: 'TOGGLE_COMPANION', tabId: state.activeTabId })} />
        </div>
        <div className="companion-dashboard-list">
          {sortedTeammates.map((agent) => (
            <TeammateCard
              key={agent.id}
              agent={agent}
              isSelected={agent.id === selectedId}
              onSelect={() => handleSelect(agent.id)}
            />
          ))}
        </div>
      </div>
      <div className="companion-divider" onMouseDown={handleDividerMouseDown} />
      <div className="companion-terminal">
        {selectedAgent ? (
          selectedAgent.paneId ? (
            <TeammateTerminalPane agent={selectedAgent} />
          ) : (
            <TerminalPane agent={selectedAgent} />
          )
        ) : (
          <div className="companion-terminal-empty">
            <span>Select a teammate to view output</span>
          </div>
        )}
      </div>
    </div>
  )
}
