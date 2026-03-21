import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { Unicode11Addon } from '@xterm/addon-unicode11'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { TERMINAL_THEME } from '../../../shared/constants'

export interface TerminalEntry {
  terminal: Terminal
  fitAddon: FitAddon
  cleanup: () => void
  isAttached: boolean
}

const entries = new Map<string, TerminalEntry>()

function makeKey(tabId: string, id: string): string {
  return `${tabId}:${id}`
}

const BASE_TERMINAL_OPTIONS: Partial<ConstructorParameters<typeof Terminal>[0]> = {
  fontSize: 13,
  fontFamily: "'MesloLGS NF', 'JetBrains Mono', 'Menlo', 'DejaVu Sans Mono', 'SF Mono', monospace",
  fontWeight: '400',
  fontWeightBold: '700',
  theme: TERMINAL_THEME,
  allowTransparency: false,
  scrollback: 10000,
  drawBoldTextInBrightColors: false
}

function loadAddons(terminal: Terminal): void {
  try {
    // Unicode 11 for proper emoji and wide-character width calculation
    const unicode11 = new Unicode11Addon()
    terminal.loadAddon(unicode11)
    terminal.unicode.activeVersion = '11'
  } catch {
    // May fail in test environments with mocked Terminal
  }

  try {
    // Clickable URLs in terminal output
    terminal.loadAddon(new WebLinksAddon())
  } catch {
    // May fail in test environments
  }
}

// WebGL addon requires an open terminal (canvas in DOM).
// Tracked per-terminal to avoid double-loading on reattach.
const webglLoaded = new Set<string>()

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
  loadAddons(terminal)

  const cleanup = setupFn ? setupFn(terminal) : () => {}

  const entry: TerminalEntry = { terminal, fitAddon, cleanup, isAttached: false }
  entries.set(key, entry)
  return entry
}

/**
 * Attaches a terminal to a DOM container. On first call, uses terminal.open().
 * On subsequent calls, moves the existing DOM element into the new container.
 */
export function attachTerminal(tabId: string, id: string, container: HTMLDivElement): void {
  const key = makeKey(tabId, id)
  const entry = entries.get(key)
  if (!entry) return

  const { terminal } = entry

  if (!terminal.element) {
    terminal.open(container)
  } else {
    container.appendChild(terminal.element)
  }

  entry.isAttached = true

  // Load WebGL renderer after terminal is open (requires canvas in DOM)
  if (!webglLoaded.has(key)) {
    try {
      const webgl = new WebglAddon()
      webgl.onContextLoss(() => {
        webgl.dispose()
        webglLoaded.delete(key)
      })
      terminal.loadAddon(webgl)
      webglLoaded.add(key)
    } catch {
      // WebGL unavailable — canvas renderer is used automatically
    }
  }

  // Delay refresh/focus until after DOM layout settles.
  // NOTE: Do NOT call fitAddon.fit() here — the caller's ResizeObserver
  // handles fitting with proper timing. Calling fit() here races with
  // the observer and can measure stale/wrong container dimensions.
  requestAnimationFrame(() => {
    terminal.refresh(0, terminal.rows - 1)
    terminal.focus()
  })
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

/** Disposes a single terminal and removes it from the registry. */
export function disposeTerminal(tabId: string, id: string): void {
  const key = makeKey(tabId, id)
  const entry = entries.get(key)
  if (!entry) return
  entry.cleanup()
  entry.terminal.dispose()
  entries.delete(key)
  webglLoaded.delete(key)
}

/** Disposes all terminals for a given tab. Call on tab close. */
export function disposeTabTerminals(tabId: string): void {
  const prefix = `${tabId}:`
  for (const [key, entry] of entries) {
    if (key.startsWith(prefix)) {
      entry.cleanup()
      entry.terminal.dispose()
      entries.delete(key)
      webglLoaded.delete(key)
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
  webglLoaded.clear()
}
