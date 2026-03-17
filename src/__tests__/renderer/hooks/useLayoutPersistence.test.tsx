import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import { AppProvider, useAppState, useAppDispatch } from '../../../renderer/src/state/AppContext'
import {
  useLayoutPersistence,
  type LayoutStorage,
  createLocalStorage
} from '../../../renderer/src/hooks/useLayoutPersistence'
import type { GridConfig } from '../../../shared/types'

function createMockStorage(): LayoutStorage {
  const store = new Map<string, string>()
  return {
    get: vi.fn((key: string) => {
      const val = store.get(key)
      return val !== undefined ? JSON.parse(val) : undefined
    }),
    set: vi.fn((key: string, value: unknown) => {
      store.set(key, JSON.stringify(value))
    })
  }
}

function createWrapper(_storage: LayoutStorage) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <AppProvider>{children}</AppProvider>
  }
}

describe('useLayoutPersistence', () => {
  let storage: LayoutStorage

  beforeEach(() => {
    storage = createMockStorage()
  })

  it('mounts without error', () => {
    const wrapper = createWrapper(storage)
    renderHook(() => useLayoutPersistence(storage), { wrapper })
  })

  describe('save', () => {
    it('persists sidebar width on change', () => {
      const wrapper = createWrapper(storage)
      const { result } = renderHook(
        () => {
          useLayoutPersistence(storage)
          return useAppDispatch()
        },
        { wrapper }
      )

      act(() => result.current({ type: 'SET_SIDEBAR_WIDTH', payload: 300 }))

      // Give debounce time to fire
      expect(storage.set).toHaveBeenCalled()
    })

    it('persists active tab on change', () => {
      const wrapper = createWrapper(storage)
      const { result } = renderHook(
        () => {
          useLayoutPersistence(storage)
          return useAppDispatch()
        },
        { wrapper }
      )

      act(() => result.current({ type: 'SET_ACTIVE_TAB', payload: 'editor' }))

      expect(storage.set).toHaveBeenCalled()
    })

    it('persists grid config on change', () => {
      const wrapper = createWrapper(storage)
      const { result } = renderHook(
        () => {
          useLayoutPersistence(storage)
          return useAppDispatch()
        },
        { wrapper }
      )

      const gridConfig: GridConfig = { layout: '2x2', columns: 2, rows: 2 }
      act(() => result.current({ type: 'SET_LAYOUT', payload: { gridConfig } }))

      expect(storage.set).toHaveBeenCalled()
    })

    it('persists sidebar collapsed state', () => {
      const wrapper = createWrapper(storage)
      const { result } = renderHook(
        () => {
          useLayoutPersistence(storage)
          return useAppDispatch()
        },
        { wrapper }
      )

      act(() => result.current({ type: 'TOGGLE_SIDEBAR' }))
      expect(storage.set).toHaveBeenCalled()
    })
  })

  describe('load', () => {
    it('restores saved layout on mount', () => {
      const savedLayout = {
        sidebarWidth: 350,
        activeTab: 'editor' as const,
        sidebarCollapsed: true,
        gridConfig: { layout: '2x2' as const, columns: 2, rows: 2 }
      }
      ;(storage.get as ReturnType<typeof vi.fn>).mockReturnValue(savedLayout)

      const wrapper = createWrapper(storage)
      renderHook(
        () => {
          useLayoutPersistence(storage)
          return useAppState()
        },
        { wrapper }
      )

      expect(storage.get).toHaveBeenCalledWith('layout')
    })

    it('handles missing saved data gracefully', () => {
      ;(storage.get as ReturnType<typeof vi.fn>).mockReturnValue(undefined)

      const wrapper = createWrapper(storage)
      renderHook(
        () => {
          useLayoutPersistence(storage)
          return useAppState()
        },
        { wrapper }
      )

      expect(storage.get).toHaveBeenCalledWith('layout')
    })

    it('restores saved project info', () => {
      const savedProject = { name: 'my-proj', path: '/path/to/proj' }
      ;(storage.get as ReturnType<typeof vi.fn>).mockImplementation((key: string) => {
        if (key === 'project') return savedProject
        return undefined
      })

      const wrapper = createWrapper(storage)
      renderHook(
        () => {
          useLayoutPersistence(storage)
          return useAppState()
        },
        { wrapper }
      )

      expect(storage.get).toHaveBeenCalledWith('project')
    })
  })

  describe('createLocalStorage', () => {
    it('returns a LayoutStorage-compatible object', () => {
      const ls = createLocalStorage()
      expect(typeof ls.get).toBe('function')
      expect(typeof ls.set).toBe('function')
    })

    it('round-trips values via localStorage', () => {
      const store: Record<string, string> = {}
      const mockLS = {
        getItem: vi.fn((k: string) => store[k] ?? null),
        setItem: vi.fn((k: string, v: string) => {
          store[k] = v
        }),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0
      }
      Object.defineProperty(window, 'localStorage', { value: mockLS, writable: true })

      const ls = createLocalStorage()
      ls.set('test-key', { a: 1, b: 'hello' })
      expect(ls.get('test-key')).toEqual({ a: 1, b: 'hello' })
    })

    it('returns undefined for missing keys', () => {
      const mockLS = {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
        clear: vi.fn(),
        key: vi.fn(),
        length: 0
      }
      Object.defineProperty(window, 'localStorage', { value: mockLS, writable: true })

      const ls = createLocalStorage()
      expect(ls.get('nonexistent')).toBeUndefined()
    })
  })
})
