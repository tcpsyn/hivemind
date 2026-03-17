import { useEffect, useCallback } from 'react'
import { useAppState, useAppDispatch } from '../state/AppContext'
import type { ActiveTab } from '../../../shared/types'

const FEATURE_TAB_ORDER: ActiveTab[] = ['agents', 'editor', 'git']

interface KeyboardShortcutOptions {
  onQuickOpen?: () => void
  onNewTab?: () => void
  onCloseTab?: (tabId: string, teamRunning: boolean) => void
}

export function useKeyboardShortcuts({
  onQuickOpen,
  onNewTab,
  onCloseTab
}: KeyboardShortcutOptions = {}) {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      // Cmd+B: toggle sidebar
      if (mod && !e.shiftKey && e.key === 'b') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_SIDEBAR' })
        return
      }

      // Cmd+Tab: cycle feature tabs (agents → editor → git)
      if (mod && e.key === 'Tab') {
        e.preventDefault()
        const currentIndex = FEATURE_TAB_ORDER.indexOf(state.activeFeatureTab)
        const nextIndex = (currentIndex + 1) % FEATURE_TAB_ORDER.length
        dispatch({ type: 'SET_ACTIVE_FEATURE_TAB', payload: FEATURE_TAB_ORDER[nextIndex] })
        return
      }

      // Cmd+T: new tab
      if (mod && !e.shiftKey && e.key === 't') {
        e.preventDefault()
        onNewTab?.()
        return
      }

      // Cmd+W: close current project tab
      if (mod && !e.shiftKey && e.key === 'w') {
        e.preventDefault()
        const activeTab = state.tabs.get(state.activeTabId)
        if (activeTab) {
          onCloseTab?.(state.activeTabId, activeTab.teamStatus === 'running')
        }
        return
      }

      // Cmd+P: quick open
      if (mod && !e.shiftKey && e.key === 'p') {
        e.preventDefault()
        onQuickOpen?.()
        return
      }

      // Cmd+G: toggle view mode
      if (mod && !e.shiftKey && e.key === 'g') {
        e.preventDefault()
        const activeTab = state.tabs.get(state.activeTabId)
        if (activeTab) {
          dispatch({
            type: 'SET_VIEW_MODE',
            payload: activeTab.layout.viewMode === 'lead' ? 'grid' : 'lead',
            tabId: state.activeTabId
          })
        }
        return
      }

      // Cmd+\: toggle companion panel
      if (mod && e.key === '\\') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_COMPANION', tabId: state.activeTabId })
        return
      }

      // Cmd+Shift+[ / Cmd+Shift+]: previous / next project tab
      if (mod && e.shiftKey && (e.key === '[' || e.key === ']')) {
        e.preventDefault()
        const { tabOrder } = state.globalLayout
        const currentIndex = tabOrder.indexOf(state.activeTabId)
        if (currentIndex === -1) return
        const delta = e.key === '[' ? -1 : 1
        const nextIndex = (currentIndex + delta + tabOrder.length) % tabOrder.length
        dispatch({ type: 'SET_ACTIVE_PROJECT_TAB', payload: tabOrder[nextIndex] })
        return
      }

      // Cmd+1-9: switch to project tab by position (Cmd+9 = last)
      if (mod && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault()
        const { tabOrder } = state.globalLayout
        const index = e.key === '9' ? tabOrder.length - 1 : parseInt(e.key, 10) - 1
        if (index < tabOrder.length) {
          dispatch({ type: 'SET_ACTIVE_PROJECT_TAB', payload: tabOrder[index] })
        }
        return
      }

      // Escape: restore maximized pane
      if (e.key === 'Escape') {
        const activeTab = state.tabs.get(state.activeTabId)
        if (activeTab?.layout.maximizedPaneId) {
          e.preventDefault()
          dispatch({ type: 'RESTORE_PANE', tabId: state.activeTabId })
        }
        return
      }
    },
    [
      dispatch,
      state.activeFeatureTab,
      state.activeTabId,
      state.tabs,
      state.globalLayout,
      onQuickOpen,
      onNewTab,
      onCloseTab
    ]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
