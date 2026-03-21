import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { TmuxProxyServer, type ExecCommand } from '../../../main/tmux/TmuxProxyServer'

describe('TmuxProxyServer — error paths and edge cases', () => {
  let server: TmuxProxyServer
  let socketPath: string
  let mockExec: ReturnType<typeof vi.fn<ExecCommand>>

  beforeEach(() => {
    socketPath = path.join(os.tmpdir(), `cc-proxy-err-test-${crypto.randomUUID()}.sock`)
    mockExec = vi.fn<ExecCommand>().mockResolvedValue({ stdout: '', stderr: '' })
  })

  afterEach(async () => {
    if (server) {
      await server.stop()
    }
  })

  function createServer(opts?: {
    pollIntervalMs?: number
    leadPaneId?: string
    leadSessionName?: string
  }): TmuxProxyServer {
    server = new TmuxProxyServer(socketPath, '/usr/bin/tmux', {
      execCommand: mockExec,
      leadPaneId: opts?.leadPaneId ?? '%0',
      leadSessionName: opts?.leadSessionName,
      pollIntervalMs: opts?.pollIntervalMs ?? 0
    })
    return server
  }

  describe('consecutive discover failures', () => {
    it('emits server-error after 3 consecutive failures', async () => {
      createServer({ leadSessionName: 'main' })
      mockExec.mockRejectedValue(new Error('tmux unreachable'))

      const errors: unknown[] = []
      const serverErrors: unknown[] = []
      server.on('error', (e: unknown) => errors.push(e))
      server.on('server-error', (e: unknown) => serverErrors.push(e))

      await server.discoverPanes()
      await server.discoverPanes()
      expect(serverErrors).toHaveLength(0)

      await server.discoverPanes()
      expect(serverErrors).toHaveLength(1)
      expect(serverErrors[0]).toMatchObject({
        failures: 3,
        message: expect.stringContaining('unreachable')
      })
    })

    it('reports isHealthy() as false after max failures', async () => {
      createServer({ leadSessionName: 'main' })
      server.on('error', () => {}) // prevent unhandled error throw
      mockExec.mockRejectedValue(new Error('fail'))

      expect(server.isHealthy()).toBe(true)

      await server.discoverPanes()
      await server.discoverPanes()
      await server.discoverPanes()

      expect(server.isHealthy()).toBe(false)
    })

    it('emits server-recovered when discovery succeeds after failures', async () => {
      createServer({ leadSessionName: 'main' })
      server.on('error', () => {}) // prevent unhandled error throw

      // 3 failures to trigger unhealthy state
      mockExec.mockRejectedValue(new Error('fail'))
      await server.discoverPanes()
      await server.discoverPanes()
      await server.discoverPanes()
      expect(server.isHealthy()).toBe(false)

      // Recovery
      const recovered: unknown[] = []
      server.on('server-recovered', () => recovered.push(true))
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.discoverPanes()

      expect(recovered).toHaveLength(1)
      expect(server.isHealthy()).toBe(true)
    })

    it('resets failure counter on successful discovery', async () => {
      createServer({ leadSessionName: 'main' })
      server.on('error', () => {}) // prevent unhandled error throw

      // 2 failures
      mockExec.mockRejectedValue(new Error('fail'))
      await server.discoverPanes()
      await server.discoverPanes()

      // Success resets counter
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })
      await server.discoverPanes()

      // 2 more failures should not trigger server-error (counter was reset)
      const serverErrors: unknown[] = []
      server.on('server-error', (e: unknown) => serverErrors.push(e))
      mockExec.mockRejectedValue(new Error('fail again'))
      await server.discoverPanes()
      await server.discoverPanes()

      expect(serverErrors).toHaveLength(0)
    })
  })

  describe('concurrent discovery guard', () => {
    it('prevents concurrent discoverPanes calls', async () => {
      createServer({ leadSessionName: 'main' })

      let resolveExec: (() => void) | null = null
      mockExec.mockImplementation(
        () =>
          new Promise<{ stdout: string; stderr: string }>((resolve) => {
            resolveExec = () => resolve({ stdout: '', stderr: '' })
          })
      )

      // Start first discovery
      const first = server.discoverPanes()

      // Second should be skipped (discovering = true)
      const events: ProxyPaneInfo[] = []
      server.on('teammate-detected', (info: ProxyPaneInfo) => events.push(info))

      const second = server.discoverPanes()

      // Resolve the first one
      resolveExec!()
      await first
      await second

      // Only one tmux call should have been made
      expect(mockExec).toHaveBeenCalledTimes(1)
    })
  })

  describe('sendInput error handling', () => {
    it('falls back to send-keys when TTY write fails', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('list-panes')) {
          return { stdout: '%1|1234|worker|/dev/nonexistent-tty|main\n', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })
      await server.discoverPanes()

      mockExec.mockClear()
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.sendInput('%1', 'test input')

      // Should have fallen back to send-keys since /dev/nonexistent-tty doesn't exist
      expect(mockExec).toHaveBeenCalledWith('/usr/bin/tmux', [
        'send-keys',
        '-t',
        '%1',
        '-l',
        'test input'
      ])
    })

    it('passes data literally to send-keys (no escaping needed with execFile)', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('list-panes')) {
          return { stdout: '%1|1234|worker||main\n', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })
      await server.discoverPanes()

      mockExec.mockClear()
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.sendInput('%1', 'say "hello" and "bye"')

      expect(mockExec).toHaveBeenCalledWith('/usr/bin/tmux', [
        'send-keys',
        '-t',
        '%1',
        '-l',
        'say "hello" and "bye"'
      ])
    })
  })

  describe('pending send-keys buffering', () => {
    it('buffers send-keys for undiscovered panes and replays on discovery', async () => {
      createServer({ leadSessionName: 'main' })

      const renamed: { paneId: string; name: string }[] = []
      server.on('teammate-renamed', (data: { paneId: string; name: string }) => renamed.push(data))

      // Simulate send-keys before pane is discovered (no server.start() needed)
      const handleFn = (server as any).handleSendKeysNotification.bind(server)
      handleFn(['-t', '%1', 'claude --agent-name researcher', 'Enter'])

      // No rename yet (pane not known)
      expect(renamed).toHaveLength(0)

      // Now discover the pane
      mockExec.mockResolvedValue({
        stdout: '%1|1234|worker|/dev/ttys001|main\n',
        stderr: ''
      })
      await server.discoverPanes()

      // Buffered send-keys should now be replayed
      expect(renamed).toHaveLength(1)
      expect(renamed[0]).toMatchObject({ paneId: '%1', name: 'researcher' })
    })
  })

  describe('pane streaming cleanup', () => {
    it('stops streaming when pane exits', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockResolvedValue({
        stdout: '%1|1234|worker|/dev/ttys001|main\n',
        stderr: ''
      })
      await server.discoverPanes()

      // Pane disappears
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      const exited: unknown[] = []
      server.on('teammate-exited', (e: unknown) => exited.push(e))
      await server.discoverPanes()

      expect(exited).toHaveLength(1)
      expect(server.getKnownPanes().size).toBe(0)
    })
  })

  describe('filterClaudeUILines', () => {
    it('only strips status bar lines (model + context %)', () => {
      const filterFn = (server as any).__proto__.filterClaudeUILines.bind(
        createServer({ leadSessionName: 'main' })
      )

      const input = [
        'Hello from Claude',
        '  thinking with high effort  ',
        'Some actual output',
        '───────────────',
        'tokens remaining: 100',
        '  cc_frontend  Opus 4.6  [████] 25%  ⌞ main',
        'Done'
      ].join('\n')

      const result = filterFn(input)
      expect(result).toContain('Hello from Claude')
      expect(result).toContain('Some actual output')
      expect(result).toContain('Done')
      // Non-status-bar lines are now preserved
      expect(result).toContain('thinking with')
      expect(result).toContain('tokens remaining')
      expect(result).toContain('───────────────')
      // Only the status bar is stripped
      expect(result).not.toContain('Opus 4.6')
    })

    it('filters status bar lines', () => {
      const srv = createServer({ leadSessionName: 'main' })
      const filterFn = (srv as any).filterClaudeUILines.bind(srv)

      const input = [
        'Real output here',
        '  cc_frontend  Opus 4.6  [████] 25%  ⌞ main',
        'More real output'
      ].join('\n')

      const result = filterFn(input)
      expect(result).toContain('Real output here')
      expect(result).toContain('More real output')
      expect(result).not.toContain('Opus 4.6')
    })
  })

  describe('resizePane error handling', () => {
    it('silently handles resize failure for destroyed pane', async () => {
      createServer()
      mockExec.mockRejectedValue(new Error('pane not found'))

      await expect(server.resizePane('%999', 120, 40)).resolves.not.toThrow()
    })
  })

  describe('stop idempotency', () => {
    it('handles stop when server was never started', async () => {
      createServer()
      await expect(server.stop()).resolves.not.toThrow()
    })

    it('clears all state on stop', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockResolvedValue({
        stdout: '%1|1234|worker|/dev/ttys001|main\n',
        stderr: ''
      })
      await server.discoverPanes()
      expect(server.getKnownPanes().size).toBe(1)

      await server.stop()
      expect(server.getKnownPanes().size).toBe(0)
      expect(server.isHealthy()).toBe(true)
    })
  })
})
