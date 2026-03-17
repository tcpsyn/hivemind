import { useMemo, useCallback, useRef, useState } from 'react'
import { useAppState } from '../state/AppContext'
import { TerminalPane } from './TerminalPane'
import { CompanionPanel } from './CompanionPanel'
import type { AgentState } from '../../../shared/types'
import './LeadLayout.css'

const MIN_COMPANION_WIDTH = 280

export function LeadLayout() {
  const state = useAppState()
  const containerRef = useRef<HTMLDivElement>(null)
  const [companionWidth, setCompanionWidth] = useState<number | null>(null)
  const isDragging = useRef(false)

  const leadAgent = useMemo(() => {
    const id = state.layout.teamLeadId
    if (!id) return null
    return state.agents.get(id) ?? null
  }, [state.layout.teamLeadId, state.agents])

  const teammates = useMemo(() => {
    const id = state.layout.teamLeadId
    return Array.from(state.agents.values()).filter(
      (a: AgentState) => a.id !== id && a.isTeammate
    )
  }, [state.agents, state.layout.teamLeadId])

  const hasTeammates = teammates.length > 0
  const isCollapsed = state.layout.companionPanelCollapsed

  const handleDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isDragging.current = true

      const startX = e.clientX
      const container = containerRef.current
      if (!container) return
      const containerWidth = container.clientWidth
      const startWidth = companionWidth ?? containerWidth * 0.35

      const handleMouseMove = (ev: MouseEvent) => {
        if (!isDragging.current || !container) return
        const delta = startX - ev.clientX
        const newWidth = Math.max(
          MIN_COMPANION_WIDTH,
          Math.min(containerWidth * 0.6, startWidth + delta)
        )
        setCompanionWidth(newWidth)
      }

      const handleMouseUp = () => {
        isDragging.current = false
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [companionWidth]
  )

  if (!leadAgent) return null

  const showCompanion = hasTeammates && !isCollapsed

  const classes = [
    'lead-layout',
    !showCompanion ? 'companion-collapsed' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={classes} data-testid="lead-layout" ref={containerRef}>
      <div className="lead-terminal">
        <TerminalPane agent={leadAgent} />
      </div>
      {showCompanion && (
        <>
          <div className="lead-divider" onMouseDown={handleDividerMouseDown} />
          <div
            className="lead-companion"
            style={companionWidth ? { width: `${companionWidth}px`, flex: 'none' } : undefined}
          >
            <CompanionPanel teammates={teammates} />
          </div>
        </>
      )}
    </div>
  )
}
