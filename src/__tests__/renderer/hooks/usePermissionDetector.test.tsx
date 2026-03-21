import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import { usePermissionDetector } from '../../../renderer/src/hooks/usePermissionDetector'
import type { ReactNode } from 'react'

let outputCallback: ((payload: { paneId: string; tabId: string; data: string }) => void) | null =
  null

const mockSendTeammateInput = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  outputCallback = null

  Object.defineProperty(window, 'api', {
    value: {
      onTeammateOutput: vi.fn((cb) => {
        outputCallback = cb
        return vi.fn()
      }),
      sendTeammateInput: mockSendTeammateInput
    },
    writable: true,
    configurable: true
  })
})

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('usePermissionDetector', () => {
  it('starts with promptVisible false', () => {
    const { result } = renderHook(() => usePermissionDetector('tab-1', 'agent-1', 'pane-1'), {
      wrapper
    })
    expect(result.current.promptVisible).toBe(false)
  })

  it('detects (y/n) prompt pattern', () => {
    const { result } = renderHook(() => usePermissionDetector('tab-1', 'agent-1', 'pane-1'), {
      wrapper
    })

    act(() => {
      outputCallback?.({ paneId: 'pane-1', tabId: 'tab-1', data: 'Do you want to proceed? (y/n)' })
    })

    expect(result.current.promptVisible).toBe(true)
  })

  it('detects Claude Code numbered permission prompt', () => {
    const { result } = renderHook(() => usePermissionDetector('tab-1', 'agent-1', 'pane-1'), {
      wrapper
    })

    act(() => {
      outputCallback?.({
        paneId: 'pane-1',
        tabId: 'tab-1',
        data: 'Do you want to proceed?\n❯ 1. Yes\n  2. Yes, allow all\n  3. No\nEsc to cancel'
      })
    })

    expect(result.current.promptVisible).toBe(true)
  })

  it('ignores output from other panes', () => {
    const { result } = renderHook(() => usePermissionDetector('tab-1', 'agent-1', 'pane-1'), {
      wrapper
    })

    act(() => {
      outputCallback?.({
        paneId: 'pane-other',
        tabId: 'tab-1',
        data: 'Do you want to proceed? (y/n)'
      })
    })

    expect(result.current.promptVisible).toBe(false)
  })

  it('approve sends 1 and clears prompt', () => {
    const { result } = renderHook(() => usePermissionDetector('tab-1', 'agent-1', 'pane-1'), {
      wrapper
    })

    act(() => {
      outputCallback?.({
        paneId: 'pane-1',
        tabId: 'tab-1',
        data: 'Do you want to proceed?\n❯ 1. Yes\nEsc to cancel'
      })
    })
    expect(result.current.promptVisible).toBe(true)

    act(() => {
      result.current.approve()
    })

    expect(mockSendTeammateInput).toHaveBeenCalledWith({
      tabId: 'tab-1',
      paneId: 'pane-1',
      data: 'Enter',
      useKeys: true
    })
    expect(result.current.promptVisible).toBe(false)
  })

  it('deny sends Escape and clears prompt', () => {
    const { result } = renderHook(() => usePermissionDetector('tab-1', 'agent-1', 'pane-1'), {
      wrapper
    })

    act(() => {
      outputCallback?.({
        paneId: 'pane-1',
        tabId: 'tab-1',
        data: 'Do you want to proceed?\n❯ 1. Yes\nEsc to cancel'
      })
    })

    act(() => {
      result.current.deny()
    })

    expect(mockSendTeammateInput).toHaveBeenCalledWith({
      tabId: 'tab-1',
      paneId: 'pane-1',
      data: 'Escape',
      useKeys: true
    })
    expect(result.current.promptVisible).toBe(false)
  })

  it('strips ANSI escape codes before matching', () => {
    const { result } = renderHook(() => usePermissionDetector('tab-1', 'agent-1', 'pane-1'), {
      wrapper
    })

    act(() => {
      outputCallback?.({
        paneId: 'pane-1',
        tabId: 'tab-1',
        data: '\x1b[1;33mDo you want to proceed?\x1b[0m\n❯ 1. Yes'
      })
    })

    expect(result.current.promptVisible).toBe(true)
  })

  it('does nothing when paneId is undefined', () => {
    const { result } = renderHook(() => usePermissionDetector('tab-1', 'agent-1', undefined), {
      wrapper
    })
    expect(result.current.promptVisible).toBe(false)

    act(() => {
      result.current.approve()
    })
    expect(mockSendTeammateInput).not.toHaveBeenCalled()
  })
})
