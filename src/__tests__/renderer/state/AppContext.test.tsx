import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import {
  AppProvider,
  useAppState,
  useAppDispatch,
  useActiveTab,
  appReducer,
  initialAppState,
  createProjectTab
} from '../../../renderer/src/state/AppContext'
import type { AgentState, AppState, EditorTab, AppNotification } from '../../../shared/types'

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

const DEFAULT_TAB_ID = 'tab-default'

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'agent-1',
    name: 'architect',
    role: 'Lead architect',
    avatar: 'robot-1',
    color: '#FF6B6B',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    ...overrides
  }
}

function makeEditorTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: 'tab-1',
    filePath: '/src/index.ts',
    fileName: 'index.ts',
    language: 'typescript',
    isModified: false,
    isReadOnly: true,
    ...overrides
  }
}

function makeNotification(overrides: Partial<AppNotification> = {}): AppNotification {
  return {
    id: 'notif-1',
    agentId: 'agent-1',
    agentName: 'architect',
    message: 'Needs input',
    timestamp: Date.now(),
    read: false,
    ...overrides
  }
}

/** State with two tabs for isolation tests */
function stateWithTwoTabs(): AppState {
  const tab1 = createProjectTab('tab-1', '/projects/alpha', 'alpha')
  const tab2 = createProjectTab('tab-2', '/projects/beta', 'beta')
  return {
    tabs: new Map([
      ['tab-1', tab1],
      ['tab-2', tab2]
    ]),
    activeTabId: 'tab-1',
    activeFeatureTab: 'agents',
    recentProjects: [],
    globalLayout: {
      tabOrder: ['tab-1', 'tab-2'],
      sidebarWidth: 250,
      sidebarCollapsed: false
    }
  }
}

describe('AppContext', () => {
  describe('initialAppState', () => {
    it('has one default tab at ~', () => {
      expect(initialAppState.tabs.size).toBe(1)
      const tab = initialAppState.tabs.get(DEFAULT_TAB_ID)!
      expect(tab).toBeDefined()
      expect(tab.projectPath).toBe('~')
      expect(tab.projectName).toBe('~')
    })

    it('has correct global defaults', () => {
      expect(initialAppState.activeTabId).toBe(DEFAULT_TAB_ID)
      expect(initialAppState.activeFeatureTab).toBe('agents')
      expect(initialAppState.recentProjects).toEqual([])
      expect(initialAppState.globalLayout.sidebarWidth).toBe(250)
      expect(initialAppState.globalLayout.sidebarCollapsed).toBe(false)
      expect(initialAppState.globalLayout.tabOrder).toEqual([DEFAULT_TAB_ID])
    })

    it('has correct per-tab defaults', () => {
      const tab = initialAppState.tabs.get(DEFAULT_TAB_ID)!
      expect(tab.agents).toBeInstanceOf(Map)
      expect(tab.agents.size).toBe(0)
      expect(tab.layout.viewMode).toBe('lead')
      expect(tab.layout.teamLeadId).toBeNull()
      expect(tab.layout.selectedTeammateId).toBeNull()
      expect(tab.layout.companionPanelCollapsed).toBe(false)
      expect(tab.layout.maximizedPaneId).toBeNull()
      expect(tab.editor.openFiles).toEqual([])
      expect(tab.editor.activeFileId).toBeNull()
      expect(tab.notifications).toEqual([])
      expect(tab.teamStatus).toBe('stopped')
    })
  })

  describe('createProjectTab', () => {
    it('derives projectName from path basename', () => {
      const tab = createProjectTab('t1', '/Users/luke/code/my-app')
      expect(tab.projectName).toBe('my-app')
    })

    it('uses explicit projectName when provided', () => {
      const tab = createProjectTab('t1', '/Users/luke/code/my-app', 'Custom Name')
      expect(tab.projectName).toBe('Custom Name')
    })
  })

  describe('appReducer — tab lifecycle', () => {
    it('CREATE_TAB adds a tab and makes it active', () => {
      const state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-new', projectPath: '/projects/new', projectName: 'new' }
      })
      expect(state.tabs.size).toBe(2)
      expect(state.activeTabId).toBe('tab-new')
      expect(state.tabs.get('tab-new')!.projectPath).toBe('/projects/new')
      expect(state.globalLayout.tabOrder).toContain('tab-new')
    })

    it('CREATE_TAB is a no-op for duplicate id', () => {
      const state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: DEFAULT_TAB_ID, projectPath: '/other' }
      })
      expect(state.tabs.size).toBe(1)
    })

    it('CLOSE_TAB removes a tab', () => {
      let state = stateWithTwoTabs()
      state = appReducer(state, { type: 'CLOSE_TAB', payload: 'tab-2' })
      expect(state.tabs.size).toBe(1)
      expect(state.tabs.has('tab-2')).toBe(false)
      expect(state.globalLayout.tabOrder).toEqual(['tab-1'])
    })

    it('CLOSE_TAB switches to adjacent when closing active tab', () => {
      let state = stateWithTwoTabs()
      state = appReducer(state, { type: 'CLOSE_TAB', payload: 'tab-1' })
      expect(state.activeTabId).toBe('tab-2')
    })

    it('CLOSE_TAB on last tab creates new empty tab at ~', () => {
      const state = appReducer(initialAppState, {
        type: 'CLOSE_TAB',
        payload: DEFAULT_TAB_ID
      })
      expect(state.tabs.size).toBe(1)
      const newTab = state.tabs.values().next().value!
      expect(newTab.projectPath).toBe('~')
      expect(state.activeTabId).toBe(newTab.id)
    })

    it('CLOSE_TAB is a no-op for non-existent tab', () => {
      const state = appReducer(initialAppState, {
        type: 'CLOSE_TAB',
        payload: 'ghost-tab'
      })
      expect(state).toBe(initialAppState)
    })

    it('SET_ACTIVE_PROJECT_TAB switches active tab', () => {
      let state = stateWithTwoTabs()
      state = appReducer(state, { type: 'SET_ACTIVE_PROJECT_TAB', payload: 'tab-2' })
      expect(state.activeTabId).toBe('tab-2')
    })

    it('SET_ACTIVE_PROJECT_TAB is a no-op for non-existent tab', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_ACTIVE_PROJECT_TAB',
        payload: 'ghost'
      })
      expect(state.activeTabId).toBe(DEFAULT_TAB_ID)
    })

    it('REORDER_TABS updates tab order', () => {
      let state = stateWithTwoTabs()
      state = appReducer(state, { type: 'REORDER_TABS', payload: ['tab-2', 'tab-1'] })
      expect(state.globalLayout.tabOrder).toEqual(['tab-2', 'tab-1'])
    })
  })

  describe('appReducer — global UI', () => {
    it('SET_ACTIVE_FEATURE_TAB updates feature tab', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_ACTIVE_FEATURE_TAB',
        payload: 'editor'
      })
      expect(state.activeFeatureTab).toBe('editor')
    })

    it('SET_SIDEBAR_WIDTH updates sidebar width', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_SIDEBAR_WIDTH',
        payload: 300
      })
      expect(state.globalLayout.sidebarWidth).toBe(300)
    })

    it('TOGGLE_SIDEBAR toggles collapsed state', () => {
      let state = appReducer(initialAppState, { type: 'TOGGLE_SIDEBAR' })
      expect(state.globalLayout.sidebarCollapsed).toBe(true)
      state = appReducer(state, { type: 'TOGGLE_SIDEBAR' })
      expect(state.globalLayout.sidebarCollapsed).toBe(false)
    })

    it('ADD_RECENT_PROJECT adds to front of list', () => {
      let state = appReducer(initialAppState, {
        type: 'ADD_RECENT_PROJECT',
        payload: '/projects/a'
      })
      state = appReducer(state, { type: 'ADD_RECENT_PROJECT', payload: '/projects/b' })
      expect(state.recentProjects).toEqual(['/projects/b', '/projects/a'])
    })

    it('ADD_RECENT_PROJECT moves duplicates to front', () => {
      let state = appReducer(initialAppState, {
        type: 'ADD_RECENT_PROJECT',
        payload: '/projects/a'
      })
      state = appReducer(state, { type: 'ADD_RECENT_PROJECT', payload: '/projects/b' })
      state = appReducer(state, { type: 'ADD_RECENT_PROJECT', payload: '/projects/a' })
      expect(state.recentProjects).toEqual(['/projects/a', '/projects/b'])
    })

    it('ADD_RECENT_PROJECT caps at 10 entries', () => {
      let state = initialAppState
      for (let i = 0; i < 15; i++) {
        state = appReducer(state, {
          type: 'ADD_RECENT_PROJECT',
          payload: `/projects/p${i}`
        })
      }
      expect(state.recentProjects).toHaveLength(10)
      expect(state.recentProjects[0]).toBe('/projects/p14')
    })
  })

  describe('appReducer — per-tab agents', () => {
    it('ADD_AGENT adds agent to specified tab', () => {
      const agent = makeAgent()
      const state = appReducer(initialAppState, {
        type: 'ADD_AGENT',
        payload: agent,
        tabId: DEFAULT_TAB_ID
      })
      const tab = state.tabs.get(DEFAULT_TAB_ID)!
      expect(tab.agents.size).toBe(1)
      expect(tab.agents.get('agent-1')).toEqual(agent)
    })

    it('UPDATE_AGENT updates agent in specified tab', () => {
      const agent = makeAgent()
      let state = appReducer(initialAppState, {
        type: 'ADD_AGENT',
        payload: agent,
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'UPDATE_AGENT',
        payload: { id: 'agent-1', status: 'waiting', needsInput: true },
        tabId: DEFAULT_TAB_ID
      })
      const updated = state.tabs.get(DEFAULT_TAB_ID)!.agents.get('agent-1')!
      expect(updated.status).toBe('waiting')
      expect(updated.needsInput).toBe(true)
      expect(updated.name).toBe('architect')
    })

    it('UPDATE_AGENT is a no-op for non-existent agent', () => {
      const state = appReducer(initialAppState, {
        type: 'UPDATE_AGENT',
        payload: { id: 'ghost', status: 'stopped' },
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.agents.size).toBe(0)
    })

    it('REMOVE_AGENT removes agent from specified tab', () => {
      const agent = makeAgent()
      let state = appReducer(initialAppState, {
        type: 'ADD_AGENT',
        payload: agent,
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'REMOVE_AGENT',
        payload: 'agent-1',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.agents.size).toBe(0)
    })

    it('agent actions on non-existent tab are no-ops', () => {
      const agent = makeAgent()
      const state = appReducer(initialAppState, {
        type: 'ADD_AGENT',
        payload: agent,
        tabId: 'ghost-tab'
      })
      expect(state).toBe(initialAppState)
    })
  })

  describe('appReducer — per-tab layout', () => {
    it('SET_TAB_LAYOUT updates tab layout', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_TAB_LAYOUT',
        payload: { gridConfig: { layout: '2x2', columns: 2, rows: 2 } },
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.layout.gridConfig.layout).toBe('2x2')
    })

    it('MAXIMIZE_PANE sets maximized pane id', () => {
      const state = appReducer(initialAppState, {
        type: 'MAXIMIZE_PANE',
        payload: 'agent-1',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.layout.maximizedPaneId).toBe('agent-1')
    })

    it('RESTORE_PANE clears maximized pane id', () => {
      let state = appReducer(initialAppState, {
        type: 'MAXIMIZE_PANE',
        payload: 'agent-1',
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, { type: 'RESTORE_PANE', tabId: DEFAULT_TAB_ID })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.layout.maximizedPaneId).toBeNull()
    })

    it('SET_VIEW_MODE updates view mode', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_VIEW_MODE',
        payload: 'grid',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.layout.viewMode).toBe('grid')
    })

    it('SET_TEAM_LEAD sets team lead id', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_TEAM_LEAD',
        payload: 'agent-lead',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.layout.teamLeadId).toBe('agent-lead')
    })

    it('SELECT_TEAMMATE sets selected teammate', () => {
      const state = appReducer(initialAppState, {
        type: 'SELECT_TEAMMATE',
        payload: 'teammate-1',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.layout.selectedTeammateId).toBe('teammate-1')
    })

    it('SELECT_TEAMMATE clears selection with null', () => {
      let state = appReducer(initialAppState, {
        type: 'SELECT_TEAMMATE',
        payload: 'teammate-1',
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'SELECT_TEAMMATE',
        payload: null,
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.layout.selectedTeammateId).toBeNull()
    })

    it('TOGGLE_COMPANION toggles companion panel', () => {
      let state = appReducer(initialAppState, {
        type: 'TOGGLE_COMPANION',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.layout.companionPanelCollapsed).toBe(true)
      state = appReducer(state, { type: 'TOGGLE_COMPANION', tabId: DEFAULT_TAB_ID })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.layout.companionPanelCollapsed).toBe(false)
    })
  })

  describe('appReducer — per-tab editor', () => {
    it('ADD_EDITOR_TAB adds a tab', () => {
      const tab = makeEditorTab()
      const state = appReducer(initialAppState, {
        type: 'ADD_EDITOR_TAB',
        payload: tab,
        tabId: DEFAULT_TAB_ID
      })
      const ptab = state.tabs.get(DEFAULT_TAB_ID)!
      expect(ptab.editor.openFiles).toHaveLength(1)
      expect(ptab.editor.activeFileId).toBe('tab-1')
    })

    it('ADD_EDITOR_TAB does not duplicate existing tab', () => {
      const tab = makeEditorTab()
      let state = appReducer(initialAppState, {
        type: 'ADD_EDITOR_TAB',
        payload: tab,
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'ADD_EDITOR_TAB',
        payload: tab,
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.editor.openFiles).toHaveLength(1)
    })

    it('CLOSE_EDITOR_TAB removes a tab and selects previous', () => {
      const tab1 = makeEditorTab({ id: 'et-1' })
      const tab2 = makeEditorTab({ id: 'et-2', filePath: '/src/other.ts', fileName: 'other.ts' })
      let state = appReducer(initialAppState, {
        type: 'ADD_EDITOR_TAB',
        payload: tab1,
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'ADD_EDITOR_TAB',
        payload: tab2,
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'CLOSE_EDITOR_TAB',
        payload: 'et-2',
        tabId: DEFAULT_TAB_ID
      })
      const ptab = state.tabs.get(DEFAULT_TAB_ID)!
      expect(ptab.editor.openFiles).toHaveLength(1)
      expect(ptab.editor.activeFileId).toBe('et-1')
    })

    it('CLOSE_EDITOR_TAB sets activeFileId to null when last tab closed', () => {
      const tab = makeEditorTab()
      let state = appReducer(initialAppState, {
        type: 'ADD_EDITOR_TAB',
        payload: tab,
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'CLOSE_EDITOR_TAB',
        payload: 'tab-1',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.editor.activeFileId).toBeNull()
    })

    it('SET_ACTIVE_EDITOR_TAB changes active editor tab', () => {
      const tab1 = makeEditorTab({ id: 'et-1' })
      const tab2 = makeEditorTab({ id: 'et-2', filePath: '/src/other.ts', fileName: 'other.ts' })
      let state = appReducer(initialAppState, {
        type: 'ADD_EDITOR_TAB',
        payload: tab1,
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'ADD_EDITOR_TAB',
        payload: tab2,
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'SET_ACTIVE_EDITOR_TAB',
        payload: 'et-1',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.editor.activeFileId).toBe('et-1')
    })
  })

  describe('appReducer — per-tab notifications', () => {
    it('ADD_NOTIFICATION adds to specified tab', () => {
      const notif = makeNotification()
      const state = appReducer(initialAppState, {
        type: 'ADD_NOTIFICATION',
        payload: notif,
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.notifications).toHaveLength(1)
    })

    it('DISMISS_NOTIFICATION marks as read in specified tab', () => {
      const notif = makeNotification()
      let state = appReducer(initialAppState, {
        type: 'ADD_NOTIFICATION',
        payload: notif,
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'DISMISS_NOTIFICATION',
        payload: 'notif-1',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.notifications[0].read).toBe(true)
    })
  })

  describe('appReducer — per-tab team status', () => {
    it('SET_TEAM_STATUS updates team status', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_TEAM_STATUS',
        payload: 'running',
        tabId: DEFAULT_TAB_ID
      })
      expect(state.tabs.get(DEFAULT_TAB_ID)!.teamStatus).toBe('running')
    })
  })

  describe('appReducer — tab isolation', () => {
    it('agent action on tab-1 does not affect tab-2', () => {
      const agent = makeAgent()
      let state = stateWithTwoTabs()
      state = appReducer(state, { type: 'ADD_AGENT', payload: agent, tabId: 'tab-1' })
      expect(state.tabs.get('tab-1')!.agents.size).toBe(1)
      expect(state.tabs.get('tab-2')!.agents.size).toBe(0)
    })

    it('notification action on tab-2 does not affect tab-1', () => {
      const notif = makeNotification()
      let state = stateWithTwoTabs()
      state = appReducer(state, {
        type: 'ADD_NOTIFICATION',
        payload: notif,
        tabId: 'tab-2'
      })
      expect(state.tabs.get('tab-1')!.notifications).toHaveLength(0)
      expect(state.tabs.get('tab-2')!.notifications).toHaveLength(1)
    })

    it('layout action on tab-1 does not affect tab-2', () => {
      let state = stateWithTwoTabs()
      state = appReducer(state, {
        type: 'SET_VIEW_MODE',
        payload: 'grid',
        tabId: 'tab-1'
      })
      expect(state.tabs.get('tab-1')!.layout.viewMode).toBe('grid')
      expect(state.tabs.get('tab-2')!.layout.viewMode).toBe('lead')
    })
  })

  describe('hooks', () => {
    it('useAppState returns current state', () => {
      const { result } = renderHook(() => useAppState(), { wrapper })
      expect(result.current.tabs).toBeInstanceOf(Map)
      expect(result.current.activeTabId).toBeDefined()
    })

    it('useAppDispatch returns dispatch function', () => {
      const { result } = renderHook(() => useAppDispatch(), { wrapper })
      expect(typeof result.current).toBe('function')
    })

    it('dispatch updates state via useAppState', () => {
      const { result } = renderHook(
        () => ({ state: useAppState(), dispatch: useAppDispatch() }),
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'SET_ACTIVE_FEATURE_TAB',
          payload: 'editor'
        })
      })

      expect(result.current.state.activeFeatureTab).toBe('editor')
    })

    it('useActiveTab returns the active project tab', () => {
      const { result } = renderHook(() => useActiveTab(), { wrapper })
      expect(result.current.projectPath).toBe('~')
      expect(result.current.agents).toBeInstanceOf(Map)
    })

    it('useAppState throws outside provider', () => {
      expect(() => {
        renderHook(() => useAppState())
      }).toThrow()
    })

    it('useAppDispatch throws outside provider', () => {
      expect(() => {
        renderHook(() => useAppDispatch())
      }).toThrow()
    })
  })
})
