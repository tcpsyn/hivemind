import { createContext, useContext, useReducer, type ReactNode, type Dispatch } from 'react'
import type {
  AppState,
  AgentState,
  ActiveTab,
  EditorTab,
  AppNotification,
  ProjectTab,
  TabLayout,
  TeamStatus,
  ViewMode
} from '../../../shared/types'
import { DEFAULT_SIDEBAR_WIDTH } from '../../../shared/constants'

// Re-export ViewMode for backwards compatibility (moved to shared/types.ts)
export type { ViewMode }

// --- Tab helpers ---

export function createProjectTab(
  id: string,
  projectPath: string,
  projectName?: string
): ProjectTab {
  return {
    id,
    projectPath,
    projectName: projectName ?? projectPath.split('/').pop() ?? projectPath,
    agents: new Map(),
    layout: {
      gridConfig: { layout: 'auto', columns: 2, rows: 2 },
      maximizedPaneId: null,
      viewMode: 'lead',
      teamLeadId: null,
      selectedTeammateId: null,
      companionPanelCollapsed: false
    },
    editor: {
      openFiles: [],
      activeFileId: null
    },
    notifications: [],
    teamStatus: 'stopped'
  }
}

// --- Action types ---

export type AppAction =
  // Tab lifecycle (global)
  | { type: 'CREATE_TAB'; payload: { id: string; projectPath: string; projectName?: string } }
  | { type: 'CLOSE_TAB'; payload: string }
  | { type: 'SET_ACTIVE_PROJECT_TAB'; payload: string }
  | { type: 'REORDER_TABS'; payload: string[] }
  // Global UI
  | { type: 'SET_ACTIVE_FEATURE_TAB'; payload: ActiveTab }
  | { type: 'SET_SIDEBAR_WIDTH'; payload: number }
  | { type: 'TOGGLE_SIDEBAR' }
  | { type: 'ADD_RECENT_PROJECT'; payload: string }
  // Per-tab: agents
  | { type: 'ADD_AGENT'; payload: AgentState; tabId: string }
  | { type: 'UPDATE_AGENT'; payload: Partial<AgentState> & { id: string }; tabId: string }
  | { type: 'REMOVE_AGENT'; payload: string; tabId: string }
  // Per-tab: layout
  | { type: 'SET_TAB_LAYOUT'; payload: Partial<TabLayout>; tabId: string }
  | { type: 'MAXIMIZE_PANE'; payload: string; tabId: string }
  | { type: 'RESTORE_PANE'; tabId: string }
  | { type: 'SET_VIEW_MODE'; payload: ViewMode; tabId: string }
  | { type: 'SET_TEAM_LEAD'; payload: string; tabId: string }
  | { type: 'SELECT_TEAMMATE'; payload: string | null; tabId: string }
  | { type: 'TOGGLE_COMPANION'; tabId: string }
  // Per-tab: editor
  | { type: 'ADD_EDITOR_TAB'; payload: EditorTab; tabId: string }
  | { type: 'CLOSE_EDITOR_TAB'; payload: string; tabId: string }
  | { type: 'SET_ACTIVE_EDITOR_TAB'; payload: string; tabId: string }
  // Per-tab: notifications
  | { type: 'ADD_NOTIFICATION'; payload: AppNotification; tabId: string }
  | { type: 'DISMISS_NOTIFICATION'; payload: string; tabId: string }
  // Per-tab: team status
  | { type: 'SET_TEAM_STATUS'; payload: TeamStatus; tabId: string }

// --- Initial state ---

const DEFAULT_TAB_ID = 'tab-default'
const DEFAULT_PROJECT_PATH = '~'

const defaultTab = createProjectTab(DEFAULT_TAB_ID, DEFAULT_PROJECT_PATH, '~')

export const initialAppState: AppState = {
  tabs: new Map([[DEFAULT_TAB_ID, defaultTab]]),
  activeTabId: DEFAULT_TAB_ID,
  activeFeatureTab: 'agents',
  recentProjects: [],
  globalLayout: {
    tabOrder: [DEFAULT_TAB_ID],
    sidebarWidth: DEFAULT_SIDEBAR_WIDTH,
    sidebarCollapsed: false
  }
}

// --- Reducer helpers ---

function updateTab(
  state: AppState,
  tabId: string,
  updater: (tab: ProjectTab) => ProjectTab
): AppState {
  const tab = state.tabs.get(tabId)
  if (!tab) return state
  const tabs = new Map(state.tabs)
  tabs.set(tabId, updater(tab))
  return { ...state, tabs }
}

// --- Reducer ---

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    // === Tab lifecycle ===

    case 'CREATE_TAB': {
      const { id, projectPath, projectName } = action.payload
      if (state.tabs.has(id)) return state
      const tab = createProjectTab(id, projectPath, projectName)
      const tabs = new Map(state.tabs)
      tabs.set(id, tab)
      return {
        ...state,
        tabs,
        activeTabId: id,
        globalLayout: {
          ...state.globalLayout,
          tabOrder: [...state.globalLayout.tabOrder, id]
        }
      }
    }

    case 'CLOSE_TAB': {
      const tabId = action.payload
      if (!state.tabs.has(tabId)) return state
      const tabs = new Map(state.tabs)
      tabs.delete(tabId)
      const tabOrder = state.globalLayout.tabOrder.filter((id) => id !== tabId)

      // Closing the last tab opens a new empty tab at ~
      if (tabs.size === 0) {
        const newTab = createProjectTab(DEFAULT_TAB_ID, DEFAULT_PROJECT_PATH, '~')
        tabs.set(DEFAULT_TAB_ID, newTab)
        tabOrder.push(DEFAULT_TAB_ID)
        return {
          ...state,
          tabs,
          activeTabId: DEFAULT_TAB_ID,
          globalLayout: { ...state.globalLayout, tabOrder }
        }
      }

      // If closing the active tab, switch to adjacent
      let activeTabId = state.activeTabId
      if (activeTabId === tabId) {
        const oldIndex = state.globalLayout.tabOrder.indexOf(tabId)
        const newIndex = Math.min(oldIndex, tabOrder.length - 1)
        activeTabId = tabOrder[newIndex]
      }

      return {
        ...state,
        tabs,
        activeTabId,
        globalLayout: { ...state.globalLayout, tabOrder }
      }
    }

    case 'SET_ACTIVE_PROJECT_TAB': {
      if (!state.tabs.has(action.payload)) return state
      return { ...state, activeTabId: action.payload }
    }

    case 'REORDER_TABS':
      return {
        ...state,
        globalLayout: { ...state.globalLayout, tabOrder: action.payload }
      }

    // === Global UI ===

    case 'SET_ACTIVE_FEATURE_TAB':
      return { ...state, activeFeatureTab: action.payload }

    case 'SET_SIDEBAR_WIDTH':
      return {
        ...state,
        globalLayout: { ...state.globalLayout, sidebarWidth: action.payload }
      }

    case 'TOGGLE_SIDEBAR':
      return {
        ...state,
        globalLayout: {
          ...state.globalLayout,
          sidebarCollapsed: !state.globalLayout.sidebarCollapsed
        }
      }

    case 'ADD_RECENT_PROJECT': {
      const path = action.payload
      const filtered = state.recentProjects.filter((p) => p !== path)
      return {
        ...state,
        recentProjects: [path, ...filtered].slice(0, 10)
      }
    }

    // === Per-tab: agents ===

    case 'ADD_AGENT':
      return updateTab(state, action.tabId, (tab) => {
        const agents = new Map(tab.agents)
        agents.set(action.payload.id, action.payload)
        return { ...tab, agents }
      })

    case 'UPDATE_AGENT':
      return updateTab(state, action.tabId, (tab) => {
        const existing = tab.agents.get(action.payload.id)
        if (!existing) return tab
        const agents = new Map(tab.agents)
        agents.set(action.payload.id, { ...existing, ...action.payload })
        return { ...tab, agents }
      })

    case 'REMOVE_AGENT':
      return updateTab(state, action.tabId, (tab) => {
        const agents = new Map(tab.agents)
        agents.delete(action.payload)
        return { ...tab, agents }
      })

    // === Per-tab: layout ===

    case 'SET_TAB_LAYOUT':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        layout: { ...tab.layout, ...action.payload }
      }))

    case 'MAXIMIZE_PANE':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        layout: { ...tab.layout, maximizedPaneId: action.payload }
      }))

    case 'RESTORE_PANE':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        layout: { ...tab.layout, maximizedPaneId: null }
      }))

    case 'SET_VIEW_MODE':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        layout: { ...tab.layout, viewMode: action.payload }
      }))

    case 'SET_TEAM_LEAD':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        layout: { ...tab.layout, teamLeadId: action.payload }
      }))

    case 'SELECT_TEAMMATE':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        layout: { ...tab.layout, selectedTeammateId: action.payload }
      }))

    case 'TOGGLE_COMPANION':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        layout: {
          ...tab.layout,
          companionPanelCollapsed: !tab.layout.companionPanelCollapsed
        }
      }))

    // === Per-tab: editor ===

    case 'ADD_EDITOR_TAB':
      return updateTab(state, action.tabId, (tab) => {
        const exists = tab.editor.openFiles.some((f) => f.id === action.payload.id)
        if (exists) {
          return { ...tab, editor: { ...tab.editor, activeFileId: action.payload.id } }
        }
        return {
          ...tab,
          editor: {
            openFiles: [...tab.editor.openFiles, action.payload],
            activeFileId: action.payload.id
          }
        }
      })

    case 'CLOSE_EDITOR_TAB':
      return updateTab(state, action.tabId, (tab) => {
        const openFiles = tab.editor.openFiles.filter((f) => f.id !== action.payload)
        const activeFileId =
          tab.editor.activeFileId === action.payload
            ? openFiles.length > 0
              ? openFiles[openFiles.length - 1].id
              : null
            : tab.editor.activeFileId
        return { ...tab, editor: { openFiles, activeFileId } }
      })

    case 'SET_ACTIVE_EDITOR_TAB':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        editor: { ...tab.editor, activeFileId: action.payload }
      }))

    // === Per-tab: notifications ===

    case 'ADD_NOTIFICATION':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        notifications: [...tab.notifications, action.payload]
      }))

    case 'DISMISS_NOTIFICATION':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        notifications: tab.notifications.map((n) =>
          n.id === action.payload ? { ...n, read: true } : n
        )
      }))

    // === Per-tab: team status ===

    case 'SET_TEAM_STATUS':
      return updateTab(state, action.tabId, (tab) => ({
        ...tab,
        teamStatus: action.payload
      }))

    default:
      return state
  }
}

// --- Context ---

const StateContext = createContext<AppState | null>(null)
const DispatchContext = createContext<Dispatch<AppAction> | null>(null)

export function AppProvider({
  children,
  initialState
}: {
  children: ReactNode
  initialState?: AppState
}) {
  const [state, dispatch] = useReducer(appReducer, initialState ?? initialAppState)
  return (
    <StateContext.Provider value={state}>
      <DispatchContext.Provider value={dispatch}>{children}</DispatchContext.Provider>
    </StateContext.Provider>
  )
}

export function useAppState(): AppState {
  const ctx = useContext(StateContext)
  if (!ctx) throw new Error('useAppState must be used within AppProvider')
  return ctx
}

export function useAppDispatch(): Dispatch<AppAction> {
  const ctx = useContext(DispatchContext)
  if (!ctx) throw new Error('useAppDispatch must be used within AppProvider')
  return ctx
}

/** Returns the currently active ProjectTab. Throws if no active tab exists. */
export function useActiveTab(): ProjectTab {
  const state = useAppState()
  const tab = state.tabs.get(state.activeTabId)
  if (!tab) throw new Error('No active tab found')
  return tab
}
