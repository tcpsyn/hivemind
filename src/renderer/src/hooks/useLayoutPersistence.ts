import { useEffect, useRef } from 'react'
import { useAppState, useAppDispatch } from '../state/AppContext'
import type { ActiveTab } from '../../../shared/types'

export interface LayoutStorage {
  get: (key: string) => unknown
  set: (key: string, value: unknown) => void
}

interface PersistedLayout {
  sidebarWidth: number
  activeTab: string
  sidebarCollapsed: boolean
}

export function createLocalStorage(): LayoutStorage {
  return {
    get(key: string) {
      try {
        const raw = localStorage.getItem(`hivemind:${key}`)
        return raw ? JSON.parse(raw) : undefined
      } catch {
        return undefined
      }
    },
    set(key: string, value: unknown) {
      try {
        localStorage.setItem(`hivemind:${key}`, JSON.stringify(value))
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
          type: 'SET_ACTIVE_FEATURE_TAB',
          payload: savedLayout.activeTab as ActiveTab
        })
      }
      if (savedLayout.sidebarCollapsed) {
        dispatch({ type: 'TOGGLE_SIDEBAR' })
      }
    }
  }, [storage, dispatch])

  // Persist global layout on state change
  useEffect(() => {
    if (!isInitialized.current) return

    storage.set('layout', {
      sidebarWidth: state.globalLayout.sidebarWidth,
      activeTab: state.activeFeatureTab,
      sidebarCollapsed: state.globalLayout.sidebarCollapsed
    })
  }, [
    storage,
    state.globalLayout.sidebarWidth,
    state.activeFeatureTab,
    state.globalLayout.sidebarCollapsed
  ])
}
