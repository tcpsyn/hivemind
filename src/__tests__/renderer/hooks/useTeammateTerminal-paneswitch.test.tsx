/**
 * Pane-switch simulation tests — verifies the detach/reattach lifecycle
 * that occurs when switching between teammate panes in the companion panel.
 *
 * Investigates the garbled-output bug: terminal wraps at wrong column width
 * after switching panes, fixed by manual window resize.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider } from '../../../renderer/src/state/AppContext'

const TAB_ID = 'tab-default'

const {
  mockTerminal,
  mockElement,
  mockFitAddon,
  mockOnTeammateOutput,
  mockTeammateOutputReady,
  mockTeammateResize
} = vi.hoisted(() => {
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
  const mockTeammateOutputReady = vi.fn().mockResolvedValue(undefined)
  const mockTeammateResize = vi.fn().mockResolvedValue(undefined)

  return {
    mockTerminal,
    mockElement,
    mockFitAddon,
    mockOnTeammateOutput,
    mockTeammateOutputReady,
    mockTeammateResize
  }
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
    sendTeammateInput: vi.fn(),
    teammateResize: mockTeammateResize,
    teammateOutputReady: mockTeammateOutputReady
  },
  writable: true,
  configurable: true
})

// Capture ResizeObserver callbacks per observed element
let resizeObserverCallback: (() => void) | null = null
let resizeObserverObservedElement: Element | null = null
vi.stubGlobal(
  'ResizeObserver',
  class {
    private cb: () => void
    constructor(cb: () => void) {
      this.cb = cb
      resizeObserverCallback = cb
    }
    observe(el: Element) {
      resizeObserverObservedElement = el
      // Fire on next tick like a real browser
      setTimeout(() => this.cb(), 0)
    }
    disconnect() {
      resizeObserverObservedElement = null
    }
    unobserve() {}
  }
)

const { useTeammateTerminal } = await import('../../../renderer/src/hooks/useTeammateTerminal')
const { clearAllTerminals } = await import('../../../renderer/src/terminal/TerminalRegistry')

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

describe('useTeammateTerminal — pane switch simulation', () => {
  beforeEach(() => {
    clearAllTerminals()
    vi.clearAllMocks()
    mockOnTeammateOutput.mockReturnValue(vi.fn())
    mockTerminal.element = undefined
    mockTerminal.cols = 120
    mockTerminal.rows = 36
  })

  it('calls teammateOutputReady with correct dims on initial attach', async () => {
    const container = document.createElement('div')
    const containerRef = { current: container }

    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })

    // ResizeObserver fires via setTimeout(0) + RESIZE_DEBOUNCE_MS (150ms for first mount)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    expect(mockTeammateOutputReady).toHaveBeenCalledTimes(1)
    expect(mockTeammateOutputReady).toHaveBeenCalledWith({
      tabId: TAB_ID,
      paneId: '%1',
      cols: 120,
      rows: 36
    })
  })

  it('calls teammateOutputReady on reattach to same-size container', async () => {
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    // First mount
    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef1), {
      wrapper
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    expect(mockTeammateOutputReady).toHaveBeenCalledTimes(1)
    unmount()

    // Simulate switching to a different pane and back
    mockTeammateOutputReady.mockClear()

    // Reattach to same-size container (simulates clicking back to this pane)
    const containerRef2 = { current: container2 }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef2), { wrapper })

    // On reattach, debounce is 0ms, so ResizeObserver fires quickly
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150))
    })

    // KEY: teammateOutputReady must fire on reattach even if cols/rows haven't changed,
    // because the tmux pane needs to be re-captured and flushed to the terminal
    expect(mockTeammateOutputReady).toHaveBeenCalledTimes(1)
    expect(mockTeammateOutputReady).toHaveBeenCalledWith({
      tabId: TAB_ID,
      paneId: '%1',
      cols: 120,
      rows: 36
    })
  })

  it('calls teammateOutputReady with NEW dims when container size changes on reattach', async () => {
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    // First mount at 120x36
    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef1), {
      wrapper
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    unmount()
    mockTeammateOutputReady.mockClear()

    // Simulate: the companion panel is now wider/taller, so fit() will return different dims
    mockTerminal.cols = 100
    mockTerminal.rows = 30

    const containerRef2 = { current: container2 }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef2), { wrapper })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150))
    })

    // Must report the NEW dimensions so the tmux pane gets resized
    expect(mockTeammateOutputReady).toHaveBeenCalledWith({
      tabId: TAB_ID,
      paneId: '%1',
      cols: 100,
      rows: 30
    })
  })

  it('calls fit() before reading cols/rows on reattach', async () => {
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    // Track call order
    const callOrder: string[] = []
    mockFitAddon.fit.mockImplementation(() => {
      callOrder.push('fit')
    })
    const originalColsGetter = Object.getOwnPropertyDescriptor(mockTerminal, 'cols')
    Object.defineProperty(mockTerminal, 'cols', {
      get() {
        callOrder.push('read-cols')
        return 120
      },
      configurable: true
    })

    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef1), {
      wrapper
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    unmount()
    callOrder.length = 0

    const containerRef2 = { current: container2 }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef2), { wrapper })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150))
    })

    // fit() MUST be called before reading cols/rows
    const fitIdx = callOrder.indexOf('fit')
    const colsIdx = callOrder.indexOf('read-cols')
    expect(fitIdx).toBeGreaterThanOrEqual(0)
    expect(colsIdx).toBeGreaterThan(fitIdx)

    // Restore
    Object.defineProperty(mockTerminal, 'cols', originalColsGetter || { value: 120 })
  })

  it('fallback timer fires if ResizeObserver does not', async () => {
    // Override ResizeObserver to NOT fire automatically
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {
          /* intentionally no callback */
        }
        disconnect() {}
        unobserve() {}
      }
    )

    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef1), {
      wrapper
    })

    // Fallback fires at 200ms
    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    expect(mockTeammateOutputReady).toHaveBeenCalledTimes(1)
    unmount()
    mockTeammateOutputReady.mockClear()

    // Reattach — fallback should also fire
    const containerRef2 = { current: container2 }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef2), { wrapper })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })

    expect(mockTeammateOutputReady).toHaveBeenCalledTimes(1)

    // Restore original ResizeObserver mock
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private cb: () => void
        constructor(cb: () => void) {
          this.cb = cb
          resizeObserverCallback = cb
        }
        observe() {
          setTimeout(() => this.cb(), 0)
        }
        disconnect() {}
        unobserve() {}
      }
    )
  })

  it('does not call teammateResize on reattach (only teammateOutputReady)', async () => {
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef1), {
      wrapper
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    unmount()
    mockTeammateResize.mockClear()
    mockTeammateOutputReady.mockClear()

    const containerRef2 = { current: container2 }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef2), { wrapper })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 150))
    })

    // Reattach should call teammateOutputReady (includes resize + capture)
    // NOT teammateResize (which only resizes without capture)
    expect(mockTeammateOutputReady).toHaveBeenCalledTimes(1)
    expect(mockTeammateResize).not.toHaveBeenCalled()
  })

  it('scrollToBottom is called on reattach', async () => {
    const container1 = document.createElement('div')
    const container2 = document.createElement('div')

    const containerRef1 = { current: container1 }
    const { unmount } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef1), {
      wrapper
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    unmount()
    mockTerminal.scrollToBottom.mockClear()

    const containerRef2 = { current: container2 }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef2), { wrapper })

    expect(mockTerminal.scrollToBottom).toHaveBeenCalledTimes(1)
  })

  it('rapid pane switching: detach and reattach quickly', async () => {
    const containers = Array.from({ length: 3 }, () => document.createElement('div'))

    // Mount pane A
    const refA = { current: containers[0] }
    const { unmount: unmountA } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', refA), {
      wrapper
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    expect(mockTeammateOutputReady).toHaveBeenCalled()

    // Switch to pane B (unmount A, mount B)
    unmountA()
    mockTeammateOutputReady.mockClear()

    const refB = { current: containers[1] }
    const { unmount: unmountB } = renderHook(() => useTeammateTerminal(TAB_ID, '%1', refB), {
      wrapper
    })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    expect(mockTeammateOutputReady).toHaveBeenCalled()

    // Switch to pane C (unmount B, mount C)
    unmountB()
    mockTeammateOutputReady.mockClear()

    const refC = { current: containers[2] }
    renderHook(() => useTeammateTerminal(TAB_ID, '%1', refC), { wrapper })

    await act(async () => {
      await new Promise((r) => setTimeout(r, 300))
    })
    expect(mockTeammateOutputReady).toHaveBeenCalled()
  })

  it('ResizeObserver observes the container element, not the terminal element', () => {
    // Track what element was observed
    let observedEl: Element | null = null
    vi.stubGlobal(
      'ResizeObserver',
      class {
        private cb: () => void
        constructor(cb: () => void) {
          this.cb = cb
        }
        observe(el: Element) {
          observedEl = el
          setTimeout(() => this.cb(), 0)
        }
        disconnect() {}
        unobserve() {}
      }
    )

    const container = document.createElement('div')
    const containerRef = { current: container }

    renderHook(() => useTeammateTerminal(TAB_ID, '%1', containerRef), { wrapper })

    // The ResizeObserver should observe the container div, NOT the terminal's internal element
    expect(observedEl).toBe(container)
  })
})
