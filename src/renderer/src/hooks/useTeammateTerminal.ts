import { useEffect, useRef, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { getOrCreateTerminal, attachTerminal, detachTerminal } from '../terminal/TerminalRegistry'

const RESIZE_DEBOUNCE_MS = 150

export function useTeammateTerminal(
  tabId: string,
  paneId: string,
  containerRef: RefObject<HTMLDivElement | null>
) {
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const termId = `teammate:${paneId}`

    const entry = getOrCreateTerminal(
      tabId,
      termId,
      { cursorBlink: false, cursorStyle: 'bar', cursorInactiveStyle: 'none' },
      (term) => {
        // IPC output subscription — writes directly to xterm buffer even when detached.
        // xterm.js updates its internal buffer without canvas rendering when not in DOM,
        // and paints correctly on reattach.
        const unsubscribe = window.api.onTeammateOutput((payload) => {
          if (payload.paneId === paneId && payload.tabId === tabId) {
            term.write(payload.data)
          }
        })

        return unsubscribe
      }
    )

    termRef.current = entry.terminal
    fitRef.current = entry.fitAddon

    // Attach to DOM (open or re-attach)
    const isReattach = !!entry.terminal.element
    attachTerminal(tabId, termId, containerRef.current)

    // Input handler — only active while attached
    const dataDisposable = entry.terminal.onData((data) => {
      window.api.sendTeammateInput({ tabId, paneId, data })
    })

    if (isReattach) {
      // Scroll to bottom so the most recent output is visible when switching panes
      entry.terminal.scrollToBottom()
    }

    // Track whether we need a capture-pane snapshot (first mount + every reattach)
    let snapshotNeeded = true

    // Resize observer — fires on initial observe AND on size changes.
    // This is the ONLY place we fit + resize, ensuring we always have
    // correct container dimensions (measured by the browser, not guessed).
    let lastCols = 0
    let lastRows = 0
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const doFitAndResize = () => {
      try {
        entry.fitAddon.fit()
        const cols = entry.terminal.cols
        const rows = entry.terminal.rows
        if (!cols || !rows) return

        if (cols !== lastCols || rows !== lastRows) {
          lastCols = cols
          lastRows = rows

          if (snapshotNeeded) {
            snapshotNeeded = false
            window.api.teammateOutputReady({ tabId, paneId, cols, rows })
          } else {
            window.api.teammateResize?.({ tabId, paneId, cols, rows })
          }
        } else if (snapshotNeeded) {
          snapshotNeeded = false
          window.api.teammateOutputReady({ tabId, paneId, cols, rows })
        }
      } catch {
        // ignore resize errors
      }
    }

    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(
        () => {
          // Use rAF to ensure browser has completed flex layout before measuring
          requestAnimationFrame(doFitAndResize)
        },
        isReattach ? 50 : RESIZE_DEBOUNCE_MS
      )
    })
    resizeObserver.observe(containerRef.current)

    // Fallback: if ResizeObserver doesn't fire within 200ms (e.g., container
    // size unchanged on reattach), force fit + snapshot manually.
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null
    if (snapshotNeeded) {
      fallbackTimer = setTimeout(() => {
        if (!snapshotNeeded) return // Observer already handled it
        try {
          entry.fitAddon.fit()
          const cols = entry.terminal.cols || 80
          const rows = entry.terminal.rows || 24
          snapshotNeeded = false
          lastCols = cols
          lastRows = rows
          window.api.teammateOutputReady({ tabId, paneId, cols, rows })
        } catch {
          // ignore
        }
      }, 200)
    }

    return () => {
      dataDisposable.dispose()
      if (resizeTimer) clearTimeout(resizeTimer)
      if (fallbackTimer) clearTimeout(fallbackTimer)
      resizeObserver.disconnect()
      // Detach from DOM but keep terminal alive in registry
      detachTerminal(tabId, termId)
    }
  }, [tabId, paneId, containerRef])

  return { termRef, fitRef }
}
