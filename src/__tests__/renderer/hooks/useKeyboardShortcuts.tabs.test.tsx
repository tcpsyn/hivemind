import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import { AppProvider, useAppState, useAppDispatch } from '../../../renderer/src/state/AppContext'
import { useKeyboardShortcuts } from '../../../renderer/src/hooks/useKeyboardShortcuts'

function fireKey(key: string, opts: Partial<KeyboardEventInit> = {}) {
  const event = new KeyboardEvent('keydown', {
    key,
    bubbles: true,
    cancelable: true,
    ...opts
  })
  document.dispatchEvent(event)
}

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('useKeyboardShortcuts — Tab Navigation', () => {
  describe('Cmd+Shift+] (next project tab)', () => {
    it('switches to the next project tab', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
        })
      })
      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
        })
      })
      act(() => {
        result.current.dispatch({ type: 'SET_ACTIVE_PROJECT_TAB', payload: 'tab-1' })
      })
      expect(result.current.state.activeTabId).toBe('tab-1')

      act(() => fireKey(']', { metaKey: true, shiftKey: true }))

      expect(result.current.state.activeTabId).toBe('tab-2')
    })

    it('wraps around to first tab from last', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
        })
      })

      // tab-1 is the last created and active, get the full tab order
      const tabOrder = result.current.state.globalLayout.tabOrder
      // Set active to last in order
      act(() => {
        result.current.dispatch({
          type: 'SET_ACTIVE_PROJECT_TAB',
          payload: tabOrder[tabOrder.length - 1]
        })
      })

      act(() => fireKey(']', { metaKey: true, shiftKey: true }))

      const firstTabId = result.current.state.globalLayout.tabOrder[0]
      expect(result.current.state.activeTabId).toBe(firstTabId)
    })
  })

  describe('Cmd+Shift+[ (previous project tab)', () => {
    it('switches to the previous project tab', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
        })
      })
      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
        })
      })

      // tab-2 is active, press Cmd+Shift+[
      act(() => fireKey('[', { metaKey: true, shiftKey: true }))

      expect(result.current.state.activeTabId).toBe('tab-1')
    })

    it('wraps around to last tab from first', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
        })
      })
      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
        })
      })

      // Set to first tab
      const firstTabId = result.current.state.globalLayout.tabOrder[0]
      act(() => {
        result.current.dispatch({ type: 'SET_ACTIVE_PROJECT_TAB', payload: firstTabId })
      })

      act(() => fireKey('[', { metaKey: true, shiftKey: true }))

      const tabOrder = result.current.state.globalLayout.tabOrder
      expect(result.current.state.activeTabId).toBe(tabOrder[tabOrder.length - 1])
    })
  })

  describe('Cmd+T (new tab)', () => {
    it('calls onNewTab callback', () => {
      const onNewTab = vi.fn()
      renderHook(() => useKeyboardShortcuts({ onNewTab }), { wrapper })

      act(() => fireKey('t', { metaKey: true }))

      expect(onNewTab).toHaveBeenCalledTimes(1)
    })

    it('does nothing when onNewTab is not provided', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useAppState()
        },
        { wrapper }
      )

      const tabsBefore = result.current.tabs.size
      act(() => fireKey('t', { metaKey: true }))
      expect(result.current.tabs.size).toBe(tabsBefore)
    })
  })

  describe('Cmd+W (close tab)', () => {
    it('calls onCloseTab with activeTabId and team status', () => {
      const onCloseTab = vi.fn()
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts({ onCloseTab })
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
        })
      })

      act(() => fireKey('w', { metaKey: true }))

      expect(onCloseTab).toHaveBeenCalledWith('tab-1', false) // teamStatus is 'stopped', not running
    })

    it('passes teamRunning=true when team is running', () => {
      const onCloseTab = vi.fn()
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts({ onCloseTab })
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
        })
      })
      act(() => {
        result.current.dispatch({
          type: 'SET_TEAM_STATUS',
          payload: 'running',
          tabId: 'tab-1'
        })
      })

      act(() => fireKey('w', { metaKey: true }))

      expect(onCloseTab).toHaveBeenCalledWith('tab-1', true)
    })
  })

  describe('Cmd+1-9 (switch to tab by position)', () => {
    it('Cmd+1 switches to first project tab', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
        })
      })
      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
        })
      })

      // tab-2 is active, press Cmd+1
      act(() => fireKey('1', { metaKey: true }))

      const firstTabId = result.current.state.globalLayout.tabOrder[0]
      expect(result.current.state.activeTabId).toBe(firstTabId)
    })

    it('Cmd+9 switches to last project tab', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
        })
      })
      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
        })
      })

      // Set to first tab, then press Cmd+9
      const firstTabId = result.current.state.globalLayout.tabOrder[0]
      act(() => {
        result.current.dispatch({ type: 'SET_ACTIVE_PROJECT_TAB', payload: firstTabId })
      })

      act(() => fireKey('9', { metaKey: true }))

      const tabOrder = result.current.state.globalLayout.tabOrder
      expect(result.current.state.activeTabId).toBe(tabOrder[tabOrder.length - 1])
    })

    it('Cmd+2 switches to second project tab', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-1', projectPath: '/a', projectName: 'a' }
        })
      })
      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
        })
      })

      // Set to first tab
      const firstTabId = result.current.state.globalLayout.tabOrder[0]
      act(() => {
        result.current.dispatch({ type: 'SET_ACTIVE_PROJECT_TAB', payload: firstTabId })
      })

      act(() => fireKey('2', { metaKey: true }))

      const secondTabId = result.current.state.globalLayout.tabOrder[1]
      expect(result.current.state.activeTabId).toBe(secondTabId)
    })

    it('ignores Cmd+N when N exceeds tab count', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useAppState()
        },
        { wrapper }
      )

      const currentTabId = result.current.activeTabId

      // Only 1 default tab, press Cmd+5
      act(() => fireKey('5', { metaKey: true }))

      expect(result.current.activeTabId).toBe(currentTabId)
    })
  })

  describe('Cmd+Tab (cycle feature tabs)', () => {
    it('cycles through feature tabs globally', () => {
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

      act(() => fireKey('Tab', { metaKey: true }))
      expect(result.current.activeFeatureTab).toBe('git')

      act(() => fireKey('Tab', { metaKey: true }))
      expect(result.current.activeFeatureTab).toBe('agents')
    })
  })

  describe('Cmd+G (toggle view mode)', () => {
    it('toggles view mode on the active tab', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      const activeTabId = result.current.state.activeTabId
      const tabBefore = result.current.state.tabs.get(activeTabId)!
      expect(tabBefore.layout.viewMode).toBe('lead')

      act(() => fireKey('g', { metaKey: true }))

      const tabAfter = result.current.state.tabs.get(activeTabId)!
      expect(tabAfter.layout.viewMode).toBe('grid')
    })
  })

  describe('Escape (restore pane)', () => {
    it('restores maximized pane on the active tab', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      const tabId = result.current.state.activeTabId

      act(() => {
        result.current.dispatch({ type: 'MAXIMIZE_PANE', payload: 'agent-1', tabId })
      })
      expect(result.current.state.tabs.get(tabId)!.layout.maximizedPaneId).toBe('agent-1')

      act(() => fireKey('Escape'))

      expect(result.current.state.tabs.get(tabId)!.layout.maximizedPaneId).toBeNull()
    })
  })
})
