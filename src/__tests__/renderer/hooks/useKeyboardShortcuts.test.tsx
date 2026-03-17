import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import {
  AppProvider,
  useAppState,
  useAppDispatch,
  useActiveTab
} from '../../../renderer/src/state/AppContext'
import { useKeyboardShortcuts } from '../../../renderer/src/hooks/useKeyboardShortcuts'
import type { AgentState, AppState, EditorTab } from '../../../shared/types'

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts
  })
  document.dispatchEvent(event)
}

describe('useKeyboardShortcuts', () => {
  it('mounts without error', () => {
    renderHook(() => useKeyboardShortcuts(), { wrapper })
  })

  describe('Cmd+B: toggle sidebar', () => {
    it('toggles sidebar collapsed state', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useAppState()
        },
        { wrapper }
      )

      expect(result.current.globalLayout.sidebarCollapsed).toBe(false)

      act(() => fireKey('b', { metaKey: true }))
      expect(result.current.globalLayout.sidebarCollapsed).toBe(true)

      act(() => fireKey('b', { metaKey: true }))
      expect(result.current.globalLayout.sidebarCollapsed).toBe(false)
    })
  })

  describe('Cmd+Tab: cycle feature tab', () => {
    it('cycles from agents to editor', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useAppState()
        },
        { wrapper }
      )

      expect(result.current.activeFeatureTab).toBe('agents')
      act(() => fireKey('Tab', { metaKey: true }))
      expect(result.current.activeFeatureTab).toBe('editor')
    })

    it('cycles from editor to git', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() =>
        result.current.dispatch({ type: 'SET_ACTIVE_FEATURE_TAB', payload: 'editor' })
      )
      act(() => fireKey('Tab', { metaKey: true }))
      expect(result.current.state.activeFeatureTab).toBe('git')
    })

    it('cycles from git back to agents', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() =>
        result.current.dispatch({ type: 'SET_ACTIVE_FEATURE_TAB', payload: 'git' })
      )
      act(() => fireKey('Tab', { metaKey: true }))
      expect(result.current.state.activeFeatureTab).toBe('agents')
    })
  })

  describe('Cmd+T: new tab', () => {
    it('calls onNewTab callback', () => {
      const onNewTab = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onNewTab }), { wrapper })

      act(() => fireKey('t', { metaKey: true }))
      expect(onNewTab).toHaveBeenCalledTimes(1)
    })
  })

  describe('Cmd+W: close current project tab', () => {
    it('calls onCloseTab with activeTabId and team status', () => {
      const onCloseTab = vi.fn()
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts({ onCloseTab })
          return useAppState()
        },
        { wrapper }
      )

      act(() => fireKey('w', { metaKey: true }))
      expect(onCloseTab).toHaveBeenCalledWith(result.current.activeTabId, false)
    })

    it('reports teamRunning=true when team is running', () => {
      const onCloseTab = vi.fn()
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts({ onCloseTab })
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() =>
        result.current.dispatch({
          type: 'SET_TEAM_STATUS',
          payload: 'running',
          tabId: result.current.state.activeTabId
        })
      )
      act(() => fireKey('w', { metaKey: true }))
      expect(onCloseTab).toHaveBeenCalledWith(result.current.state.activeTabId, true)
    })
  })

  describe('Cmd+1-9: switch project tab by position', () => {
    it('switches to tab by position in tabOrder', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      // Create a second tab
      act(() =>
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/projects/two', projectName: 'two' }
        })
      )
      expect(result.current.state.activeTabId).toBe('tab-2')

      // Cmd+1 switches to first tab
      act(() => fireKey('1', { metaKey: true }))
      expect(result.current.state.activeTabId).toBe('tab-default')
    })

    it('Cmd+9 jumps to last tab', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() =>
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-last', projectPath: '/projects/last' }
        })
      )

      // Go back to first
      act(() => fireKey('1', { metaKey: true }))
      expect(result.current.state.activeTabId).toBe('tab-default')

      // Cmd+9 jumps to last
      act(() => fireKey('9', { metaKey: true }))
      expect(result.current.state.activeTabId).toBe('tab-last')
    })

    it('does nothing when index exceeds tab count', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useAppState()
        },
        { wrapper }
      )

      act(() => fireKey('5', { metaKey: true }))
      expect(result.current.activeTabId).toBe('tab-default')
    })
  })

  describe('Cmd+Shift+[/]: previous/next project tab', () => {
    it('switches to next tab with Cmd+Shift+]', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() =>
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/two' }
        })
      )
      // Now on tab-2, go back to tab-default
      act(() => fireKey('1', { metaKey: true }))

      act(() => fireKey(']', { metaKey: true, shiftKey: true }))
      expect(result.current.state.activeTabId).toBe('tab-2')
    })

    it('switches to previous tab with Cmd+Shift+[', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() =>
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/two' }
        })
      )
      // Now on tab-2
      act(() => fireKey('[', { metaKey: true, shiftKey: true }))
      expect(result.current.state.activeTabId).toBe('tab-default')
    })

    it('wraps around from first to last', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() =>
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/two' }
        })
      )
      // Go to first tab
      act(() => fireKey('1', { metaKey: true }))

      // Prev from first wraps to last
      act(() => fireKey('[', { metaKey: true, shiftKey: true }))
      expect(result.current.state.activeTabId).toBe('tab-2')
    })
  })

  describe('Cmd+G: toggle view mode', () => {
    it('toggles between lead and grid', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useActiveTab()
        },
        { wrapper }
      )

      expect(result.current.layout.viewMode).toBe('lead')
      act(() => fireKey('g', { metaKey: true }))
      expect(result.current.layout.viewMode).toBe('grid')
      act(() => fireKey('g', { metaKey: true }))
      expect(result.current.layout.viewMode).toBe('lead')
    })
  })

  describe('Escape: exit maximized pane', () => {
    it('restores pane when maximized', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { tab: useActiveTab(), state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() =>
        result.current.dispatch({
          type: 'MAXIMIZE_PANE',
          payload: 'agent-1',
          tabId: result.current.state.activeTabId
        })
      )
      expect(result.current.tab.layout.maximizedPaneId).toBe('agent-1')

      act(() => fireKey('Escape'))
      expect(result.current.tab.layout.maximizedPaneId).toBeNull()
    })

    it('does nothing when no pane is maximized', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useActiveTab()
        },
        { wrapper }
      )

      act(() => fireKey('Escape'))
      expect(result.current.layout.maximizedPaneId).toBeNull()
    })
  })

  describe('Cmd+P: quick file open', () => {
    it('calls onQuickOpen callback', () => {
      const onQuickOpen = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onQuickOpen }), { wrapper })

      act(() => fireKey('p', { metaKey: true }))
      expect(onQuickOpen).toHaveBeenCalledTimes(1)
    })
  })

  it('cleans up event listener on unmount', () => {
    const removeSpy = vi.spyOn(document, 'removeEventListener')
    const { unmount } = renderHook(() => useKeyboardShortcuts(), { wrapper })

    unmount()
    expect(removeSpy).toHaveBeenCalledWith('keydown', expect.any(Function))
    removeSpy.mockRestore()
  })
})
