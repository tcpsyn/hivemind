import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider } from '../../../renderer/src/state/AppContext'

const { mockTerminal, mockFitAddon, mockOnTeammateOutput, mockSendTeammateInput } = vi.hoisted(
  () => {
    const mockTerminal = {
      open: vi.fn(),
      write: vi.fn(),
      reset: vi.fn(),
      dispose: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      loadAddon: vi.fn(),
      focus: vi.fn(),
      options: {}
    }

    const mockFitAddon = {
      fit: vi.fn(),
      dispose: vi.fn()
    }

    const mockOnTeammateOutput = vi.fn(() => vi.fn())
    const mockSendTeammateInput = vi.fn()

    return { mockTerminal, mockFitAddon, mockOnTeammateOutput, mockSendTeammateInput }
  }
)

vi.mock('@xterm/xterm', () => ({
  Terminal: function () {
    return mockTerminal
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: function () {
    return mockFitAddon
  }
}))

Object.defineProperty(window, 'api', {
  value: {
    onTeammateOutput: mockOnTeammateOutput,
    sendTeammateInput: mockSendTeammateInput
  },
  writable: true,
  configurable: true
})

// Import after mocks
const { useTeammateTerminal } = await import('../../../renderer/src/hooks/useTeammateTerminal')

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('useTeammateTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnTeammateOutput.mockReturnValue(vi.fn())
  })

  it('creates a terminal instance', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTeammateTerminal('%1', containerRef), { wrapper })
    expect(mockTerminal.open).toHaveBeenCalledWith(containerRef.current)
  })

  it('loads the fit addon', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTeammateTerminal('%1', containerRef), { wrapper })
    expect(mockTerminal.loadAddon).toHaveBeenCalledWith(mockFitAddon)
  })

  it('subscribes to teammate output via IPC', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTeammateTerminal('%1', containerRef), { wrapper })
    expect(mockOnTeammateOutput).toHaveBeenCalled()
  })

  it('writes teammate output to terminal when paneId matches', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback: ((payload: { paneId: string; data: string }) => void) | null = null
    mockOnTeammateOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTeammateTerminal('%1', containerRef), { wrapper })

    act(() => {
      outputCallback?.({ paneId: '%1', data: 'hello from tmux' })
    })
    expect(mockTerminal.write).toHaveBeenCalledWith('hello from tmux')
  })

  it('ignores output for other panes', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback: ((payload: { paneId: string; data: string }) => void) | null = null
    mockOnTeammateOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTeammateTerminal('%1', containerRef), { wrapper })

    act(() => {
      outputCallback?.({ paneId: '%2', data: 'not for me' })
    })
    expect(mockTerminal.write).not.toHaveBeenCalled()
  })

  it('sends keyboard input via sendTeammateInput', () => {
    const containerRef = { current: document.createElement('div') }
    let dataHandler: ((data: string) => void) | null = null
    mockTerminal.onData.mockImplementation((cb: (data: string) => void) => {
      dataHandler = cb
      return { dispose: vi.fn() }
    })

    renderHook(() => useTeammateTerminal('%1', containerRef), { wrapper })

    act(() => {
      dataHandler?.('typed input')
    })
    expect(mockSendTeammateInput).toHaveBeenCalledWith({ paneId: '%1', data: 'typed input' })
  })

  it('disposes terminal on unmount', () => {
    const containerRef = { current: document.createElement('div') }
    const { unmount } = renderHook(() => useTeammateTerminal('%1', containerRef), { wrapper })
    unmount()
    expect(mockTerminal.dispose).toHaveBeenCalled()
  })

  it('does not open terminal if container ref is null', () => {
    const containerRef = { current: null }
    mockTerminal.open.mockClear()
    renderHook(() => useTeammateTerminal('%1', containerRef), { wrapper })
    expect(mockTerminal.open).not.toHaveBeenCalled()
  })
})
