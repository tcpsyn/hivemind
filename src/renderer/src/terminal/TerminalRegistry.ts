import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { TERMINAL_THEME } from '../../../shared/constants'

export interface TerminalEntry {
  terminal: Terminal
  fitAddon: FitAddon
  cleanup: () => void
  isAttached: boolean
  pendingOutput: string[]
}

const entries = new Map<string, TerminalEntry>()

function makeKey(tabId: string, id: string): string {
  return `${tabId}:${id}`
}

const BASE_TERMINAL_OPTIONS: Partial<ConstructorParameters<typeof Terminal>[0]> = {
  fontSize: 13,
  fontFamily: "'MesloLGS NF', 'Menlo', 'DejaVu Sans Mono', 'SF Mono', monospace",
  theme: TERMINAL_THEME,
  allowTransparency: false,
  scrollback: 10000
}

export function getTerminal(tabId: string, id: string): TerminalEntry | undefined {
  return entries.get(makeKey(tabId, id))
}

/**
 * Returns an existing terminal entry or creates a new one.
 * The setupFn runs once on creation and should return a cleanup function
 * (e.g. IPC unsubscribe). It receives the terminal so it can subscribe
 * to output events that keep running even when the terminal is detached.
 */
export function getOrCreateTerminal(
  tabId: string,
  id: string,
  options?: Partial<ConstructorParameters<typeof Terminal>[0]>,
  setupFn?: (terminal: Terminal) => () => void
): TerminalEntry {
  const key = makeKey(tabId, id)
  const existing = entries.get(key)
  if (existing) return existing

  const terminal = new Terminal({ ...BASE_TERMINAL_OPTIONS, ...options })
  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  const cleanup = setupFn ? setupFn(terminal) : () => {}

  const entry: TerminalEntry = { terminal, fitAddon, cleanup, isAttached: false, pendingOutput: [] }
  entries.set(key, entry)
  return entry
}

/**
 * Attaches a terminal to a DOM container. On first call, uses terminal.open().
 * On subsequent calls, moves the existing DOM element into the new container.
 */
export function attachTerminal(
  tabId: string,
  id: string,
  container: HTMLDivElement
): void {
  const entry = entries.get(makeKey(tabId, id))
  if (!entry) return

  const { terminal, fitAddon } = entry

  if (!terminal.element) {
    terminal.open(container)
  } else {
    container.appendChild(terminal.element)
  }

  entry.isAttached = true

  // Flush any output that arrived while detached
  if (entry.pendingOutput.length > 0) {
    for (const data of entry.pendingOutput) {
      terminal.write(data)
    }
    entry.pendingOutput = []
  }

  try {
    fitAddon.fit()
  } catch {
    // fit may fail if container has no dimensions yet
  }
}

/**
 * Detaches a terminal from the DOM without disposing it.
 * The terminal stays alive in memory and continues receiving data.
 */
export function detachTerminal(tabId: string, id: string): void {
  const entry = entries.get(makeKey(tabId, id))
  if (!entry) return
  entry.isAttached = false
  if (entry.terminal.element?.parentElement) {
    entry.terminal.element.parentElement.removeChild(entry.terminal.element)
  }
}

/** Returns whether a terminal is currently attached to the DOM. */
export function isTerminalAttached(tabId: string, id: string): boolean {
  const entry = entries.get(makeKey(tabId, id))
  return entry?.isAttached ?? false
}

/** Buffers output data for a detached terminal (replayed on reattach). */
export function bufferOutput(tabId: string, id: string, data: string): void {
  const entry = entries.get(makeKey(tabId, id))
  if (entry) {
    entry.pendingOutput.push(data)
  }
}

/** Disposes a single terminal and removes it from the registry. */
export function disposeTerminal(tabId: string, id: string): void {
  const key = makeKey(tabId, id)
  const entry = entries.get(key)
  if (!entry) return
  entry.cleanup()
  entry.terminal.dispose()
  entries.delete(key)
}

/** Disposes all terminals for a given tab. Call on tab close. */
export function disposeTabTerminals(tabId: string): void {
  const prefix = `${tabId}:`
  for (const [key, entry] of entries) {
    if (key.startsWith(prefix)) {
      entry.cleanup()
      entry.terminal.dispose()
      entries.delete(key)
    }
  }
}

/** Returns the count of active terminals for a tab (for debugging/tests). */
export function getTabTerminalCount(tabId: string): number {
  const prefix = `${tabId}:`
  let count = 0
  for (const key of entries.keys()) {
    if (key.startsWith(prefix)) count++
  }
  return count
}

/** Clears all entries. For testing only. */
export function clearAllTerminals(): void {
  for (const entry of entries.values()) {
    entry.cleanup()
    entry.terminal.dispose()
  }
  entries.clear()
}
