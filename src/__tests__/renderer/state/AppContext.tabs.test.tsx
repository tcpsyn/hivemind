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
import type { AgentState, AppNotification } from '../../../shared/types'

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

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

describe('AppContext — Multi-Project Tabs', () => {
  describe('initialAppState', () => {
    it('starts with one default tab at ~', () => {
      expect(initialAppState.tabs.size).toBe(1)
      const defaultTab = Array.from(initialAppState.tabs.values())[0]
      expect(defaultTab.projectPath).toBe('~')
      expect(defaultTab.projectName).toBe('~')
    })

    it('has activeFeatureTab set to agents', () => {
      expect(initialAppState.activeFeatureTab).toBe('agents')
    })

    it('has empty recentProjects', () => {
      expect(initialAppState.recentProjects).toEqual([])
    })

    it('globalLayout has tabOrder matching initial tab', () => {
      expect(initialAppState.globalLayout.tabOrder).toHaveLength(1)
      expect(initialAppState.globalLayout.tabOrder[0]).toBe(initialAppState.activeTabId)
    })
  })

  describe('createProjectTab helper', () => {
    it('derives projectName from path basename', () => {
      const tab = createProjectTab('t1', '/home/user/my-project')
      expect(tab.projectName).toBe('my-project')
    })

    it('uses explicit projectName when provided', () => {
      const tab = createProjectTab('t1', '/some/path', 'custom-name')
      expect(tab.projectName).toBe('custom-name')
    })

    it('creates tab with empty agents and stopped team', () => {
      const tab = createProjectTab('t1', '/path')
      expect(tab.agents.size).toBe(0)
      expect(tab.teamStatus).toBe('stopped')
      expect(tab.notifications).toEqual([])
      expect(tab.editor.openFiles).toEqual([])
      expect(tab.editor.activeFileId).toBeNull()
    })
  })

  describe('CREATE_TAB', () => {
    it('creates a new tab with project path and name', () => {
      const state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/home/user/project-a', projectName: 'project-a' }
      })
      expect(state.tabs.has('tab-1')).toBe(true)
      expect(state.tabs.get('tab-1')!.projectPath).toBe('/home/user/project-a')
      expect(state.tabs.get('tab-1')!.projectName).toBe('project-a')
    })

    it('sets new tab as active', () => {
      const state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/path', projectName: 'proj' }
      })
      expect(state.activeTabId).toBe('tab-1')
    })

    it('new tab starts with empty agents and stopped team', () => {
      const state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/path', projectName: 'proj' }
      })
      const tab = state.tabs.get('tab-1')!
      expect(tab.agents.size).toBe(0)
      expect(tab.teamStatus).toBe('stopped')
    })

    it('adds tab ID to tabOrder', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      expect(state.globalLayout.tabOrder).toContain('tab-1')
      expect(state.globalLayout.tabOrder).toContain('tab-2')
    })

    it('is a no-op for duplicate tab ID', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      const tabCountBefore = state.tabs.size
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/b', projectName: 'b' }
      })
      expect(state.tabs.size).toBe(tabCountBefore)
      // Original path preserved
      expect(state.tabs.get('tab-1')!.projectPath).toBe('/a')
    })
  })

  describe('CLOSE_TAB', () => {
    it('removes the tab from state', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      state = appReducer(state, { type: 'CLOSE_TAB', payload: 'tab-1' })
      expect(state.tabs.has('tab-1')).toBe(false)
    })

    it('switches to adjacent tab when active tab is closed', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      // tab-2 is now active; close it
      state = appReducer(state, { type: 'CLOSE_TAB', payload: 'tab-2' })
      expect(state.activeTabId).toBe('tab-1')
    })

    it('closing last tab creates a new empty tab at ~', () => {
      // Close the default tab
      let state = appReducer(initialAppState, {
        type: 'CLOSE_TAB',
        payload: initialAppState.activeTabId
      })
      expect(state.tabs.size).toBe(1)
      const remaining = Array.from(state.tabs.values())[0]
      expect(remaining.projectPath).toBe('~')
    })

    it('removes tab from tabOrder', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      state = appReducer(state, { type: 'CLOSE_TAB', payload: 'tab-1' })
      expect(state.globalLayout.tabOrder).not.toContain('tab-1')
    })

    it('is a no-op for unknown tab ID', () => {
      const state = appReducer(initialAppState, { type: 'CLOSE_TAB', payload: 'nonexistent' })
      expect(state).toBe(initialAppState)
    })

    it('does not change active tab when closing a non-active tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      // tab-2 is active, close tab-1
      state = appReducer(state, { type: 'CLOSE_TAB', payload: 'tab-1' })
      expect(state.activeTabId).toBe('tab-2')
    })
  })

  describe('SET_ACTIVE_PROJECT_TAB', () => {
    it('switches the active project tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      state = appReducer(state, { type: 'SET_ACTIVE_PROJECT_TAB', payload: 'tab-1' })
      expect(state.activeTabId).toBe('tab-1')
    })

    it('is a no-op for unknown tab ID', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_ACTIVE_PROJECT_TAB',
        payload: 'nonexistent'
      })
      expect(state.activeTabId).toBe(initialAppState.activeTabId)
    })
  })

  describe('SET_ACTIVE_FEATURE_TAB (global)', () => {
    it('sets the global active feature tab', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_ACTIVE_FEATURE_TAB',
        payload: 'editor'
      })
      expect(state.activeFeatureTab).toBe('editor')
    })

    it('persists across project tab switches', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      state = appReducer(state, { type: 'SET_ACTIVE_FEATURE_TAB', payload: 'git' })
      state = appReducer(state, { type: 'SET_ACTIVE_PROJECT_TAB', payload: 'tab-1' })
      expect(state.activeFeatureTab).toBe('git')
    })
  })

  describe('per-tab agent actions use tabId field', () => {
    it('ADD_AGENT scopes to the correct tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      const agent = makeAgent({ id: 'agent-tab1' })
      state = appReducer(state, { type: 'ADD_AGENT', payload: agent, tabId: 'tab-1' })

      expect(state.tabs.get('tab-1')!.agents.has('agent-tab1')).toBe(true)
      expect(state.tabs.get('tab-2')!.agents.has('agent-tab1')).toBe(false)
    })

    it('UPDATE_AGENT only affects the target tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      const agent = makeAgent({ id: 'a1', status: 'running' })
      state = appReducer(state, { type: 'ADD_AGENT', payload: agent, tabId: 'tab-1' })
      state = appReducer(state, {
        type: 'UPDATE_AGENT',
        payload: { id: 'a1', status: 'stopped' },
        tabId: 'tab-1'
      })
      expect(state.tabs.get('tab-1')!.agents.get('a1')!.status).toBe('stopped')
    })

    it('REMOVE_AGENT only affects the target tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      const agent = makeAgent({ id: 'a1' })
      state = appReducer(state, { type: 'ADD_AGENT', payload: agent, tabId: 'tab-1' })
      state = appReducer(state, { type: 'REMOVE_AGENT', payload: 'a1', tabId: 'tab-1' })
      expect(state.tabs.get('tab-1')!.agents.size).toBe(0)
    })

    it('agent action with unknown tabId is a no-op', () => {
      const agent = makeAgent()
      const state = appReducer(initialAppState, {
        type: 'ADD_AGENT',
        payload: agent,
        tabId: 'nonexistent'
      })
      // No tab should have been modified
      for (const tab of state.tabs.values()) {
        expect(tab.agents.size).toBe(0)
      }
    })
  })

  describe('per-tab notifications use tabId field', () => {
    it('ADD_NOTIFICATION scopes to the correct tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      const notif = makeNotification({ id: 'n1' })
      state = appReducer(state, { type: 'ADD_NOTIFICATION', payload: notif, tabId: 'tab-1' })

      expect(state.tabs.get('tab-1')!.notifications).toHaveLength(1)
      expect(state.tabs.get('tab-2')!.notifications).toHaveLength(0)
    })

    it('DISMISS_NOTIFICATION scopes to the correct tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      const notif = makeNotification({ id: 'n1' })
      state = appReducer(state, { type: 'ADD_NOTIFICATION', payload: notif, tabId: 'tab-1' })
      state = appReducer(state, { type: 'DISMISS_NOTIFICATION', payload: 'n1', tabId: 'tab-1' })
      expect(state.tabs.get('tab-1')!.notifications[0].read).toBe(true)
    })
  })

  describe('per-tab team status', () => {
    it('SET_TEAM_STATUS updates the correct tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, { type: 'SET_TEAM_STATUS', payload: 'running', tabId: 'tab-1' })
      expect(state.tabs.get('tab-1')!.teamStatus).toBe('running')
    })
  })

  describe('per-tab layout actions', () => {
    it('MAXIMIZE_PANE scopes to the correct tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, { type: 'MAXIMIZE_PANE', payload: 'agent-1', tabId: 'tab-1' })
      expect(state.tabs.get('tab-1')!.layout.maximizedPaneId).toBe('agent-1')
    })

    it('RESTORE_PANE scopes to the correct tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, { type: 'MAXIMIZE_PANE', payload: 'agent-1', tabId: 'tab-1' })
      state = appReducer(state, { type: 'RESTORE_PANE', tabId: 'tab-1' })
      expect(state.tabs.get('tab-1')!.layout.maximizedPaneId).toBeNull()
    })

    it('SET_VIEW_MODE scopes to the correct tab', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, { type: 'SET_VIEW_MODE', payload: 'grid', tabId: 'tab-1' })
      expect(state.tabs.get('tab-1')!.layout.viewMode).toBe('grid')
    })
  })

  describe('ADD_RECENT_PROJECT', () => {
    it('adds project to front of recent list', () => {
      const state = appReducer(initialAppState, {
        type: 'ADD_RECENT_PROJECT',
        payload: '/home/user/project-a'
      })
      expect(state.recentProjects[0]).toBe('/home/user/project-a')
    })

    it('moves duplicate to front rather than adding again', () => {
      let state = appReducer(initialAppState, {
        type: 'ADD_RECENT_PROJECT',
        payload: '/a'
      })
      state = appReducer(state, { type: 'ADD_RECENT_PROJECT', payload: '/b' })
      state = appReducer(state, { type: 'ADD_RECENT_PROJECT', payload: '/a' })
      expect(state.recentProjects).toEqual(['/a', '/b'])
    })

    it('caps at 10 entries', () => {
      let state = initialAppState
      for (let i = 0; i < 15; i++) {
        state = appReducer(state, { type: 'ADD_RECENT_PROJECT', payload: `/project-${i}` })
      }
      expect(state.recentProjects).toHaveLength(10)
      // Most recent should be first
      expect(state.recentProjects[0]).toBe('/project-14')
    })
  })

  describe('REORDER_TABS', () => {
    it('updates tab order', () => {
      let state = appReducer(initialAppState, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
      })
      state = appReducer(state, {
        type: 'CREATE_TAB',
        payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
      })
      const reversed = [...state.globalLayout.tabOrder].reverse()
      state = appReducer(state, { type: 'REORDER_TABS', payload: reversed })
      expect(state.globalLayout.tabOrder).toEqual(reversed)
    })
  })

  describe('hooks', () => {
    it('useAppState returns state with tabs Map', () => {
      const { result } = renderHook(() => useAppState(), { wrapper })
      expect(result.current.tabs).toBeInstanceOf(Map)
      expect(result.current.tabs.size).toBeGreaterThanOrEqual(1)
    })

    it('useActiveTab returns the currently active ProjectTab', () => {
      const { result } = renderHook(() => useActiveTab(), { wrapper })
      expect(result.current.id).toBe(initialAppState.activeTabId)
      expect(result.current.projectPath).toBe('~')
    })

    it('dispatch CREATE_TAB updates state via hooks', () => {
      const { result } = renderHook(
        () => ({ state: useAppState(), dispatch: useAppDispatch() }),
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-new', projectPath: '/test', projectName: 'test' }
        })
      })

      expect(result.current.state.tabs.has('tab-new')).toBe(true)
      expect(result.current.state.activeTabId).toBe('tab-new')
    })

    it('dispatch SET_ACTIVE_FEATURE_TAB is global', () => {
      const { result } = renderHook(
        () => ({ state: useAppState(), dispatch: useAppDispatch() }),
        { wrapper }
      )

      act(() => {
        result.current.dispatch({ type: 'SET_ACTIVE_FEATURE_TAB', payload: 'editor' })
      })

      expect(result.current.state.activeFeatureTab).toBe('editor')
    })
  })
})
