import { useMemo } from 'react'
import { TerminalPane } from './TerminalPane'
import { useAppState, useAppDispatch } from '../state/AppContext'
import type { AgentState } from '../../../shared/types'
import './PaneGrid.css'

interface PaneGridProps {
  agents: AgentState[]
}

function autoGridSize(count: number): { cols: number; rows: number } {
  if (count <= 1) return { cols: 1, rows: 1 }
  if (count === 2) return { cols: 2, rows: 1 }
  if (count <= 4) return { cols: 2, rows: 2 }
  return { cols: 3, rows: 2 }
}

export function PaneGrid({ agents }: PaneGridProps) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const maximizedId = state.layout.maximizedPaneId

  const { cols, rows } = useMemo(() => autoGridSize(agents.length), [agents.length])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && maximizedId) {
      dispatch({ type: 'RESTORE_PANE' })
    }
  }

  if (maximizedId) {
    const maximizedAgent = agents.find((a) => a.id === maximizedId)
    if (maximizedAgent) {
      return (
        <div className="pane-grid maximized" onKeyDown={handleKeyDown} tabIndex={0}>
          <TerminalPane agent={maximizedAgent} />
        </div>
      )
    }
  }

  return (
    <div
      className="pane-grid"
      style={{ '--grid-cols': String(cols), '--grid-rows': String(rows) } as React.CSSProperties}
    >
      {agents.map((agent) => (
        <TerminalPane key={agent.id} agent={agent} />
      ))}
    </div>
  )
}
