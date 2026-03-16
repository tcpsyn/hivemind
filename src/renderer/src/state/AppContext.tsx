import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'
import type {
  AppState,
  AgentState,
  ActiveTab,
  EditorTab,
  AppNotification
} from '../../../shared/types'
import { DEFAULT_SIDEBAR_WIDTH } from '../../../shared/constants'

export type AppAction =
  | { type: 'SET_PROJECT'; payload: { name: string; path: string } }
  | { type: 'ADD_AGENT'; payload: AgentState }
  | { type: 'UPDATE_AGENT'; payload: Partial<AgentState> & { id: string } }
  | { type: 'REMOVE_AGENT'; payload: string }
  | { type: 'SET_LAYOUT'; payload: Partial<AppState['layout']> }
  | { type: 'SET_ACTIVE_TAB'; payload: ActiveTab }
  | { type: 'SET_SIDEBAR_WIDTH'; payload: number }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'ADD_EDITOR_TAB'; payload: EditorTab }
  | { type: 'CLOSE_EDITOR_TAB'; payload: string }
  | { type: 'SET_ACTIVE_EDITOR_TAB'; payload: string }
  | { type: 'ADD_NOTIFICATION'; payload: AppNotification }
  | { type: 'DISMISS_NOTIFICATION'; payload: string }
  | { type: 'MAXIMIZE_PANE'; payload: string }
  | { type: 'RESTORE_PANE' }

export interface ExtendedAppState extends Omit<AppState, 'layout'> {
  layout: AppState['layout'] & {
    sidebarCollapsed: boolean
    maximizedPaneId: string | null
  }
}

export const initialAppState: ExtendedAppState = {
  project: { path: '', name: '' },
  agents: new Map(),
  layout: {
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    gridConfig: { layout: 'auto', columns: 2, rows: 2 },
    activeTab: 'agents',
    sidebarCollapsed: false,
    maximizedPaneId: null
  },
  editor: {
    openFiles: [],
    activeFileId: null
  },
  notifications: []
}

export function appReducer(state: ExtendedAppState, action: AppAction): ExtendedAppState {
  switch (action.type) {
    case 'SET_PROJECT':
      return { ...state, project: action.payload }

    case 'ADD_AGENT': {
      const agents = new Map(state.agents)
      agents.set(action.payload.id, action.payload)
      return { ...state, agents }
    }

    case 'UPDATE_AGENT': {
      const existing = state.agents.get(action.payload.id)
      if (!existing) return state
      const agents = new Map(state.agents)
      agents.set(action.payload.id, { ...existing, ...action.payload })
      return { ...state, agents }
    }

    case 'REMOVE_AGENT': {
      const agents = new Map(state.agents)
      agents.delete(action.payload)
      return { ...state, agents }
    }

    case 'SET_LAYOUT':
      return { ...state, layout: { ...state.layout, ...action.payload } }

    case 'SET_ACTIVE_TAB':
      return { ...state, layout: { ...state.layout, activeTab: action.payload } }

    case 'SET_SIDEBAR_WIDTH':
      return { ...state, layout: { ...state.layout, sidebarWidth: action.payload } }

    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        layout: { ...state.layout, sidebarCollapsed: !state.layout.sidebarCollapsed }
      }

    case 'ADD_EDITOR_TAB': {
      const exists = state.editor.openFiles.some(f => f.id === action.payload.id)
      if (exists) {
        return { ...state, editor: { ...state.editor, activeFileId: action.payload.id } }
      }
      return {
        ...state,
        editor: {
          openFiles: [...state.editor.openFiles, action.payload],
          activeFileId: action.payload.id
        }
      }
    }

    case 'CLOSE_EDITOR_TAB': {
      const openFiles = state.editor.openFiles.filter(f => f.id !== action.payload)
      const activeFileId =
        state.editor.activeFileId === action.payload
          ? openFiles.length > 0
            ? openFiles[openFiles.length - 1].id
            : null
          : state.editor.activeFileId
      return { ...state, editor: { openFiles, activeFileId } }
    }

    case 'SET_ACTIVE_EDITOR_TAB':
      return { ...state, editor: { ...state.editor, activeFileId: action.payload } }

    case 'ADD_NOTIFICATION':
      return { ...state, notifications: [...state.notifications, action.payload] }

    case 'DISMISS_NOTIFICATION':
      return {
        ...state,
        notifications: state.notifications.map(n =>
          n.id === action.payload ? { ...n, read: true } : n
        )
      }

    case 'MAXIMIZE_PANE':
      return { ...state, layout: { ...state.layout, maximizedPaneId: action.payload } }

    case 'RESTORE_PANE':
      return { ...state, layout: { ...state.layout, maximizedPaneId: null } }

    default:
      return state
  }
}

const StateContext = createContext<ExtendedAppState | null>(null)
const DispatchContext = createContext<Dispatch<AppAction> | null>(null)

export function AppProvider({
  children,
  initialState
}: {
  children: ReactNode
  initialState?: ExtendedAppState
}) {
  const [state, dispatch] = useReducer(appReducer, initialState ?? initialAppState)
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export function useAppState(): ExtendedAppState {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}

export function useAppDispatch(): Dispatch<AppAction> {
  const ctx = useContext(DispatchContext)
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider')
  return ctx
}
