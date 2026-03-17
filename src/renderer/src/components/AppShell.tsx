import { useAppState, useAppDispatch } from '../state/AppContext'
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts'
import { useLayoutPersistence, createLocalStorage } from '../hooks/useLayoutPersistence'
import TopBar from './TopBar'
import Sidebar from './Sidebar'
import BottomBar from './BottomBar'
import './AppShell.css'

const storage = createLocalStorage()

export default function AppShell() {
  const state = useAppState()
  const dispatch = useAppDispatch()

  useKeyboardShortcuts()
  useLayoutPersistence(storage)

  return (
    <div className="app-shell">
      <TopBar />
      <Sidebar />
      <div className="main-content" data-testid="main-content">
        {/* Main content area — agent grid, editor, git view */}
      </div>
      <BottomBar />
      <button
        className="sidebar-toggle"
        data-testid="sidebar-toggle"
        onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}
        title={state.layout.sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        {state.layout.sidebarCollapsed ? '\u25b6' : '\u25c0'}
      </button>
    </div>
  )
}
