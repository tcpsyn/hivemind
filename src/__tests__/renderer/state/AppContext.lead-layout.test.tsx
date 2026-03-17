import { describe, it, expect } from 'vitest'
import {
  appReducer,
  initialAppState
} from '../../../renderer/src/state/AppContext'

describe('AppContext - Lead Layout state', () => {
  describe('initialAppState', () => {
    it('has viewMode defaulting to lead', () => {
      expect(initialAppState.layout.viewMode).toBe('lead')
    })

    it('has teamLeadId defaulting to null', () => {
      expect(initialAppState.layout.teamLeadId).toBeNull()
    })

    it('has selectedTeammateId defaulting to null', () => {
      expect(initialAppState.layout.selectedTeammateId).toBeNull()
    })

    it('has companionPanelCollapsed defaulting to false', () => {
      expect(initialAppState.layout.companionPanelCollapsed).toBe(false)
    })
  })

  describe('SET_VIEW_MODE', () => {
    it('switches to grid mode', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_VIEW_MODE',
        payload: 'grid'
      })
      expect(state.layout.viewMode).toBe('grid')
    })

    it('switches back to lead mode', () => {
      let state = appReducer(initialAppState, {
        type: 'SET_VIEW_MODE',
        payload: 'grid'
      })
      state = appReducer(state, {
        type: 'SET_VIEW_MODE',
        payload: 'lead'
      })
      expect(state.layout.viewMode).toBe('lead')
    })
  })

  describe('SET_TEAM_LEAD', () => {
    it('sets the team lead id', () => {
      const state = appReducer(initialAppState, {
        type: 'SET_TEAM_LEAD',
        payload: 'agent-lead'
      })
      expect(state.layout.teamLeadId).toBe('agent-lead')
    })
  })

  describe('SELECT_TEAMMATE', () => {
    it('sets the selected teammate id', () => {
      const state = appReducer(initialAppState, {
        type: 'SELECT_TEAMMATE',
        payload: 'teammate-1'
      })
      expect(state.layout.selectedTeammateId).toBe('teammate-1')
    })

    it('clears selection with null', () => {
      let state = appReducer(initialAppState, {
        type: 'SELECT_TEAMMATE',
        payload: 'teammate-1'
      })
      state = appReducer(state, {
        type: 'SELECT_TEAMMATE',
        payload: null
      })
      expect(state.layout.selectedTeammateId).toBeNull()
    })
  })

  describe('TOGGLE_COMPANION', () => {
    it('toggles companion panel collapsed state', () => {
      let state = appReducer(initialAppState, { type: 'TOGGLE_COMPANION' })
      expect(state.layout.companionPanelCollapsed).toBe(true)
      state = appReducer(state, { type: 'TOGGLE_COMPANION' })
      expect(state.layout.companionPanelCollapsed).toBe(false)
    })
  })
})
