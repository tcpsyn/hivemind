import { useEffect, useRef, type RefObject } from 'react'
import { Terminal } from 'xterm'
import { FitAddon } from '@xterm/addon-fit'

export function useTerminal(agentId: string, containerRef: RefObject<HTMLDivElement | null>) {
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "'MesloLGS NF', 'Menlo', 'DejaVu Sans Mono', 'SF Mono', monospace",
      theme: {
        background: '#1a1a2e',
        foreground: '#e0e0e0',
        cursor: '#e0e0e0',
        cursorAccent: '#1a1a2e',
        selectionBackground: '#2a3a66',
        selectionForeground: '#e0e0e0'
      },
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

    // Handle resize and trigger PTY resize so Claude redraws
    let initialResizeDone = false
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
        if (!initialResizeDone && term.cols && term.rows) {
          initialResizeDone = true
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
