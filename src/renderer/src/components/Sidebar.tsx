import { useState, useCallback, useRef } from 'react'
import { useAppState, useAppDispatch } from '../state/AppContext'
import AgentList from './AgentList'
import FileTree from './FileTree'
import './Sidebar.css'

interface SidebarProps {
  onAgentContextMenu?: (agentId: string, action: string) => void
}

export default function Sidebar({ onAgentContextMenu }: SidebarProps) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const [agentsCollapsed, setAgentsCollapsed] = useState(false)
  const [filesCollapsed, setFilesCollapsed] = useState(false)
  const isResizing = useRef(false)

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      isResizing.current = true
      document.body.style.cursor = 'col-resize'
      document.body.style.userSelect = 'none'

      const handleMouseMove = (e: MouseEvent) => {
        if (!isResizing.current) return
        const newWidth = Math.max(48, Math.min(500, e.clientX))
        dispatch({ type: 'SET_SIDEBAR_WIDTH', payload: newWidth })
      }

      const handleMouseUp = () => {
        isResizing.current = false
        document.body.style.cursor = ''
        document.body.style.userSelect = ''
        document.removeEventListener('mousemove', handleMouseMove)
        document.removeEventListener('mouseup', handleMouseUp)
      }

      document.addEventListener('mousemove', handleMouseMove)
      document.addEventListener('mouseup', handleMouseUp)
    },
    [dispatch]
  )

  const collapsed = state.globalLayout.sidebarCollapsed

  return (
    <div
      className={`sidebar${collapsed ? ' collapsed' : ''}`}
      data-testid="sidebar"
      style={{ width: collapsed ? 'var(--sidebar-min-width)' : state.globalLayout.sidebarWidth }}
    >
      <div className="sidebar-content">
        <div
          className={`sidebar-section${agentsCollapsed ? ' collapsed' : ''}`}
          data-testid="agents-section"
        >
          <button
            className="sidebar-section-header"
            onClick={() => setAgentsCollapsed(!agentsCollapsed)}
          >
            <span className="sidebar-section-chevron">{agentsCollapsed ? '\u25b6' : '\u25bc'}</span>
            <span>Agents</span>
          </button>
          {!agentsCollapsed && (
            <div className="sidebar-section-body" data-testid="agents-placeholder">
              <AgentList onAgentContextMenu={onAgentContextMenu} />
            </div>
          )}
        </div>

        <div
          className={`sidebar-section${filesCollapsed ? ' collapsed' : ''}`}
          data-testid="files-section"
        >
          <button
            className="sidebar-section-header"
            onClick={() => setFilesCollapsed(!filesCollapsed)}
          >
            <span className="sidebar-section-chevron">{filesCollapsed ? '\u25b6' : '\u25bc'}</span>
            <span>Files</span>
          </button>
          {!filesCollapsed && (
            <div className="sidebar-section-body" data-testid="files-section-body">
              <FileTree />
            </div>
          )}
        </div>
      </div>

      <div
        className="sidebar-resize-handle"
        data-testid="sidebar-resize-handle"
        onMouseDown={handleMouseDown}
      />
    </div>
  )
}
