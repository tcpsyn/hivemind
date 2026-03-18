import { describe, it, expect } from 'vitest'
import { appReducer, initialAppState } from '../../../renderer/src/state/AppContext'

const DEFAULT_TAB_ID = 'tab-default'

function getTab(state: ReturnType<typeof appReducer>) {
  return state.tabs.get(DEFAULT_TAB_ID)!
}

describe('AppContext - Lead Layout state', () => {
  describe('initialAppState', () => {
    it('has viewMode defaulting to lead', () => {
      expect(getTab(initialAppState).layout.viewMode).toBe('lead')
    })

    it('has teamLeadId defaulting to null', () => {
      expect(getTab(initialAppState).layout.teamLeadId).toBeNull()
    })

    it('has selectedTeammateId defaulting to null', () => {
      expect(getTab(initialAppState).layout.selectedTeammateId).toBeNull()
    })

    it('has companionPanelCollapsed defaulting to false', () => {
      expect(getTab(initialAppState).layout.companionPanelCollapsed).toBe(false)
    })
  })

  describe('SET_VIEW_MODE', () => {
    it('switches to grid mode', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_VIEW_MODE',
        payload: 'grid',
        tabId: DEFAULT_TAB_ID
      })
      expect(getTab(state).layout.viewMode).toBe('grid')
    })

    it('switches back to lead mode', () => {
      let state = appReducer(initialAppState, {
        type: 'SET_VIEW_MODE',
        payload: 'grid',
        tabId: DEFAULT_TAB_ID
      })
      state = appReducer(state, {
        type: 'SET_VIEW_MODE',
        payload: 'lead',
        tabId: DEFAULT_TAB_ID
      })
      expect(getTab(state).layout.viewMode).toBe('lead')
    })
  })

  describe('SET_TEAM_LEAD', () => {
    it('sets the team lead id', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_TEAM_LEAD',
        payload: 'agent-lead',
        tabId: DEFAULT_TAB_ID
      })
      expect(getTab(state).layout.teamLeadId).toBe('agent-lead')
    })
  })

  describe('SELECT_TEAMMATE', () => {
    it('sets the selected teammate id', () => {
      const state = appReducer(initialAppState, {
        type: 'SELECT_TEAMMATE',
        payload: 'teammate-1',
        tabId: DEFAULT_TAB_ID
      })
      expect(getTab(state).layout.selectedTeammateId).toBe('teammate-1')
    })

    it('clears selection with null', () => {
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
      expect(getTab(state).layout.selectedTeammateId).toBeNull()
    })
  })

  describe('TOGGLE_COMPANION', () => {
    it('toggles companion panel collapsed state', () => {
      let state = appReducer(initialAppState, {
        type: 'TOGGLE_COMPANION',
        tabId: DEFAULT_TAB_ID
      })
      expect(getTab(state).layout.companionPanelCollapsed).toBe(true)
      state = appReducer(state, { type: 'TOGGLE_COMPANION', tabId: DEFAULT_TAB_ID })
      expect(getTab(state).layout.companionPanelCollapsed).toBe(false)
    })
  })
})
