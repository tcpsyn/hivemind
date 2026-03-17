import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import { useFileTree } from '../../../renderer/src/hooks/useFileTree'
import type { FileTreeNode } from '../../../shared/types'

const mockFileTreeRequest = vi.fn<() => Promise<FileTreeNode[]>>()
const mockOnFileChanged = vi.fn<(cb: (payload: unknown) => void) => () => void>()

beforeEach(() => {
  vi.clearAllMocks()
  mockFileTreeRequest.mockResolvedValue([])
  mockOnFileChanged.mockReturnValue(vi.fn())

  Object.defineProperty(window, 'api', {
    value: {
      fileTreeRequest: mockFileTreeRequest,
      onFileChanged: mockOnFileChanged,
      agentCreate: vi.fn(),
      agentInput: vi.fn(),
      agentStop: vi.fn(),
      agentRestart: vi.fn(),
      agentResize: vi.fn(),
      fileRead: vi.fn(),
      fileWrite: vi.fn(),
      gitDiff: vi.fn(),
      gitStatus: vi.fn(),
      teamStart: vi.fn(),
      teamStop: vi.fn(),
      onAgentOutput: vi.fn(() => vi.fn()),
      onAgentStatusChange: vi.fn(() => vi.fn()),
      onAgentInputNeeded: vi.fn(() => vi.fn()),
      onFileTreeUpdate: vi.fn(() => vi.fn()),
      onGitStatusUpdate: vi.fn(() => vi.fn())
    },
    writable: true,
    configurable: true
  })
})

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

const mockTree: FileTreeNode[] = [
  { name: 'src', path: '/project/src', type: 'directory', children: [] },
  { name: 'index.ts', path: '/project/index.ts', type: 'file', gitStatus: null }
]

describe('useFileTree', () => {
  it('loads the file tree on mount', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    const { result } = renderHook(() => useFileTree(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.tree).toEqual(mockTree)
    expect(mockFileTreeRequest).toHaveBeenCalledOnce()
  })

  it('starts in loading state', () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    const { result } = renderHook(() => useFileTree(), { wrapper })

    expect(result.current.loading).toBe(true)
  })

  it('stops loading even on error', async () => {
    mockFileTreeRequest.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useFileTree(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.tree).toEqual([])
  })

  it('handles missing API gracefully', async () => {
    Object.defineProperty(window, 'api', {
      value: {},
      writable: true,
      configurable: true
    })

    const { result } = renderHook(() => useFileTree(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    expect(result.current.tree).toEqual([])
  })

  it('subscribes to file changes on mount', async () => {
    mockFileTreeRequest.mockResolvedValue(mockTree)
    renderHook(() => useFileTree(), { wrapper })

    await waitFor(() => {
      expect(mockOnFileChanged).toHaveBeenCalledOnce()
    })
  })

  it('unsubscribes from file changes on unmount', async () => {
    const unsubscribe = vi.fn()
    mockOnFileChanged.mockReturnValue(unsubscribe)
    mockFileTreeRequest.mockResolvedValue(mockTree)

    const { unmount } = renderHook(() => useFileTree(), { wrapper })

    await waitFor(() => {
      expect(mockOnFileChanged).toHaveBeenCalledOnce()
    })

    unmount()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it('reloads tree when file change event fires', async () => {
    let changeCallback: ((payload: unknown) => void) | null = null
    mockOnFileChanged.mockImplementation((cb) => {
      changeCallback = cb
      return vi.fn()
    })
    mockFileTreeRequest.mockResolvedValue(mockTree)

    const { result } = renderHook(() => useFileTree(), { wrapper })

    await waitFor(() => {
      expect(result.current.loading).toBe(false)
    })

    const updatedTree: FileTreeNode[] = [
      { name: 'new.ts', path: '/project/new.ts', type: 'file', gitStatus: 'added' }
    ]
    mockFileTreeRequest.mockResolvedValue(updatedTree)

    await act(async () => {
      changeCallback?.({})
    })

    await waitFor(() => {
      expect(result.current.tree).toEqual(updatedTree)
    })
  })

  describe('toggleDir', () => {
    it('toggles directory expansion on', () => {
      mockFileTreeRequest.mockResolvedValue(mockTree)
      const { result } = renderHook(() => useFileTree(), { wrapper })

      expect(result.current.isExpanded('/project/src')).toBe(false)

      act(() => {
        result.current.toggleDir('/project/src')
      })

      expect(result.current.isExpanded('/project/src')).toBe(true)
    })

    it('toggles directory expansion off', () => {
      mockFileTreeRequest.mockResolvedValue(mockTree)
      const { result } = renderHook(() => useFileTree(), { wrapper })

      act(() => {
        result.current.toggleDir('/project/src')
      })
      expect(result.current.isExpanded('/project/src')).toBe(true)

      act(() => {
        result.current.toggleDir('/project/src')
      })
      expect(result.current.isExpanded('/project/src')).toBe(false)
    })

    it('multiple directories can be expanded independently', () => {
      mockFileTreeRequest.mockResolvedValue(mockTree)
      const { result } = renderHook(() => useFileTree(), { wrapper })

      act(() => {
        result.current.toggleDir('/a')
        result.current.toggleDir('/b')
      })

      expect(result.current.isExpanded('/a')).toBe(true)
      expect(result.current.isExpanded('/b')).toBe(true)

      act(() => {
        result.current.toggleDir('/a')
      })

      expect(result.current.isExpanded('/a')).toBe(false)
      expect(result.current.isExpanded('/b')).toBe(true)
    })
  })

  describe('isExpanded', () => {
    it('returns false for unknown paths', () => {
      mockFileTreeRequest.mockResolvedValue(mockTree)
      const { result } = renderHook(() => useFileTree(), { wrapper })

      expect(result.current.isExpanded('/unknown')).toBe(false)
    })
  })
})
