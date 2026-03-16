import { describe, it, expect } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import {
  AppProvider,
  useAppState,
  useAppDispatch,
  appReducer,
  initialAppState
} from '../../../renderer/src/state/AppContext'
import type { AgentState, EditorTab, AppNotification } from '../../../shared/types'

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

function makeEditorTab(overrides: Partial<EditorTab> = {}): EditorTab {
  return {
    id: 'tab-1',
    filePath: '/src/index.ts',
    fileName: 'index.ts',
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

describe('AppContext', () => {
  describe('initialAppState', () => {
    it('has sensible defaults', () => {
      expect(initialAppState.project.name).toBe('')
      expect(initialAppState.project.path).toBe('')
      expect(initialAppState.agents).toBeInstanceOf(Map)
      expect(initialAppState.agents.size).toBe(0)
      expect(initialAppState.layout.sidebarWidth).toBe(250)
      expect(initialAppState.layout.activeTab).toBe('agents')
      expect(initialAppState.layout.sidebarCollapsed).toBe(false)
      expect(initialAppState.editor.openFiles).toEqual([])
      expect(initialAppState.editor.activeFileId).toBeNull()
      expect(initialAppState.notifications).toEqual([])
    })
  })

  describe('appReducer', () => {
    it('SET_PROJECT updates project info', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_PROJECT',
        payload: { name: 'my-project', path: '/path/to/project' }
      })
      expect(state.project.name).toBe('my-project')
      expect(state.project.path).toBe('/path/to/project')
    })

    it('ADD_AGENT adds an agent to the map', () => {
      const agent = makeAgent()
      const state = appReducer(initialAppState, {
        type: 'ADD_AGENT',
        payload: agent
      })
      expect(state.agents.size).toBe(1)
      expect(state.agents.get('agent-1')).toEqual(agent)
    })

    it('UPDATE_AGENT updates an existing agent', () => {
      const agent = makeAgent()
      let state = appReducer(initialAppState, {
        type: 'ADD_AGENT',
        payload: agent
      })
      state = appReducer(state, {
        type: 'UPDATE_AGENT',
        payload: { id: 'agent-1', status: 'waiting', needsInput: true }
      })
      expect(state.agents.get('agent-1')!.status).toBe('waiting')
      expect(state.agents.get('agent-1')!.needsInput).toBe(true)
      expect(state.agents.get('agent-1')!.name).toBe('architect')
    })

    it('UPDATE_AGENT is a no-op for non-existent agent', () => {
      const state = appReducer(initialAppState, {
        type: 'UPDATE_AGENT',
        payload: { id: 'ghost', status: 'stopped' }
      })
      expect(state.agents.size).toBe(0)
    })

    it('REMOVE_AGENT removes an agent', () => {
      const agent = makeAgent()
      let state = appReducer(initialAppState, {
        type: 'ADD_AGENT',
        payload: agent
      })
      state = appReducer(state, {
        type: 'REMOVE_AGENT',
        payload: 'agent-1'
      })
      expect(state.agents.size).toBe(0)
    })

    it('SET_LAYOUT updates layout settings', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_LAYOUT',
        payload: { gridConfig: { layout: '2x2', columns: 2, rows: 2 } }
      })
      expect(state.layout.gridConfig.layout).toBe('2x2')
    })

    it('SET_ACTIVE_TAB updates active tab', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_ACTIVE_TAB',
        payload: 'editor'
      })
      expect(state.layout.activeTab).toBe('editor')
    })

    it('SET_SIDEBAR_WIDTH updates sidebar width', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_SIDEBAR_WIDTH',
        payload: 300
      })
      expect(state.layout.sidebarWidth).toBe(300)
    })

    it('TOGGLE_SIDEBAR toggles sidebar collapsed state', () => {
      let state = appReducer(initialAppState, { type: 'TOGGLE_SIDEBAR' })
      expect(state.layout.sidebarCollapsed).toBe(true)
      state = appReducer(state, { type: 'TOGGLE_SIDEBAR' })
      expect(state.layout.sidebarCollapsed).toBe(false)
    })

    it('ADD_EDITOR_TAB adds a tab', () => {
      const tab = makeEditorTab()
      const state = appReducer(initialAppState, {
        type: 'ADD_EDITOR_TAB',
        payload: tab
      })
      expect(state.editor.openFiles).toHaveLength(1)
      expect(state.editor.activeFileId).toBe('tab-1')
    })

    it('ADD_EDITOR_TAB does not duplicate existing tab', () => {
      const tab = makeEditorTab()
      let state = appReducer(initialAppState, {
        type: 'ADD_EDITOR_TAB',
        payload: tab
      })
      state = appReducer(state, {
        type: 'ADD_EDITOR_TAB',
        payload: tab
      })
      expect(state.editor.openFiles).toHaveLength(1)
      expect(state.editor.activeFileId).toBe('tab-1')
    })

    it('CLOSE_EDITOR_TAB removes a tab', () => {
      const tab1 = makeEditorTab({ id: 'tab-1' })
      const tab2 = makeEditorTab({ id: 'tab-2', filePath: '/src/other.ts', fileName: 'other.ts' })
      let state = appReducer(initialAppState, { type: 'ADD_EDITOR_TAB', payload: tab1 })
      state = appReducer(state, { type: 'ADD_EDITOR_TAB', payload: tab2 })
      state = appReducer(state, { type: 'CLOSE_EDITOR_TAB', payload: 'tab-2' })
      expect(state.editor.openFiles).toHaveLength(1)
      expect(state.editor.activeFileId).toBe('tab-1')
    })

    it('CLOSE_EDITOR_TAB sets activeFileId to null when last tab closed', () => {
      const tab = makeEditorTab()
      let state = appReducer(initialAppState, { type: 'ADD_EDITOR_TAB', payload: tab })
      state = appReducer(state, { type: 'CLOSE_EDITOR_TAB', payload: 'tab-1' })
      expect(state.editor.openFiles).toHaveLength(0)
      expect(state.editor.activeFileId).toBeNull()
    })

    it('SET_ACTIVE_EDITOR_TAB changes active editor tab', () => {
      const tab1 = makeEditorTab({ id: 'tab-1' })
      const tab2 = makeEditorTab({ id: 'tab-2', filePath: '/src/other.ts', fileName: 'other.ts' })
      let state = appReducer(initialAppState, { type: 'ADD_EDITOR_TAB', payload: tab1 })
      state = appReducer(state, { type: 'ADD_EDITOR_TAB', payload: tab2 })
      state = appReducer(state, { type: 'SET_ACTIVE_EDITOR_TAB', payload: 'tab-1' })
      expect(state.editor.activeFileId).toBe('tab-1')
    })

    it('ADD_NOTIFICATION adds a notification', () => {
      const notif = makeNotification()
      const state = appReducer(initialAppState, {
        type: 'ADD_NOTIFICATION',
        payload: notif
      })
      expect(state.notifications).toHaveLength(1)
      expect(state.notifications[0].message).toBe('Needs input')
    })

    it('DISMISS_NOTIFICATION marks notification as read', () => {
      const notif = makeNotification()
      let state = appReducer(initialAppState, { type: 'ADD_NOTIFICATION', payload: notif })
      state = appReducer(state, { type: 'DISMISS_NOTIFICATION', payload: 'notif-1' })
      expect(state.notifications[0].read).toBe(true)
    })

    it('MAXIMIZE_PANE sets maximized agent id', () => {
      const state = appReducer(initialAppState, {
        type: 'MAXIMIZE_PANE',
        payload: 'agent-1'
      })
      expect(state.layout.maximizedPaneId).toBe('agent-1')
    })

    it('RESTORE_PANE clears maximized agent id', () => {
      let state = appReducer(initialAppState, { type: 'MAXIMIZE_PANE', payload: 'agent-1' })
      state = appReducer(state, { type: 'RESTORE_PANE' })
      expect(state.layout.maximizedPaneId).toBeNull()
    })
  })

  describe('hooks', () => {
    it('useAppState returns current state', () => {
      const { result } = renderHook(() => useAppState(), { wrapper })
      expect(result.current.project.name).toBe('')
      expect(result.current.agents).toBeInstanceOf(Map)
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
          type: 'SET_PROJECT',
          payload: { name: 'test', path: '/test' }
        })
      })

      expect(result.current.state.project.name).toBe('test')
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
