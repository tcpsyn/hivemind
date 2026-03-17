import { useEffect, useRef, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import {
  getOrCreateTerminal,
  attachTerminal,
  detachTerminal
} from '../terminal/TerminalRegistry'

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
      { cursorBlink: true },
      (term) => {
        // IPC output subscription — stays active even when detached from DOM
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
    attachTerminal(tabId, termId, containerRef.current)

    // Input handler — only active while attached
    const dataDisposable = entry.terminal.onData((data) => {
      window.api.sendTeammateInput({ tabId, paneId, data })
    })

    // Resize observer — only active while attached
    let lastCols = 0
    let lastRows = 0
    const resizeObserver = new ResizeObserver(() => {
      try {
        entry.fitAddon.fit()
        if (
          entry.terminal.cols &&
          entry.terminal.rows &&
          (entry.terminal.cols !== lastCols || entry.terminal.rows !== lastRows)
        ) {
          lastCols = entry.terminal.cols
          lastRows = entry.terminal.rows
          window.api.teammateResize?.({ tabId, paneId, cols: lastCols, rows: lastRows })
        }
      } catch {
        // ignore resize errors
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      dataDisposable.dispose()
      resizeObserver.disconnect()
      // Detach from DOM but keep terminal alive in registry
      detachTerminal(tabId, termId)
    }
  }, [tabId, paneId, containerRef])

  return { termRef, fitRef }
}
