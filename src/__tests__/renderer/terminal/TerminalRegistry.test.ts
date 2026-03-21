import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFitAddon, terminalInstances } = vi.hoisted(() => {
  const mockFitAddon = {
    fit: vi.fn(),
    dispose: vi.fn()
  }

  const terminalInstances: Array<Record<string, unknown>> = []

  return { mockFitAddon, terminalInstances }
})

function createMockTerminal() {
  const instance = {
    open: vi.fn(),
    write: vi.fn(),
    dispose: vi.fn(),
    loadAddon: vi.fn(),
    focus: vi.fn(),
    refresh: vi.fn(),
    cols: 80,
    rows: 24,
    options: {},
    element: undefined as HTMLDivElement | undefined,
    unicode: { activeVersion: '6' }
  }
  terminalInstances.push(instance)
  return instance
}

vi.mock('@xterm/xterm', () => ({
  Terminal: function (_opts?: Record<string, unknown>) {
    return createMockTerminal()
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: function () {
    return mockFitAddon
  }
}))

vi.mock('@xterm/addon-webgl', () => ({
  WebglAddon: function () {
    return { onContextLoss: vi.fn(), dispose: vi.fn() }
  }
}))

vi.mock('@xterm/addon-unicode11', () => ({
  Unicode11Addon: function () {
    return {}
  }
}))

vi.mock('@xterm/addon-web-links', () => ({
  WebLinksAddon: function () {
    return {}
  }
}))

const {
  getTerminal,
  getOrCreateTerminal,
  attachTerminal,
  detachTerminal,
  isTerminalAttached,
  disposeTerminal,
  disposeTabTerminals,
  getTabTerminalCount,
  clearAllTerminals
} = await import('../../../renderer/src/terminal/TerminalRegistry')

describe('TerminalRegistry', () => {
  beforeEach(() => {
    clearAllTerminals()
    vi.clearAllMocks()
    terminalInstances.length = 0
  })

  describe('getOrCreateTerminal', () => {
    it('creates a new terminal entry', () => {
      const entry = getOrCreateTerminal('tab1', 'agent1')
      expect(entry).toBeDefined()
      expect(entry.terminal).toBeDefined()
      expect(entry.fitAddon).toBeDefined()
      expect(entry.isAttached).toBe(false)
    })

    it('returns existing terminal on second call with same ids', () => {
      const first = getOrCreateTerminal('tab1', 'agent1')
      const second = getOrCreateTerminal('tab1', 'agent1')
      expect(first).toBe(second)
    })

    it('creates separate terminals for different ids', () => {
      const a = getOrCreateTerminal('tab1', 'agent1')
      const b = getOrCreateTerminal('tab1', 'agent2')
      expect(a).not.toBe(b)
    })

    it('creates separate terminals for different tabs', () => {
      const a = getOrCreateTerminal('tab1', 'agent1')
      const b = getOrCreateTerminal('tab2', 'agent1')
      expect(a).not.toBe(b)
    })

    it('calls setupFn on creation and stores cleanup', () => {
      const cleanupFn = vi.fn()
      const setupFn = vi.fn().mockReturnValue(cleanupFn)
      const entry = getOrCreateTerminal('tab1', 'agent1', undefined, setupFn)
      expect(setupFn).toHaveBeenCalledWith(entry.terminal)

      disposeTerminal('tab1', 'agent1')
      expect(cleanupFn).toHaveBeenCalled()
    })

    it('does not call setupFn on subsequent calls', () => {
      const setupFn = vi.fn().mockReturnValue(() => {})
      getOrCreateTerminal('tab1', 'agent1', undefined, setupFn)
      getOrCreateTerminal('tab1', 'agent1', undefined, setupFn)
      expect(setupFn).toHaveBeenCalledTimes(1)
    })
  })

  describe('getTerminal', () => {
    it('returns undefined for non-existent terminal', () => {
      expect(getTerminal('tab1', 'agent1')).toBeUndefined()
    })

    it('returns existing terminal entry', () => {
      const entry = getOrCreateTerminal('tab1', 'agent1')
      expect(getTerminal('tab1', 'agent1')).toBe(entry)
    })
  })

  describe('attachTerminal / detachTerminal', () => {
    it('marks terminal as attached', () => {
      getOrCreateTerminal('tab1', 'agent1')
      const container = document.createElement('div')
      attachTerminal('tab1', 'agent1', container)
      expect(isTerminalAttached('tab1', 'agent1')).toBe(true)
    })

    it('opens terminal into container on first attach', () => {
      const entry = getOrCreateTerminal('tab1', 'agent1')
      const container = document.createElement('div')
      attachTerminal('tab1', 'agent1', container)
      expect(entry.terminal.open).toHaveBeenCalledWith(container)
    })

    it('moves terminal element on re-attach', () => {
      const entry = getOrCreateTerminal('tab1', 'agent1')
      const container1 = document.createElement('div')

      // First attach
      attachTerminal('tab1', 'agent1', container1)

      // Simulate that terminal.open set the element
      const fakeEl = document.createElement('div')
      ;(entry.terminal as Record<string, unknown>).element = fakeEl

      const container2 = document.createElement('div')
      attachTerminal('tab1', 'agent1', container2)
      expect(container2.contains(fakeEl)).toBe(true)
    })

    it('detaches terminal from DOM', () => {
      const entry = getOrCreateTerminal('tab1', 'agent1')
      const container = document.createElement('div')
      const fakeEl = document.createElement('div')
      container.appendChild(fakeEl)
      ;(entry.terminal as Record<string, unknown>).element = fakeEl

      attachTerminal('tab1', 'agent1', container)
      detachTerminal('tab1', 'agent1')

      expect(isTerminalAttached('tab1', 'agent1')).toBe(false)
      expect(container.contains(fakeEl)).toBe(false)
    })

    it('does nothing when attaching non-existent terminal', () => {
      const container = document.createElement('div')
      attachTerminal('tab1', 'nonexistent', container)
    })

    it('does nothing when detaching non-existent terminal', () => {
      detachTerminal('tab1', 'nonexistent')
    })
  })

  describe('isTerminalAttached', () => {
    it('returns false for non-existent terminal', () => {
      expect(isTerminalAttached('tab1', 'agent1')).toBe(false)
    })

    it('returns false for created but unattached terminal', () => {
      getOrCreateTerminal('tab1', 'agent1')
      expect(isTerminalAttached('tab1', 'agent1')).toBe(false)
    })
  })

  describe('disposeTerminal', () => {
    it('disposes and removes terminal from registry', () => {
      const entry = getOrCreateTerminal('tab1', 'agent1')
      disposeTerminal('tab1', 'agent1')
      expect(entry.terminal.dispose).toHaveBeenCalled()
      expect(getTerminal('tab1', 'agent1')).toBeUndefined()
    })

    it('calls cleanup function on dispose', () => {
      const cleanup = vi.fn()
      getOrCreateTerminal('tab1', 'agent1', undefined, () => cleanup)
      disposeTerminal('tab1', 'agent1')
      expect(cleanup).toHaveBeenCalled()
    })

    it('does nothing for non-existent terminal', () => {
      disposeTerminal('tab1', 'nonexistent')
    })
  })

  describe('disposeTabTerminals', () => {
    it('disposes all terminals for a tab', () => {
      const e1 = getOrCreateTerminal('tab1', 'agent1')
      const e2 = getOrCreateTerminal('tab1', 'agent2')
      const e3 = getOrCreateTerminal('tab2', 'agent1')

      disposeTabTerminals('tab1')

      expect(e1.terminal.dispose).toHaveBeenCalled()
      expect(e2.terminal.dispose).toHaveBeenCalled()
      expect(e3.terminal.dispose).not.toHaveBeenCalled()
      expect(getTerminal('tab1', 'agent1')).toBeUndefined()
      expect(getTerminal('tab1', 'agent2')).toBeUndefined()
      expect(getTerminal('tab2', 'agent1')).toBeDefined()
    })

    it('does nothing for tab with no terminals', () => {
      getOrCreateTerminal('tab1', 'agent1')
      disposeTabTerminals('tab2')
      expect(getTerminal('tab1', 'agent1')).toBeDefined()
    })
  })

  describe('getTabTerminalCount', () => {
    it('returns 0 for empty tab', () => {
      expect(getTabTerminalCount('tab1')).toBe(0)
    })

    it('counts terminals for specific tab', () => {
      getOrCreateTerminal('tab1', 'agent1')
      getOrCreateTerminal('tab1', 'agent2')
      getOrCreateTerminal('tab2', 'agent1')

      expect(getTabTerminalCount('tab1')).toBe(2)
      expect(getTabTerminalCount('tab2')).toBe(1)
    })

    it('reflects disposals', () => {
      getOrCreateTerminal('tab1', 'agent1')
      getOrCreateTerminal('tab1', 'agent2')
      expect(getTabTerminalCount('tab1')).toBe(2)

      disposeTerminal('tab1', 'agent1')
      expect(getTabTerminalCount('tab1')).toBe(1)
    })
  })

  describe('clearAllTerminals', () => {
    it('disposes and removes all terminals', () => {
      const e1 = getOrCreateTerminal('tab1', 'agent1')
      const e2 = getOrCreateTerminal('tab2', 'agent2')

      clearAllTerminals()

      expect(e1.terminal.dispose).toHaveBeenCalled()
      expect(e2.terminal.dispose).toHaveBeenCalled()
      expect(getTerminal('tab1', 'agent1')).toBeUndefined()
      expect(getTerminal('tab2', 'agent2')).toBeUndefined()
    })

    it('calls cleanup on all terminals', () => {
      const cleanup1 = vi.fn()
      const cleanup2 = vi.fn()
      getOrCreateTerminal('tab1', 'a', undefined, () => cleanup1)
      getOrCreateTerminal('tab2', 'b', undefined, () => cleanup2)

      clearAllTerminals()

      expect(cleanup1).toHaveBeenCalled()
      expect(cleanup2).toHaveBeenCalled()
    })
  })
})
