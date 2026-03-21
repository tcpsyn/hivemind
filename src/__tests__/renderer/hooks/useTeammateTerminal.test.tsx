import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider } from '../../../renderer/src/state/AppContext'

const TAB_ID = 'tab-default'

const { mockTerminal, mockElement, mockFitAddon, mockOnTeammateOutput, mockSendTeammateInput } =
  vi.hoisted(() => {
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
      scrollToBottom: vi.fn(),
      options: {},
      cols: 120,
      rows: 36,
      element: undefined as HTMLDivElement | undefined
    }

    const mockFitAddon = {
      fit: vi.fn(),
      dispose: vi.fn()
    }

    const mockOnTeammateOutput = vi.fn(() => vi.fn())
    const mockSendTeammateInput = vi.fn()

    return { mockTerminal, mockElement, mockFitAddon, mockOnTeammateOutput, mockSendTeammateInput }
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
    onTeammateOutput: mockOnTeammateOutput,
    sendTeammateInput: mockSendTeammateInput,
    teammateResize: vi.fn(),
    teammateOutputReady: vi.fn().mockResolvedValue(undefined)
  },
  writable: true,
  configurable: true
})

// Mock ResizeObserver — jsdom doesn't implement it.
// Capture the callback so tests can trigger it manually.
let resizeObserverCallback: (() => void) | null = null
vi.stubGlobal(
  'ResizeObserver',
  class {
    constructor(cb: () => void) {
      resizeObserverCallback = cb
    }
    observe() {
      // Fire callback on next tick to simulate browser behavior
      setTimeout(() => resizeObserverCallback?.(), 0)
    }
    disconnect() {}
    unobserve() {}
  }
)

// Import after mocks
const { useTeammateTerminal } = await import('../../../renderer/src/hooks/useTeammateTerminal')
const { clearAllTerminals } = await import('../../../renderer/src/terminal/TerminalRegistry')

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('useTeammateTerminal', () => {
  beforeEach(() => {
    clearAllTerminals()
    vi.clearAllMocks()
    mockOnTeammateOutput.mockReturnValue(vi.fn())
    mockTerminal.element = undefined
  })

  it('creates a terminal instance and opens in container', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })
    expect(mockTerminal.open).toHaveBeenCalledWith(containerRef.current)
  })

  it('loads the fit addon', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })
    expect(mockTerminal.loadAddon).toHaveBeenCalledWith(mockFitAddon)
  })

  it('subscribes to teammate output via IPC', () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })
    expect(mockOnTeammateOutput).toHaveBeenCalled()
  })

  it('writes teammate output to terminal, filtering by tabId and paneId', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback:
      | ((payload: { tabId: string; paneId: string; data: string }) => void)
      | null = null
    mockOnTeammateOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })

    act(() => {
      outputCallback?.({ tabId: TAB_ID, paneId: '%1', data: 'hello from tmux' })
    })
    expect(mockTerminal.write).toHaveBeenCalledWith('hello from tmux')
  })

  it('ignores output for other panes', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback:
      | ((payload: { tabId: string; paneId: string; data: string }) => void)
      | null = null
    mockOnTeammateOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })

    act(() => {
      outputCallback?.({ tabId: TAB_ID, paneId: '%2', data: 'not for me' })
    })
    expect(mockTerminal.write).not.toHaveBeenCalled()
  })

  it('ignores output for other tabs', () => {
    const containerRef = { current: document.createElement('div') }
    let outputCallback:
      | ((payload: { tabId: string; paneId: string; data: string }) => void)
      | null = null
    mockOnTeammateOutput.mockImplementation((cb: typeof outputCallback) => {
      outputCallback = cb
      return vi.fn()
    })

    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })

    act(() => {
      outputCallback?.({ tabId: 'other-tab', paneId: '%1', data: 'wrong tab' })
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

    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })

    act(() => {
      dataHandler?.('typed input')
    })
    expect(mockSendTeammateInput).toHaveBeenCalledWith({
      tabId: TAB_ID,
      paneId: '%1',
      data: 'typed input'
    })
  })

  it('detaches terminal on unmount without disposing', () => {
    const containerRef = { current: document.createElement('div') }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), {
      wrapper
    })
    unmount()
    expect(mockTerminal.dispose).not.toHaveBeenCalled()
  })

  it('re-attaches terminal on remount without calling open again', () => {
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef1), {
      wrapper
    })

    expect(mockTerminal.open).toHaveBeenCalledTimes(1)
    expect(mockTerminal.open).toHaveBeenCalledWith(container1)

    unmount()
    expect(mockTerminal.dispose).not.toHaveBeenCalled()

    const containerRef2 = { current: container2 }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef2), { wrapper })

    expect(mockTerminal.open).toHaveBeenCalledTimes(1)
    expect(container2.contains(mockElement)).toBe(true)
  })

  it('sends output-ready ack via ResizeObserver (first mount)', async () => {
    const containerRef = { current: document.createElement('div') }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })

    // Wait for ResizeObserver mock setTimeout(0) + debounce(150ms) + rAF
    await act(async () => {
      await new Promise((r) => setTimeout(r, 250))
    })

    expect(window.api.teammateOutputReady).toHaveBeenCalledWith({
      tabId: TAB_ID,
      paneId: '%1',
      cols: 120,
      rows: 36
    })
  })

  it('sends output-ready via ResizeObserver on reattach', async () => {
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef1), {
      wrapper
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 250))
    })

    unmount()

    // Clear mock to isolate reattach call
    ;(window.api.teammateOutputReady as ReturnType<typeof vi.fn>).mockClear()

    const containerRef2 = { current: container2 }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef2), { wrapper })

    // Wait for ResizeObserver mock setTimeout(0) + debounce(50ms) + rAF
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150))
    })

    expect(window.api.teammateOutputReady).toHaveBeenCalledWith({
      tabId: TAB_ID,
      paneId: '%1',
      cols: 120,
      rows: 36
    })
  })

  it('scrolls to bottom on reattach', () => {
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef1), {
      wrapper
    })
    unmount()

    const containerRef2 = { current: container2 }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef2), { wrapper })

    expect(mockTerminal.scrollToBottom).toHaveBeenCalled()
  })

  it('does not open terminal if container ref is null', () => {
    const containerRef = { current: null }
    mockTerminal.open.mockClear()
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })
    expect(mockTerminal.open).not.toHaveBeenCalled()
  })
})
