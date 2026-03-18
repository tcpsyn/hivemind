import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider } from '../../../renderer/src/state/AppContext'

/**
 * Tests for multi-tab terminal isolation and lifecycle.
 * Complements useTerminal.test.tsx which tests single-tab behavior.
 * Focuses on: cross-tab isolation, disposeTabTerminals, concurrent tabs.
 */

const { mockTerminal, mockFitAddon, mockOnAgentOutput, mockAgentInput } = vi.hoisted(() => {
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
    refresh: vi.fn(),
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

const { useTerminal } = await import('../../../renderer/src/hooks/useTerminal')
const { clearAllTerminals, getTabTerminalCount, disposeTabTerminals } =
  await import('../../../renderer/src/terminal/TerminalRegistry')

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('useTerminal — Multi-Tab Isolation', () => {
  beforeEach(() => {
    clearAllTerminals()
    vi.clearAllMocks()
    mockOnAgentOutput.mockReturnValue(vi.fn())
    mockTerminal.element = undefined
  })

  it('tracks terminals per tab separately', () => {
    const container1 = { current: document.createElement('div') }
    const container2 = { current: document.createElement('div') }

    renderHook(() => useTerminal('tab-1', 'agent-a', container1), { wrapper })
    renderHook(() => useTerminal('tab-2', 'agent-a', container2), { wrapper })

    expect(getTabTerminalCount('tab-1')).toBe(1)
    expect(getTabTerminalCount('tab-2')).toBe(1)
  })

  it('disposeTabTerminals cleans up only the targeted tab', () => {
    const container1 = { current: document.createElement('div') }
    const container2 = { current: document.createElement('div') }

    renderHook(() => useTerminal('tab-1', 'agent-a', container1), { wrapper })
    renderHook(() => useTerminal('tab-2', 'agent-b', container2), { wrapper })

    disposeTabTerminals('tab-1')

    expect(getTabTerminalCount('tab-1')).toBe(0)
    expect(getTabTerminalCount('tab-2')).toBe(1)
  })

  it('multiple agents in one tab each get a terminal', () => {
    const c1 = { current: document.createElement('div') }
    const c2 = { current: document.createElement('div') }

    renderHook(() => useTerminal('tab-1', 'agent-1', c1), { wrapper })
    // Reset element so second hook can "open"
    mockTerminal.element = undefined
    renderHook(() => useTerminal('tab-1', 'agent-2', c2), { wrapper })

    expect(getTabTerminalCount('tab-1')).toBe(2)
  })

  it('clearAllTerminals removes everything', () => {
    const c1 = { current: document.createElement('div') }
    const c2 = { current: document.createElement('div') }

    renderHook(() => useTerminal('tab-1', 'agent-1', c1), { wrapper })
    mockTerminal.element = undefined
    renderHook(() => useTerminal('tab-2', 'agent-1', c2), { wrapper })

    clearAllTerminals()

    expect(getTabTerminalCount('tab-1')).toBe(0)
    expect(getTabTerminalCount('tab-2')).toBe(0)
  })

  it('sends agent input with correct tabId', () => {
    const container = { current: document.createElement('div') }
    let dataHandler: ((data: string) => void) | null = null
    mockTerminal.onData.mockImplementation((cb: (data: string) => void) => {
      dataHandler = cb
      return { dispose: vi.fn() }
    })

    renderHook(() => useTerminal('tab-42', 'agent-x', container), { wrapper })

    act(() => {
      dataHandler?.('hello')
    })

    expect(mockAgentInput).toHaveBeenCalledWith({
      tabId: 'tab-42',
      agentId: 'agent-x',
      data: 'hello'
    })
  })
})
