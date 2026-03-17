import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider } from '../../../renderer/src/state/AppContext'

const { mockTerminal, mockFitAddon, mockOnAgentOutput, mockAgentInput } = vi.hoisted(() => {
  const mockTerminal = {
    open: vi.fn(),
    write: vi.fn(),
    reset: vi.fn(),
    dispose: vi.fn(),
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    loadAddon: vi.fn(),
    focus: vi.fn(),
    cols: 80,
    rows: 24,
    options: {}
  }

  const mockFitAddon = {
    fit: vi.fn(),
    dispose: vi.fn()
  }

  const mockOnAgentOutput = vi.fn(() => vi.fn())
  const mockAgentInput = vi.fn()

  return { mockTerminal, mockFitAddon, mockOnAgentOutput, mockAgentInput }
})

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
    onAgentOutput: mockOnAgentOutput,
    agentInput: mockAgentInput,
    agentResize: vi.fn()
  },
  writable: true,
  configurable: true
})

// Import after mocks
const { useTerminal } = await import('../../../renderer/src/hooks/useTerminal')

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('useTerminal', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockOnAgentOutput.mockReturnValue(vi.fn())
  })

  it('creates a terminal instance', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTerminal('agent-1', containerRef), { wrapper })
    expect(mockTerminal.open).toHaveBeenCalledWith(containerRef.current)
  })

  it('loads the fit addon', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTerminal('agent-1', containerRef), { wrapper })
    expect(mockTerminal.loadAddon).toHaveBeenCalledWith(mockFitAddon)
  })

  it('subscribes to agent output via IPC', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTerminal('agent-1', containerRef), { wrapper })
    expect(mockOnAgentOutput).toHaveBeenCalled()
  })

  it('writes agent output to terminal', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback: ((payload: { agentId: string; data: string }) => void) | null = null
    mockOnAgentOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTerminal('agent-1', containerRef), { wrapper })

    act(() => {
      outputCallback?.({ agentId: 'agent-1', data: 'hello world' })
    })
    // First agent output clears the banner then writes
    expect(mockTerminal.reset).toHaveBeenCalled()
    expect(mockTerminal.write).toHaveBeenCalledWith('hello world')
  })

  it('ignores output for other agents', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback: ((payload: { agentId: string; data: string }) => void) | null = null
    mockOnAgentOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTerminal('agent-1', containerRef), { wrapper })
    mockTerminal.write.mockClear() // clear banner writes

    act(() => {
      outputCallback?.({ agentId: 'agent-2', data: 'not for me' })
    })
    expect(mockTerminal.write).not.toHaveBeenCalled()
  })

  it('sends keyboard input to agent via IPC', () => {
    const containerRef = { current: document.createElement('div') }
    let dataHandler: ((data: string) => void) | null = null
    mockTerminal.onData.mockImplementation((cb: (data: string) => void) => {
      dataHandler = cb
      return { dispose: vi.fn() }
    })

    renderHook(() => useTerminal('agent-1', containerRef), { wrapper })

    act(() => {
      dataHandler?.('typed input')
    })
    expect(mockAgentInput).toHaveBeenCalledWith({ agentId: 'agent-1', data: 'typed input' })
  })

  it('disposes terminal on unmount', () => {
    const containerRef = { current: document.createElement('div') }
    const { unmount } = renderHook(() => useTerminal('agent-1', containerRef), { wrapper })
    unmount()
    expect(mockTerminal.dispose).toHaveBeenCalled()
  })

  it('does not open terminal if container ref is null', () => {
    const containerRef = { current: null }
    mockTerminal.open.mockClear()
    renderHook(() => useTerminal('agent-1', containerRef), { wrapper })
    expect(mockTerminal.open).not.toHaveBeenCalled()
  })
})
