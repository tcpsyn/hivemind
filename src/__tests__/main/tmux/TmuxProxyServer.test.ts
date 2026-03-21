import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as net from 'net'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import {
  TmuxProxyServer,
  type ExecCommand,
  type ProxyPaneInfo
} from '../../../main/tmux/TmuxProxyServer'

function sendNotification(socketPath: string, data: object): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath, () => {
      client.write(JSON.stringify(data) + '\n')
      setTimeout(() => {
        client.destroy()
        resolve()
      }, 50)
    })
    client.on('error', reject)
    setTimeout(() => {
      client.destroy()
      reject(new Error('sendNotification timeout'))
    }, 5000)
  })
}

function waitForEvent<T>(emitter: TmuxProxyServer, event: string, timeoutMs = 5000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for '${event}'`)), timeoutMs)
    emitter.once(event, (data: T) => {
      clearTimeout(timer)
      resolve(data)
    })
  })
}

describe('TmuxProxyServer', () => {
  let server: TmuxProxyServer
  let socketPath: string
  let mockExec: ReturnType<typeof vi.fn<ExecCommand>>

  beforeEach(() => {
    socketPath = path.join(os.tmpdir(), `cc-proxy-test-${crypto.randomUUID()}.sock`)
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
      pollIntervalMs: opts?.pollIntervalMs ?? 0 // Disable polling by default in tests
    })
    return server
  }

  describe('start and stop', () => {
    it('starts listening on the socket path', async () => {
      createServer()
      await server.start()

      const connected = await new Promise<boolean>((resolve) => {
        const client = net.createConnection(socketPath, () => {
          client.destroy()
          resolve(true)
        })
        client.on('error', () => resolve(false))
      })

      expect(connected).toBe(true)
    })

    it('cleans up socket on stop', async () => {
      createServer()
      await server.start()
      await server.stop()

      const connected = await new Promise<boolean>((resolve) => {
        const client = net.createConnection(socketPath, () => {
          client.destroy()
          resolve(true)
        })
        client.on('error', () => resolve(false))
      })

      expect(connected).toBe(false)
    })

    it('removes stale socket on start', async () => {
      // Create a file at the socket path to simulate stale socket
      const fs = await import('fs')
      fs.writeFileSync(socketPath, '')

      createServer()
      await server.start()

      const connected = await new Promise<boolean>((resolve) => {
        const client = net.createConnection(socketPath, () => {
          client.destroy()
          resolve(true)
        })
        client.on('error', () => resolve(false))
      })

      expect(connected).toBe(true)
    })
  })

  describe('notification handling', () => {
    it('receives notification JSON and triggers pane discovery', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('list-panes')) {
          return { stdout: '%1|1234|researcher|/dev/ttys001|main\n', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      await server.start()

      const detected = waitForEvent<ProxyPaneInfo>(server, 'teammate-detected')

      await sendNotification(socketPath, {
        event: 'tmux-command',
        command: 'new-window',
        args: 'new-window -t main -n researcher',
        exitCode: 0
      })

      const paneInfo = await detected
      expect(paneInfo).toMatchObject({
        paneId: '%1',
        pid: 1234,
        windowName: 'researcher',
        sessionName: 'main'
      })
    })

    it('ignores non-tmux-command events', async () => {
      createServer()
      await server.start()

      const discoverSpy = vi.spyOn(server, 'discoverPanes')

      await sendNotification(socketPath, {
        event: 'something-else',
        data: 'whatever'
      })

      // Wait a bit to confirm no discovery triggered
      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(discoverSpy).not.toHaveBeenCalled()
    })

    it('ignores failed tmux commands (exitCode !== 0)', async () => {
      createServer()
      await server.start()

      const discoverSpy = vi.spyOn(server, 'discoverPanes')

      await sendNotification(socketPath, {
        event: 'tmux-command',
        command: 'new-window',
        args: 'new-window -t main -n researcher',
        exitCode: 1
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(discoverSpy).not.toHaveBeenCalled()
    })

    it('handles malformed JSON gracefully', async () => {
      createServer()
      await server.start()

      // Send garbage data
      await new Promise<void>((resolve) => {
        const client = net.createConnection(socketPath, () => {
          client.write('not valid json\n')
          setTimeout(() => {
            client.destroy()
            resolve()
          }, 50)
        })
      })

      // Server should still be running
      const connected = await new Promise<boolean>((resolve) => {
        const client = net.createConnection(socketPath, () => {
          client.destroy()
          resolve(true)
        })
        client.on('error', () => resolve(false))
      })

      expect(connected).toBe(true)
    })

    it('triggers discovery for split-window commands', async () => {
      createServer()
      await server.start()

      const discoverSpy = vi.spyOn(server, 'discoverPanes')

      await sendNotification(socketPath, {
        event: 'tmux-command',
        command: 'split-window',
        args: 'split-window -t %0 -h',
        exitCode: 0
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(discoverSpy).toHaveBeenCalled()
    })

    it('triggers discovery for kill-pane commands', async () => {
      createServer()
      await server.start()

      const discoverSpy = vi.spyOn(server, 'discoverPanes')

      await sendNotification(socketPath, {
        event: 'tmux-command',
        command: 'kill-pane',
        args: 'kill-pane -t %1',
        exitCode: 0
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(discoverSpy).toHaveBeenCalled()
    })

    it('triggers discovery for kill-session commands', async () => {
      createServer()
      await server.start()

      const discoverSpy = vi.spyOn(server, 'discoverPanes')

      await sendNotification(socketPath, {
        event: 'tmux-command',
        command: 'kill-session',
        args: 'kill-session -t main',
        exitCode: 0
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(discoverSpy).toHaveBeenCalled()
    })

    it('does not trigger discovery for send-keys commands', async () => {
      createServer()
      await server.start()

      const discoverSpy = vi.spyOn(server, 'discoverPanes')

      await sendNotification(socketPath, {
        event: 'tmux-command',
        command: 'send-keys',
        args: 'send-keys -t %1 "hello" Enter',
        exitCode: 0
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(discoverSpy).not.toHaveBeenCalled()
    })
  })

  describe('discoverPanes', () => {
    it('parses tmux list-panes output correctly', async () => {
      createServer({ leadSessionName: 'main' })

      const output =
        [
          '%0|5000|lead|/dev/ttys000|main',
          '%1|5001|researcher|/dev/ttys001|main',
          '%2|5002|coder|/dev/ttys002|main'
        ].join('\n') + '\n'

      mockExec.mockResolvedValue({ stdout: output, stderr: '' })

      const events: ProxyPaneInfo[] = []
      server.on('teammate-detected', (info: ProxyPaneInfo) => events.push(info))

      await server.discoverPanes()

      // Should detect %1 and %2 (skip %0 which is lead)
      expect(events).toHaveLength(2)
      expect(events[0]).toMatchObject({
        paneId: '%1',
        pid: 5001,
        windowName: 'researcher',
        tty: '/dev/ttys001',
        sessionName: 'main'
      })
      expect(events[1]).toMatchObject({
        paneId: '%2',
        pid: 5002,
        windowName: 'coder',
        tty: '/dev/ttys002',
        sessionName: 'main'
      })
    })

    it('filters out the lead pane', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockResolvedValue({
        stdout: '%0|5000|lead|/dev/ttys000|main\n',
        stderr: ''
      })

      const events: ProxyPaneInfo[] = []
      server.on('teammate-detected', (info: ProxyPaneInfo) => events.push(info))

      await server.discoverPanes()

      expect(events).toHaveLength(0)
    })

    it('uses custom lead pane ID for filtering', async () => {
      createServer({ leadPaneId: '%5', leadSessionName: 'main' })

      const output = '%5|5000|lead|/dev/ttys000|main\n%6|5001|worker|/dev/ttys001|main\n'
      mockExec.mockResolvedValue({ stdout: output, stderr: '' })

      const events: ProxyPaneInfo[] = []
      server.on('teammate-detected', (info: ProxyPaneInfo) => events.push(info))

      await server.discoverPanes()

      expect(events).toHaveLength(1)
      expect(events[0].paneId).toBe('%6')
    })

    it('emits teammate-detected for new panes', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockResolvedValue({
        stdout: '%1|1234|worker|/dev/ttys001|main\n',
        stderr: ''
      })

      const detected = waitForEvent<ProxyPaneInfo>(server, 'teammate-detected')

      await server.discoverPanes()

      const info = await detected
      expect(info).toMatchObject({
        paneId: '%1',
        pid: 1234,
        windowName: 'worker',
        tty: '/dev/ttys001',
        sessionName: 'main'
      })
    })

    it('does not re-emit for already known panes', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockResolvedValue({
        stdout: '%1|1234|worker|/dev/ttys001|main\n',
        stderr: ''
      })

      const events: ProxyPaneInfo[] = []
      server.on('teammate-detected', (info: ProxyPaneInfo) => events.push(info))

      await server.discoverPanes()
      await server.discoverPanes()

      expect(events).toHaveLength(1)
    })

    it('emits teammate-exited when panes disappear', async () => {
      createServer({ leadSessionName: 'main' })

      // First discover - pane exists
      mockExec.mockResolvedValueOnce({
        stdout: '%1|1234|worker|/dev/ttys001|main\n',
        stderr: ''
      })
      await server.discoverPanes()

      // Second discover - pane is gone
      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' })

      const exited = waitForEvent<{ paneId: string }>(server, 'teammate-exited')

      await server.discoverPanes()

      const info = await exited
      expect(info).toMatchObject({ paneId: '%1' })
    })

    it('removes exited panes from known panes', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockResolvedValueOnce({
        stdout: '%1|1234|worker|/dev/ttys001|main\n',
        stderr: ''
      })
      await server.discoverPanes()

      expect(server.getKnownPanes().size).toBe(1)

      mockExec.mockResolvedValueOnce({ stdout: '', stderr: '' })
      await server.discoverPanes()

      expect(server.getKnownPanes().size).toBe(0)
    })

    it('handles empty output gracefully', async () => {
      createServer({ leadSessionName: 'main' })
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await expect(server.discoverPanes()).resolves.not.toThrow()
    })

    it('handles whitespace-only output gracefully', async () => {
      createServer({ leadSessionName: 'main' })
      mockExec.mockResolvedValue({ stdout: '\n\n  \n', stderr: '' })

      await expect(server.discoverPanes()).resolves.not.toThrow()
    })

    it('emits error when tmux command fails', async () => {
      createServer({ leadSessionName: 'main' })
      mockExec.mockRejectedValue(new Error('tmux not running'))

      const errors: Error[] = []
      server.on('error', (err: Error) => errors.push(err))

      await server.discoverPanes()

      expect(errors).toHaveLength(1)
      expect(errors[0].message).toBe('tmux not running')
    })

    it('skips lines with insufficient fields', async () => {
      createServer({ leadSessionName: 'main' })
      mockExec.mockResolvedValue({
        stdout: '%1|1234\n%2|5678|coder|/dev/ttys002|main\n',
        stderr: ''
      })

      const events: ProxyPaneInfo[] = []
      server.on('teammate-detected', (info: ProxyPaneInfo) => events.push(info))

      await server.discoverPanes()

      expect(events).toHaveLength(1)
      expect(events[0].paneId).toBe('%2')
    })

    it('calls tmux list-panes with correct arguments', async () => {
      createServer({ leadSessionName: 'main' })
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.discoverPanes()

      expect(mockExec).toHaveBeenCalledWith('/usr/bin/tmux', [
        'list-panes',
        '-t',
        'main',
        '-a',
        '-F',
        '#{pane_id}|#{pane_pid}|#{window_name}|#{pane_tty}|#{session_name}'
      ])
    })

    it('skips discovery when leadSessionName is not set', async () => {
      createServer()
      mockExec.mockResolvedValue({ stdout: '%1|1234|worker|/dev/ttys001|main\n', stderr: '' })

      const events: ProxyPaneInfo[] = []
      server.on('teammate-detected', (info: ProxyPaneInfo) => events.push(info))

      await server.discoverPanes()

      expect(events).toHaveLength(0)
      expect(mockExec).not.toHaveBeenCalled()
    })
  })

  describe('sendInput', () => {
    it('falls back to tmux send-keys when pane TTY is unavailable', async () => {
      createServer({ leadSessionName: 'main' })

      // Use a non-existent TTY path so fs.openSync fails and falls through
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('list-panes')) {
          return { stdout: '%1|1234|worker||main\n', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })
      await server.discoverPanes()

      mockExec.mockClear()
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.sendInput('%1', 'hello')

      expect(mockExec).toHaveBeenCalledWith('/usr/bin/tmux', [
        'send-keys',
        '-t',
        '%1',
        '-l',
        'hello'
      ])
    })

    it('passes double quotes through unescaped (execFile does not use shell)', async () => {
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

      await server.sendInput('%1', 'echo "hello world"')

      expect(mockExec).toHaveBeenCalledWith('/usr/bin/tmux', [
        'send-keys',
        '-t',
        '%1',
        '-l',
        'echo "hello world"'
      ])
    })

    it('uses tmux send-keys directly for unknown panes', async () => {
      createServer()
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.sendInput('%99', 'test')

      expect(mockExec).toHaveBeenCalledWith('/usr/bin/tmux', [
        'send-keys',
        '-t',
        '%99',
        '-l',
        'test'
      ])
    })
  })

  describe('polling', () => {
    it('calls discoverPanes every poll interval', async () => {
      createServer({ pollIntervalMs: 100 })
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.start()

      const discoverSpy = vi.spyOn(server, 'discoverPanes')

      // Wait for a few poll cycles
      await new Promise((resolve) => setTimeout(resolve, 350))

      expect(discoverSpy.mock.calls.length).toBeGreaterThanOrEqual(2)
    })

    it('stops polling on stop', async () => {
      createServer({ pollIntervalMs: 100 })
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.start()
      await server.stop()

      const discoverSpy = vi.spyOn(server, 'discoverPanes')

      await new Promise((resolve) => setTimeout(resolve, 300))

      expect(discoverSpy).not.toHaveBeenCalled()
    })

    it('does not poll when pollIntervalMs is 0', async () => {
      createServer({ pollIntervalMs: 0 })
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.start()

      const discoverSpy = vi.spyOn(server, 'discoverPanes')

      await new Promise((resolve) => setTimeout(resolve, 200))

      expect(discoverSpy).not.toHaveBeenCalled()
    })
  })

  describe('parseClaudeStatus', () => {
    it('parses a standard Claude Code status line', async () => {
      createServer({ leadSessionName: 'main' })

      // Access private method via prototype
      const parseStatus = (server as any).parseClaudeStatus.bind(server)

      const output = '  cc_frontend  Opus 4.6  [████████████] 11%  ⌞ feature/branch\n'
      const result = parseStatus(output)

      expect(result).toBeDefined()
      expect(result.model).toBe('Opus 4.6')
      expect(result.contextPercent).toBe('11%')
      expect(result.project).toBe('cc_frontend')
      expect(result.branch).toBe('feature/branch')
    })

    it('parses Sonnet model', async () => {
      createServer({ leadSessionName: 'main' })
      const parseStatus = (server as any).parseClaudeStatus.bind(server)

      const output = '  myproject  Sonnet 4.6  [██] 3%  ⌞ main\n'
      const result = parseStatus(output)

      expect(result).toBeDefined()
      expect(result.model).toBe('Sonnet 4.6')
      expect(result.contextPercent).toBe('3%')
    })

    it('parses Haiku model', async () => {
      createServer({ leadSessionName: 'main' })
      const parseStatus = (server as any).parseClaudeStatus.bind(server)

      const output = '  app  Haiku 4.5  [█] 1%  ⌞ develop\n'
      const result = parseStatus(output)

      expect(result).toBeDefined()
      expect(result.model).toBe('Haiku 4.5')
    })

    it('returns null when no model pattern found', async () => {
      createServer({ leadSessionName: 'main' })
      const parseStatus = (server as any).parseClaudeStatus.bind(server)

      const result = parseStatus('some random terminal output\n')
      expect(result).toBeNull()
    })

    it('returns null for empty output', async () => {
      createServer({ leadSessionName: 'main' })
      const parseStatus = (server as any).parseClaudeStatus.bind(server)

      expect(parseStatus('')).toBeNull()
      expect(parseStatus('\n\n')).toBeNull()
    })

    it('handles status line without branch', async () => {
      createServer({ leadSessionName: 'main' })
      const parseStatus = (server as any).parseClaudeStatus.bind(server)

      const output = '  project  Opus 4.6  [████] 25%\n'
      const result = parseStatus(output)

      expect(result).toBeDefined()
      expect(result.model).toBe('Opus 4.6')
      expect(result.contextPercent).toBe('25%')
    })

    it('handles multi-line output and finds status on any line', async () => {
      createServer({ leadSessionName: 'main' })
      const parseStatus = (server as any).parseClaudeStatus.bind(server)

      const output = 'some output\nother stuff\n  app  Sonnet 4.6  [██████] 50%  ⌞ main\n'
      const result = parseStatus(output)

      expect(result).toBeDefined()
      expect(result.model).toBe('Sonnet 4.6')
      expect(result.contextPercent).toBe('50%')
    })
  })

  describe('handleSendKeysNotification', () => {
    it('extracts agent name from send-keys args and emits teammate-renamed', async () => {
      createServer({ leadSessionName: 'main' })

      // Discover a pane first
      mockExec.mockResolvedValue({
        stdout: '%1|1234|worker|/dev/ttys001|main\n',
        stderr: ''
      })
      await server.discoverPanes()

      const renamed: { paneId: string; name: string }[] = []
      server.on('teammate-renamed', (data: { paneId: string; name: string }) => renamed.push(data))

      // Simulate send-keys notification with --agent-name via the server's notification handler
      await server.start()
      await sendNotification(socketPath, {
        event: 'tmux-command',
        command: 'send-keys',
        args: ['-t', '%1', 'claude --agent-name researcher', 'Enter'],
        exitCode: 0
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(renamed).toHaveLength(1)
      expect(renamed[0]).toMatchObject({ paneId: '%1', name: 'researcher' })
    })

    it('does not emit when no --agent-name in send-keys args', async () => {
      createServer({ leadSessionName: 'main' })
      await server.start()

      const renamed: unknown[] = []
      server.on('teammate-renamed', (data: unknown) => renamed.push(data))

      await sendNotification(socketPath, {
        event: 'tmux-command',
        command: 'send-keys',
        args: ['-t', '%1', 'ls -la', 'Enter'],
        exitCode: 0
      })

      await new Promise((resolve) => setTimeout(resolve, 100))
      expect(renamed).toHaveLength(0)
    })
  })

  describe('new-session captures session name', () => {
    it('captures lead session name from new-session -s flag', async () => {
      createServer() // No leadSessionName initially
      await server.start()

      // After new-session with -s, discovery should use that session name
      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (args.includes('list-panes')) {
          return { stdout: '%1|1234|worker|/dev/ttys001|my-session\n', stderr: '' }
        }
        return { stdout: '', stderr: '' }
      })

      const detected = waitForEvent<ProxyPaneInfo>(server, 'teammate-detected')

      await sendNotification(socketPath, {
        event: 'tmux-command',
        command: 'new-session',
        args: ['-d', '-s', 'my-session', '-x', '80', '-y', '24'],
        exitCode: 0
      })

      // new-session is a pane-mutating command, so discoverPanes should be called
      // and it should now use 'my-session' as the session filter
      const info = await detected
      expect(info.sessionName).toBe('my-session')
    })
  })

  describe('resizePane', () => {
    it('calls tmux resize-window with correct args', async () => {
      createServer()
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.resizePane('%1', 120, 40)

      expect(mockExec).toHaveBeenCalledWith('/usr/bin/tmux', [
        'resize-pane',
        '-t',
        '%1',
        '-x',
        '120',
        '-y',
        '40'
      ])
    })

    it('does not throw when resize fails', async () => {
      createServer()
      mockExec.mockRejectedValue(new Error('resize failed'))

      await expect(server.resizePane('%1', 120, 40)).resolves.not.toThrow()
    })
  })

  describe('tmuxSocketName argument forwarding', () => {
    it('prepends -L socketName to all tmux commands', async () => {
      server = new TmuxProxyServer(socketPath, '/usr/bin/tmux', {
        execCommand: mockExec,
        leadPaneId: '%0',
        leadSessionName: 'main',
        pollIntervalMs: 0,
        tmuxSocketName: 'hivemind-test'
      })

      mockExec.mockResolvedValue({ stdout: '', stderr: '' })
      await server.discoverPanes()

      expect(mockExec).toHaveBeenCalledWith(
        '/usr/bin/tmux',
        expect.arrayContaining(['-L', 'hivemind-test', 'list-panes'])
      )
    })
  })

  describe('startPaneStreaming', () => {
    it('calls pipe-pane to start streaming output', async () => {
      createServer({ leadSessionName: 'main' })
      mockExec.mockResolvedValue({ stdout: '', stderr: '' })

      await server.startPaneStreaming('%1')

      // pipe-pane call should be present
      const pipePaneCalls = mockExec.mock.calls.filter(
        ([, args]) => Array.isArray(args) && args.includes('pipe-pane')
      )
      expect(pipePaneCalls.length).toBeGreaterThanOrEqual(1)
      expect(pipePaneCalls[0][1]).toContain('-t')
      expect(pipePaneCalls[0][1]).toContain('%1')
    })

    it('falls back to capture-pane polling when pipe-pane fails', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockImplementation(async (_cmd: string, args: string[]) => {
        if (Array.isArray(args) && args.includes('pipe-pane')) {
          throw new Error('pipe-pane not supported')
        }
        return { stdout: '', stderr: '' }
      })

      await server.startPaneStreaming('%1')

      // Should not throw, and should set up capture-pane polling instead
      // Wait for at least one capture-pane poll
      await new Promise((resolve) => setTimeout(resolve, 600))

      const captureInvocations = mockExec.mock.calls.filter(
        ([, args]) => Array.isArray(args) && args.includes('capture-pane')
      )
      expect(captureInvocations.length).toBeGreaterThanOrEqual(1)
    })
  })

  describe('stop cleanup', () => {
    it('clears known panes on stop', async () => {
      createServer({ leadSessionName: 'main' })

      mockExec.mockResolvedValue({
        stdout: '%1|1234|worker|/dev/ttys001|main\n',
        stderr: ''
      })
      await server.discoverPanes()

      expect(server.getKnownPanes().size).toBe(1)

      await server.stop()

      expect(server.getKnownPanes().size).toBe(0)
    })

    it('can be called multiple times safely', async () => {
      createServer()
      await server.start()

      await server.stop()
      await expect(server.stop()).resolves.not.toThrow()
    })
  })
})
