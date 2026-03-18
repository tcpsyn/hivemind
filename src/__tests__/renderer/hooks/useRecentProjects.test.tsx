import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import { AppProvider, useAppDispatch } from '../../../renderer/src/state/AppContext'
import { useRecentProjects } from '../../../renderer/src/hooks/useRecentProjects'

const STORAGE_KEY = 'hivemind:recentProjects'

let mockStore: Record<string, string>

beforeEach(() => {
  mockStore = {}
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: vi.fn((k: string) => mockStore[k] ?? null),
      setItem: vi.fn((k: string, v: string) => {
        mockStore[k] = v
      }),
      removeItem: vi.fn(),
      clear: vi.fn(),
      key: vi.fn(),
      length: 0
    },
    writable: true,
    configurable: true
  })
})

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('useRecentProjects', () => {
  it('returns empty array initially', () => {
    const { result } = renderHook(() => useRecentProjects(), { wrapper })
    expect(result.current).toEqual([])
  })

  it('restores recent projects from localStorage on mount', () => {
    mockStore[STORAGE_KEY] = JSON.stringify(['/projects/a', '/projects/b'])

    const { result } = renderHook(() => useRecentProjects(), { wrapper })
    expect(result.current).toEqual(['/projects/a', '/projects/b'])
  })

  it('handles corrupt localStorage data gracefully', () => {
    mockStore[STORAGE_KEY] = 'not-valid-json{'

    const { result } = renderHook(() => useRecentProjects(), { wrapper })
    expect(result.current).toEqual([])
  })

  it('handles non-array localStorage data gracefully', () => {
    mockStore[STORAGE_KEY] = JSON.stringify('not-an-array')

    const { result } = renderHook(() => useRecentProjects(), { wrapper })
    expect(result.current).toEqual([])
  })

  it('persists to localStorage when a recent project is added', () => {
    const { result } = renderHook(
      () => ({
        recent: useRecentProjects(),
        dispatch: useAppDispatch()
      }),
      { wrapper }
    )

    act(() => {
      result.current.dispatch({ type: 'ADD_RECENT_PROJECT', payload: '/projects/new' })
    })

    expect(result.current.recent).toEqual(['/projects/new'])
    expect(window.localStorage.setItem).toHaveBeenCalledWith(
      STORAGE_KEY,
      JSON.stringify(['/projects/new'])
    )
  })

  it('maintains order with most recent first after restore and add', () => {
    mockStore[STORAGE_KEY] = JSON.stringify(['/projects/a', '/projects/b'])

    const { result } = renderHook(
      () => ({
        recent: useRecentProjects(),
        dispatch: useAppDispatch()
      }),
      { wrapper }
    )

    expect(result.current.recent).toEqual(['/projects/a', '/projects/b'])

    act(() => {
      result.current.dispatch({ type: 'ADD_RECENT_PROJECT', payload: '/projects/c' })
    })

    expect(result.current.recent).toEqual(['/projects/c', '/projects/a', '/projects/b'])
  })

  it('filters non-string entries from localStorage', () => {
    mockStore[STORAGE_KEY] = JSON.stringify(['/valid', 42, null, '/also-valid'])

    const { result } = renderHook(() => useRecentProjects(), { wrapper })
    expect(result.current).toEqual(['/valid', '/also-valid'])
  })
})
