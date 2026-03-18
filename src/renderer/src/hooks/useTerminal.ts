import { useEffect, useRef, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import {
  getOrCreateTerminal,
  attachTerminal,
  detachTerminal
} from '../terminal/TerminalRegistry'

const RESIZE_DEBOUNCE_MS = 150

export function useTerminal(
  tabId: string,
  agentId: string,
  containerRef: RefObject<HTMLDivElement | null>
) {
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const entry = getOrCreateTerminal(
      tabId,
      agentId,
      {
        cursorBlink: false,
        cursorStyle: 'bar',
        cursorInactiveStyle: 'none'
      },
      (term) => {
        // Welcome banner — written once on creation
        const purple = '\x1b[38;5;141m'
        const dim = '\x1b[2m'
        const reset = '\x1b[0m'
        const banner = [
          '',
          `${purple}    ⬡ ⬡ ⬡${reset}`,
          `${purple}   ⬡ ⬡ ⬡ ⬡${reset}`,
          `${purple}    ⬡ ⬡ ⬡${reset}`,
          '',
          `${purple}   H I V E M I N D${reset}`,
          '',
          `${dim}   Claude Code Agent Teams${reset}`,
          '',
          ''
        ]
        term.write(banner.join('\r\n'))

        // IPC output subscription — writes directly to xterm buffer even when detached.
        // xterm.js updates its internal buffer without canvas rendering when not in DOM,
        // and paints correctly on reattach.
        let bannerCleared = false
        const unsubscribe = window.api.onAgentOutput((payload) => {
          if (payload.agentId === agentId && payload.tabId === tabId) {
            if (!bannerCleared) {
              bannerCleared = true
              term.reset()
            }
            term.write(payload.data)
          }
        })

        return unsubscribe
      }
    )

    termRef.current = entry.terminal
    fitRef.current = entry.fitAddon

    // Attach to DOM (open or re-attach)
    attachTerminal(tabId, agentId, containerRef.current)

    // Input handler — only active while attached
    const dataDisposable = entry.terminal.onData((data) => {
      window.api.agentInput({ tabId, agentId, data })
    })

    // Resize observer — debounced to avoid fit() cascade during drag
    let lastCols = 0
    let lastRows = 0
    let resizeTimer: ReturnType<typeof setTimeout> | null = null
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeTimer = setTimeout(() => {
        try {
          entry.fitAddon.fit()
          if (
            entry.terminal.cols &&
            entry.terminal.rows &&
            (entry.terminal.cols !== lastCols || entry.terminal.rows !== lastRows)
          ) {
            lastCols = entry.terminal.cols
            lastRows = entry.terminal.rows
            window.api.agentResize?.({ tabId, agentId, cols: lastCols, rows: lastRows })
          }
        } catch {
          // ignore resize errors
        }
      }, RESIZE_DEBOUNCE_MS)
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      dataDisposable.dispose()
      if (resizeTimer) clearTimeout(resizeTimer)
      resizeObserver.disconnect()
      // Detach from DOM but keep terminal alive in registry
      detachTerminal(tabId, agentId)
    }
  }, [tabId, agentId, containerRef])

  return { termRef, fitRef }
}
