import { useEffect, useCallback } from 'react'
import { useAppState, useAppDispatch } from '../state/AppContext'
import type { ActiveTab } from '../../../shared/types'

const TAB_ORDER: ActiveTab[] = ['agents', 'editor', 'git']

interface KeyboardShortcutOptions {
  onQuickOpen?: () => void
}

export function useKeyboardShortcuts(options: KeyboardShortcutOptions = {}) {
  const state = useAppState()
  const dispatch = useAppDispatch()

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey

      if (mod && e.key === 'b') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_SIDEBAR' })
        return
      }

      if (mod && e.key === 'Tab') {
        e.preventDefault()
        const currentIndex = TAB_ORDER.indexOf(state.layout.activeTab)
        const nextIndex = (currentIndex + 1) % TAB_ORDER.length
        dispatch({ type: 'SET_ACTIVE_TAB', payload: TAB_ORDER[nextIndex] })
        return
      }

      if (mod && e.key === 'w') {
        e.preventDefault()
        if (state.editor.activeFileId) {
          dispatch({ type: 'CLOSE_EDITOR_TAB', payload: state.editor.activeFileId })
        }
        return
      }

      if (mod && e.key === 'p') {
        e.preventDefault()
        options.onQuickOpen?.()
        return
      }

      if (mod && e.key === 'g') {
        e.preventDefault()
        dispatch({
          type: 'SET_VIEW_MODE',
          payload: state.layout.viewMode === 'lead' ? 'grid' : 'lead'
        })
        return
      }

      if (mod && e.key === '\\') {
        e.preventDefault()
        dispatch({ type: 'TOGGLE_COMPANION' })
        return
      }

      if (mod && e.key >= '1' && e.key <= '4') {
        e.preventDefault()
        const index = parseInt(e.key, 10) - 1
        const agents = Array.from(state.agents.values())
        if (index < agents.length) {
          dispatch({ type: 'MAXIMIZE_PANE', payload: agents[index].id })
        }
        return
      }

      if (e.key === 'Escape') {
        if (state.layout.maximizedPaneId) {
          e.preventDefault()
          dispatch({ type: 'RESTORE_PANE' })
        }
        return
      }
    },
    [
      dispatch,
      state.layout.activeTab,
      state.layout.viewMode,
      state.editor.activeFileId,
      state.layout.maximizedPaneId,
      state.agents,
      options
    ]
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])
}
