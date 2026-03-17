import { useEffect, useRef, type RefObject } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import { TERMINAL_THEME } from '../../../shared/constants'

export function useTerminal(agentId: string, containerRef: RefObject<HTMLDivElement | null>) {
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: false,
      cursorStyle: 'bar',
      cursorInactiveStyle: 'none',
      fontSize: 13,
      fontFamily: "'MesloLGS NF', 'Menlo', 'DejaVu Sans Mono', 'SF Mono', monospace",
      theme: TERMINAL_THEME,
      allowTransparency: false,
      scrollback: 10000
    })

    const fitAddon = new FitAddon()
    term.loadAddon(fitAddon)
    term.open(containerRef.current)

    try {
      fitAddon.fit()
    } catch {
      // fit may fail if container has no dimensions yet
    }

    termRef.current = term
    fitRef.current = fitAddon

    // Show welcome banner
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

    // Subscribe to agent output — first output clears the banner
    let bannerCleared = false
    const unsubscribe = window.api.onAgentOutput((payload) => {
      if (payload.agentId === agentId) {
        if (!bannerCleared) {
          bannerCleared = true
          term.reset()
        }
        term.write(payload.data)
      }
    })

    // Send keyboard input to agent
    const dataDisposable = term.onData((data) => {
      window.api.agentInput({ agentId, data })
    })

    // Handle resize — sync PTY dimensions on every resize
    let lastCols = 0
    let lastRows = 0
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        if (term.cols && term.rows && (term.cols !== lastCols || term.rows !== lastRows)) {
          lastCols = term.cols
          lastRows = term.rows
          window.api.agentResize?.({ agentId, cols: term.cols, rows: term.rows })
        }
      } catch {
        // ignore resize errors
      }
    })
    resizeObserver.observe(containerRef.current)

    return () => {
      dataDisposable.dispose()
      unsubscribe()
      resizeObserver.disconnect()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [agentId, containerRef])

  return { termRef, fitRef }
}
