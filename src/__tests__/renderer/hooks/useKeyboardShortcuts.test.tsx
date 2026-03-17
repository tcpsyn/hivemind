import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import { AppProvider, useAppState, useAppDispatch } from '../../../renderer/src/state/AppContext'
import { useKeyboardShortcuts } from '../../../renderer/src/hooks/useKeyboardShortcuts'
import type { AgentState, EditorTab } from '../../../shared/types'

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

      expect(result.current.layout.sidebarCollapsed).toBe(false)

      act(() => fireKey('b', { metaKey: true }))
      expect(result.current.layout.sidebarCollapsed).toBe(true)

      act(() => fireKey('b', { metaKey: true }))
      expect(result.current.layout.sidebarCollapsed).toBe(false)
    })
  })

  describe('Cmd+Tab: cycle active tab', () => {
    it('cycles from agents to editor', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useAppState()
        },
        { wrapper }
      )

      expect(result.current.layout.activeTab).toBe('agents')
      act(() => fireKey('Tab', { metaKey: true }))
      expect(result.current.layout.activeTab).toBe('editor')
    })

    it('cycles from editor to git', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => result.current.dispatch({ type: 'SET_ACTIVE_TAB', payload: 'editor' }))
      act(() => fireKey('Tab', { metaKey: true }))
      expect(result.current.state.layout.activeTab).toBe('git')
    })

    it('cycles from git back to agents', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => result.current.dispatch({ type: 'SET_ACTIVE_TAB', payload: 'git' }))
      act(() => fireKey('Tab', { metaKey: true }))
      expect(result.current.state.layout.activeTab).toBe('agents')
    })
  })

  describe('Cmd+W: close active editor tab', () => {
    it('closes the active editor tab', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      const tab: EditorTab = {
        id: 'tab-1',
        filePath: '/src/index.ts',
        fileName: 'index.ts',
        language: 'typescript',
        isModified: false,
        isReadOnly: true
      }
      act(() => result.current.dispatch({ type: 'ADD_EDITOR_TAB', payload: tab }))
      expect(result.current.state.editor.openFiles).toHaveLength(1)

      act(() => fireKey('w', { metaKey: true }))
      expect(result.current.state.editor.openFiles).toHaveLength(0)
    })

    it('does nothing when no tabs are open', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useAppState()
        },
        { wrapper }
      )

      act(() => fireKey('w', { metaKey: true }))
      expect(result.current.editor.openFiles).toHaveLength(0)
    })
  })

  describe('Escape: exit maximized pane', () => {
    it('restores pane when maximized', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() => result.current.dispatch({ type: 'MAXIMIZE_PANE', payload: 'agent-1' }))
      expect(result.current.state.layout.maximizedPaneId).toBe('agent-1')

      act(() => fireKey('Escape'))
      expect(result.current.state.layout.maximizedPaneId).toBeNull()
    })

    it('does nothing when no pane is maximized', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return useAppState()
        },
        { wrapper }
      )

      act(() => fireKey('Escape'))
      expect(result.current.layout.maximizedPaneId).toBeNull()
    })
  })

  describe('Cmd+1-4: focus pane by index', () => {
    it('maximizes pane by agent index', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      const agents: AgentState[] = [
        {
          id: 'a1',
          name: 'arch',
          role: 'r',
          avatar: 'robot-1',
          color: '#FF6B6B',
          status: 'running',
          needsInput: false,
          lastActivity: Date.now()
        },
        {
          id: 'a2',
          name: 'front',
          role: 'r',
          avatar: 'robot-2',
          color: '#4ECDC4',
          status: 'running',
          needsInput: false,
          lastActivity: Date.now()
        },
        {
          id: 'a3',
          name: 'back',
          role: 'r',
          avatar: 'robot-3',
          color: '#45B7D1',
          status: 'running',
          needsInput: false,
          lastActivity: Date.now()
        }
      ]
      act(() => agents.forEach((a) => result.current.dispatch({ type: 'ADD_AGENT', payload: a })))

      act(() => fireKey('2', { metaKey: true }))
      expect(result.current.state.layout.maximizedPaneId).toBe('a2')
    })

    it('does nothing when index exceeds agent count', () => {
      const { result } = renderHook(
        () => {
          useKeyboardShortcuts()
          return { state: useAppState(), dispatch: useAppDispatch() }
        },
        { wrapper }
      )

      act(() =>
        result.current.dispatch({
          type: 'ADD_AGENT',
          payload: {
            id: 'a1',
            name: 'arch',
            role: 'r',
            avatar: 'robot-1',
            color: '#FF6B6B',
            status: 'running',
            needsInput: false,
            lastActivity: Date.now()
          }
        })
      )

      act(() => fireKey('4', { metaKey: true }))
      expect(result.current.state.layout.maximizedPaneId).toBeNull()
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
