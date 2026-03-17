import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider } from '../../../renderer/src/state/AppContext'

const TAB_ID = 'tab-default'

const { mockTerminal, mockElement, mockFitAddon, mockOnAgentOutput, mockAgentInput } = vi.hoisted(
  () => {
    const mockElement = document.createElement('div')
    mockElement.classList.add('terminal', 'xterm')

    const mockTerminal = {
      open: vi.fn((container: HTMLDivElement) => {
        mockTerminal.element = mockElement
        container.appendChild(mockElement)
      }),
      write: vi.fn(),
      reset: vi.fn(),
      dispose: vi.fn(),
      onData: vi.fn(() => ({ dispose: vi.fn() })),
      loadAddon: vi.fn(),
      focus: vi.fn(),
      cols: 80,
      rows: 24,
      options: {},
      element: undefined as HTMLDivElement | undefined
    }

    const mockFitAddon = {
      fit: vi.fn(),
      dispose: vi.fn()
    }

    const mockOnAgentOutput = vi.fn(() => vi.fn())
    const mockAgentInput = vi.fn()

    return { mockTerminal, mockElement, mockFitAddon, mockOnAgentOutput, mockAgentInput }
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
    onAgentOutput: mockOnAgentOutput,
    agentInput: mockAgentInput,
    agentResize: vi.fn()
  },
  writable: true,
  configurable: true
})

// Import after mocks
const { useTerminal } = await import('../../../renderer/src/hooks/useTerminal')
const { clearAllTerminals } = await import('../../../renderer/src/terminal/TerminalRegistry')

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('useTerminal', () => {
  beforeEach(() => {
    clearAllTerminals()
    vi.clearAllMocks()
    mockOnAgentOutput.mockReturnValue(vi.fn())
    mockTerminal.element = undefined
  })

  it('creates a terminal instance and opens in container', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef), { wrapper })
    expect(mockTerminal.open).toHaveBeenCalledWith(containerRef.current)
  })

  it('loads the fit addon', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef), { wrapper })
    expect(mockTerminal.loadAddon).toHaveBeenCalledWith(mockFitAddon)
  })

  it('subscribes to agent output via IPC', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef), { wrapper })
    expect(mockOnAgentOutput).toHaveBeenCalled()
  })

  it('writes agent output to terminal, filtering by tabId and agentId', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback:
      | ((payload: { tabId: string; agentId: string; data: string }) => void)
      | null = null
    mockOnAgentOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef), { wrapper })

    act(() => {
      outputCallback?.({ tabId: TAB_ID, agentId: 'agent-1', data: 'hello world' })
    })
    // First agent output clears the banner then writes
    expect(mockTerminal.reset).toHaveBeenCalled()
    expect(mockTerminal.write).toHaveBeenCalledWith('hello world')
  })

  it('ignores output for other agents', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback:
      | ((payload: { tabId: string; agentId: string; data: string }) => void)
      | null = null
    mockOnAgentOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef), { wrapper })
    mockTerminal.write.mockClear()

    act(() => {
      outputCallback?.({ tabId: TAB_ID, agentId: 'agent-2', data: 'not for me' })
    })
    expect(mockTerminal.write).not.toHaveBeenCalled()
  })

  it('ignores output for other tabs', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback:
      | ((payload: { tabId: string; agentId: string; data: string }) => void)
      | null = null
    mockOnAgentOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef), { wrapper })
    mockTerminal.write.mockClear()

    act(() => {
      outputCallback?.({ tabId: 'other-tab', agentId: 'agent-1', data: 'wrong tab' })
    })
    expect(mockTerminal.write).not.toHaveBeenCalled()
  })

  it('sends keyboard input with tabId', () => {
    const containerRef = { current: document.createElement('div') }
    let dataHandler: ((data: string) => void) | null = null
    mockTerminal.onData.mockImplementation((cb: (data: string) => void) => {
      dataHandler = cb
      return { dispose: vi.fn() }
    })

    renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef), { wrapper })

    act(() => {
      dataHandler?.('typed input')
    })
    expect(mockAgentInput).toHaveBeenCalledWith({
      tabId: TAB_ID,
      agentId: 'agent-1',
      data: 'typed input'
    })
  })

  it('detaches terminal on unmount without disposing', () => {
    const containerRef = { current: document.createElement('div') }
    const { unmount } = renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef), {
      wrapper
    })
    unmount()
    // Terminal stays alive in the registry — not disposed on unmount
    expect(mockTerminal.dispose).not.toHaveBeenCalled()
  })

  it('re-attaches terminal on remount without calling open again', () => {
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef1), {
      wrapper
    })

    expect(mockTerminal.open).toHaveBeenCalledTimes(1)
    expect(mockTerminal.open).toHaveBeenCalledWith(container1)

    unmount()
    expect(mockTerminal.dispose).not.toHaveBeenCalled()

    // Re-mount with same tabId+agentId — should reuse terminal
    const containerRef2 = { current: container2 }
    renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef2), { wrapper })

    // open should NOT be called again — re-attach uses appendChild
    expect(mockTerminal.open).toHaveBeenCalledTimes(1)
    expect(container2.contains(mockElement)).toBe(true)
  })

  it('does not open terminal if container ref is null', () => {
    const containerRef = { current: null }
    mockTerminal.open.mockClear()
    renderHook(() => useTerminal(TAB_ID, 'agent-1', containerRef), { wrapper })
    expect(mockTerminal.open).not.toHaveBeenCalled()
  })
})
