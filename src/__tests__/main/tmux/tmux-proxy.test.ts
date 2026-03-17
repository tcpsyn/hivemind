import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createServer } from 'net'
import { spawn } from 'child_process'
import { join } from 'path'
import { unlinkSync, writeFileSync, readFileSync, mkdirSync, chmodSync, rmSync } from 'fs'
import { randomBytes } from 'crypto'

const PROXY_PATH = join(__dirname, '..', '..', '..', '..', 'bin', 'tmux')
const MOCK_DIR = `/tmp/cc-mock-${process.pid}`
const MOCK_TMUX = join(MOCK_DIR, 'mock')
const MOCK_ARGS_FILE = join(MOCK_DIR, 'args.txt')

// Short socket paths to stay under macOS 104-byte limit
function shortSocketPath(): string {
  const id = randomBytes(4).toString('hex')
  return `/tmp/cc-t-${id}.sock`
}

function createMockTmux(exitCode = 0, stdout = ''): void {
  mkdirSync(MOCK_DIR, { recursive: true })
  const script = `#!/bin/bash
${stdout ? `echo "${stdout}"` : ''}
echo "$@" > "${MOCK_ARGS_FILE}"
exit ${exitCode}
`
  writeFileSync(MOCK_TMUX, script)
  chmodSync(MOCK_TMUX, 0o755)
}

function spawnProxy(
  args: string[],
  env: Record<string, string | undefined> = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn('/bin/bash', [PROXY_PATH, ...args], {
      env: {
        PATH: process.env.PATH,
        REAL_TMUX: MOCK_TMUX,
        ...env
      }
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (d) => (stdout += d.toString()))
    child.stderr.on('data', (d) => (stderr += d.toString()))
    child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }))
  })
}

describe('tmux proxy wrapper', () => {
  beforeEach(() => {
    createMockTmux(0, 'mock-output')
  })

  afterEach(() => {
    try {
      rmSync(MOCK_DIR, { recursive: true, force: true })
    } catch {
      // ignore
    }
  })

  it('forwards args to real tmux', async () => {
    const result = await spawnProxy(['new-window', '-t', 'main', '-n', 'worker'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('mock-output')

    const lastArgs = readFileSync(MOCK_ARGS_FILE, 'utf-8').trim()
    expect(lastArgs).toBe('new-window -t main -n worker')
  })

  it('passes through real tmux exit code', async () => {
    createMockTmux(1)
    const result = await spawnProxy(['has-session', '-t', 'nonexistent'])
    expect(result.exitCode).toBe(1)
  })

  it('sends notification for new-window', async () => {
    const socketPath = shortSocketPath()
    const received: string[] = []

    const server = createServer((conn) => {
      conn.on('data', (data) => {
        received.push(data.toString().trim())
      })
    })

    await new Promise<void>((resolve) => server.listen(socketPath, resolve))

    try {
      await spawnProxy(['new-window', '-t', 'main', '-n', 'worker'], {
        CC_FRONTEND_SOCKET: socketPath
      })

      // Wait for background notification to arrive
      await new Promise((r) => setTimeout(r, 2000))

      expect(received.length).toBeGreaterThan(0)
      const notification = JSON.parse(received[0])
      expect(notification.event).toBe('tmux-command')
      expect(notification.command).toBe('new-window')
      expect(notification.args).toContain('new-window')
      expect(notification.args).toContain('-t')
      expect(notification.args).toContain('main')
      expect(notification.args).toContain('-n')
      expect(notification.args).toContain('worker')
      expect(notification.exitCode).toBe(0)
    } finally {
      server.close()
      try {
        unlinkSync(socketPath)
      } catch {
        // ignore
      }
    }
  })

  it('sends notification for send-keys', async () => {
    const socketPath = shortSocketPath()
    const received: string[] = []

    const server = createServer((conn) => {
      conn.on('data', (data) => {
        received.push(data.toString().trim())
      })
    })

    await new Promise<void>((resolve) => server.listen(socketPath, resolve))

    try {
      await spawnProxy(
        ['send-keys', '-t', '%5', 'claude --agent-id researcher@team', 'Enter'],
        { CC_FRONTEND_SOCKET: socketPath }
      )

      await new Promise((r) => setTimeout(r, 2000))

      expect(received.length).toBeGreaterThan(0)
      const notification = JSON.parse(received[0])
      expect(notification.event).toBe('tmux-command')
      expect(notification.command).toBe('send-keys')
      expect(notification.args).toContain('send-keys')
      expect(notification.args).toContain('claude --agent-id researcher@team')
    } finally {
      server.close()
      try {
        unlinkSync(socketPath)
      } catch {
        // ignore
      }
    }
  })

  it('sends notification for kill-pane', async () => {
    const socketPath = shortSocketPath()
    const received: string[] = []

    const server = createServer((conn) => {
      conn.on('data', (data) => {
        received.push(data.toString().trim())
      })
    })

    await new Promise<void>((resolve) => server.listen(socketPath, resolve))

    try {
      await spawnProxy(['kill-pane', '-t', '%3'], {
        CC_FRONTEND_SOCKET: socketPath
      })

      await new Promise((r) => setTimeout(r, 2000))

      expect(received.length).toBeGreaterThan(0)
      const notification = JSON.parse(received[0])
      expect(notification.command).toBe('kill-pane')
    } finally {
      server.close()
      try {
        unlinkSync(socketPath)
      } catch {
        // ignore
      }
    }
  })

  it('does NOT send notification for list-panes', async () => {
    const socketPath = shortSocketPath()
    const received: string[] = []

    const server = createServer((conn) => {
      conn.on('data', (data) => {
        received.push(data.toString().trim())
      })
    })

    await new Promise<void>((resolve) => server.listen(socketPath, resolve))

    try {
      await spawnProxy(['list-panes', '-t', 'main', '-F', '#{pane_id}'], {
        CC_FRONTEND_SOCKET: socketPath
      })

      await new Promise((r) => setTimeout(r, 1000))
      expect(received).toHaveLength(0)
    } finally {
      server.close()
      try {
        unlinkSync(socketPath)
      } catch {
        // ignore
      }
    }
  })

  it('handles missing socket gracefully', async () => {
    const result = await spawnProxy(['new-window', '-t', 'main'], {
      CC_FRONTEND_SOCKET: '/tmp/nonexistent.sock'
    })
    expect(result.exitCode).toBe(0)
  })

  it('handles no CC_FRONTEND_SOCKET gracefully', async () => {
    const result = await spawnProxy(['has-session', '-t', 'main'], {
      CC_FRONTEND_SOCKET: undefined
    })
    expect(result.exitCode).toBe(0)
  })

  it('finds real tmux binary when REAL_TMUX not set', async () => {
    const result = await new Promise<{
      stdout: string
      stderr: string
      exitCode: number
    }>((resolve) => {
      const child = spawn('/bin/bash', [PROXY_PATH, '-V'], {
        env: { PATH: process.env.PATH }
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => (stdout += d.toString()))
      child.stderr.on('data', (d) => (stderr += d.toString()))
      child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }))
    })
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain('tmux')
  })

  it('errors when REAL_TMUX points to nonexistent binary', async () => {
    const result = await new Promise<{
      stdout: string
      stderr: string
      exitCode: number
    }>((resolve) => {
      const child = spawn('/bin/bash', [PROXY_PATH, '-V'], {
        env: { PATH: process.env.PATH, REAL_TMUX: '/nonexistent/tmux' }
      })
      let stdout = ''
      let stderr = ''
      child.stdout.on('data', (d) => (stdout += d.toString()))
      child.stderr.on('data', (d) => (stderr += d.toString()))
      child.on('close', (code) => resolve({ stdout, stderr, exitCode: code ?? 1 }))
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('cannot find real tmux binary')
  })
})
