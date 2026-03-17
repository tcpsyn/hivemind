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
      fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', Consolas, monospace",
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

    // Subscribe to agent output
    const unsubscribe = window.api.onAgentOutput((payload) => {
      if (payload.agentId === agentId) {
        term.write(payload.data)
      }
    })

    // Send keyboard input to agent
    const dataDisposable = term.onData((data) => {
      window.api.agentInput({ agentId, data })
    })

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      try {
        fitAddon.fit()
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
