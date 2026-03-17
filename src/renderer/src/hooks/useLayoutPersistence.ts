import { useEffect, useRef } from 'react'
import { useAppState, useAppDispatch } from '../state/AppContext'

export interface LayoutStorage {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

interface PersistedLayout {
  sidebarWidth: number
  activeTab: string
  sidebarCollapsed: boolean
  gridConfig: { layout: string; columns: number; rows: number }
}

interface PersistedProject {
  name: string
  path: string
}

export function createLocalStorage(): LayoutStorage {
  return {
    get(key: string) {
      try {
        const raw = localStorage.getItem(`cc-frontend:${key}`)
        return raw ? JSON.parse(raw) : undefined
      } catch {
        return undefined
      }
    },
    set(key: string, value: unknown) {
      try {
        localStorage.setItem(`cc-frontend:${key}`, JSON.stringify(value))
      } catch {
        // Storage full or unavailable
      }
    }
  }
}

export function useLayoutPersistence(storage: LayoutStorage) {
  const state = useAppState()
  const dispatch = useAppDispatch()
  const isInitialized = useRef(false)

  // Restore on mount
  useEffect(() => {
    if (isInitialized.current) return
    isInitialized.current = true

    const savedLayout = storage.get('layout') as PersistedLayout | undefined
    if (savedLayout) {
      if (savedLayout.sidebarWidth) {
        dispatch({ type: 'SET_SIDEBAR_WIDTH', payload: savedLayout.sidebarWidth })
      }
      if (savedLayout.activeTab) {
        dispatch({
          type: 'SET_ACTIVE_TAB',
          payload: savedLayout.activeTab as 'agents' | 'editor' | 'git'
        })
      }
      if (savedLayout.sidebarCollapsed) {
        dispatch({ type: 'TOGGLE_SIDEBAR' })
      }
      if (savedLayout.gridConfig) {
        dispatch({
          type: 'SET_LAYOUT',
          payload: {
            gridConfig: {
              layout: savedLayout.gridConfig.layout as 'auto',
              columns: savedLayout.gridConfig.columns,
              rows: savedLayout.gridConfig.rows
            }
          }
        })
      }
    }

    const savedProject = storage.get('project') as PersistedProject | undefined
    if (savedProject) {
      dispatch({ type: 'SET_PROJECT', payload: savedProject })
    }
  }, [storage, dispatch])

  // Persist on state change
  useEffect(() => {
    if (!isInitialized.current) return

    storage.set('layout', {
      sidebarWidth: state.layout.sidebarWidth,
      activeTab: state.layout.activeTab,
      sidebarCollapsed: state.layout.sidebarCollapsed,
      gridConfig: state.layout.gridConfig
    })
  }, [
    storage,
    state.layout.sidebarWidth,
    state.layout.activeTab,
    state.layout.sidebarCollapsed,
    state.layout.gridConfig
  ])

  useEffect(() => {
    if (!isInitialized.current) return
    if (state.project.name || state.project.path) {
      storage.set('project', state.project)
    }
  }, [storage, state.project])
}
