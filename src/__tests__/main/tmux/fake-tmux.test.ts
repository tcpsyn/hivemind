import { describe, it, expect, afterEach } from 'vitest'
import { createServer, Server } from 'net'
import { spawn } from 'child_process'
import { join } from 'path'
import { unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { randomUUID } from 'crypto'

const FAKE_TMUX_PATH = join(__dirname, '..', '..', '..', 'main', 'tmux', 'fake-tmux.js')
const SOCKET_PATH = join(tmpdir(), `cc-test-${randomUUID()}.sock`)

function spawnFakeTmux(
  args: string[],
  env: Record<string, string> = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [FAKE_TMUX_PATH, ...args], {
      env: {
        ...process.env,
        CC_FRONTEND_SOCKET: SOCKET_PATH,
        ...env
      }
    })

    let stdout = ''
    let stderr = ''

    child.stdout.on('data', (data) => {
      stdout += data.toString()
    })

    child.stderr.on('data', (data) => {
      stderr += data.toString()
    })

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code ?? 1 })
    })
  })
}

describe('fake-tmux.js', () => {
  let server: Server | null = null

  afterEach(() => {
    if (server) {
      server.close()
      server = null
    }
    if (existsSync(SOCKET_PATH)) {
      try {
        unlinkSync(SOCKET_PATH)
      } catch {
        // ignore
      }
    }
  })

  it('returns version without needing a socket', async () => {
    const result = await spawnFakeTmux(['-V'], { CC_FRONTEND_SOCKET: '' })
    expect(result.stdout.trim()).toBe('tmux 3.4')
    expect(result.exitCode).toBe(0)
  })

  it('sends correct NDJSON and receives response', async () => {
    const received: string[] = []

    await new Promise<void>((resolve) => {
      server = createServer((conn) => {
        let buffer = ''
        conn.on('data', (data) => {
          buffer += data.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.trim()) {
              received.push(line)
              const req = JSON.parse(line)
              const response = JSON.stringify({
                id: req.id,
                exitCode: 0,
                stdout: '%1\n',
                stderr: ''
              })
              conn.write(response + '\n')
            }
          }
        })
      })
      server!.listen(SOCKET_PATH, resolve)
    })

    const result = await spawnFakeTmux(['new-window', '-t', 'main', '-n', 'researcher'])
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toBe('%1\n')

    expect(received).toHaveLength(1)
    const req = JSON.parse(received[0])
    expect(req.command).toBe('new-window')
    expect(req.args.t).toBe('main')
    expect(req.args.n).toBe('researcher')
    expect(req.id).toBeDefined()
  })

  it('exits with correct exit code from response', async () => {
    await new Promise<void>((resolve) => {
      server = createServer((conn) => {
        let buffer = ''
        conn.on('data', (data) => {
          buffer += data.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.trim()) {
              const req = JSON.parse(line)
              conn.write(
                JSON.stringify({
                  id: req.id,
                  exitCode: 1,
                  stdout: '',
                  stderr: 'session not found: main\n'
                }) + '\n'
              )
            }
          }
        })
      })
      server!.listen(SOCKET_PATH, resolve)
    })

    const result = await spawnFakeTmux(['has-session', '-t', 'main'])
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toBe('session not found: main\n')
  })

  it('handles socket connection error', async () => {
    // No server listening — socket doesn't exist
    const badSocket = join(tmpdir(), `cc-test-nonexistent-${randomUUID()}.sock`)
    const result = await spawnFakeTmux(['has-session', '-t', 'main'], {
      CC_FRONTEND_SOCKET: badSocket
    })
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain('error')
  })

  it('reads socket path from TMUX env var as fallback', async () => {
    await new Promise<void>((resolve) => {
      server = createServer((conn) => {
        let buffer = ''
        conn.on('data', (data) => {
          buffer += data.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.trim()) {
              const req = JSON.parse(line)
              conn.write(
                JSON.stringify({
                  id: req.id,
                  exitCode: 0,
                  stdout: '',
                  stderr: ''
                }) + '\n'
              )
            }
          }
        })
      })
      server!.listen(SOCKET_PATH, resolve)
    })

    const result = await spawnFakeTmux(['has-session', '-t', 'main'], {
      CC_FRONTEND_SOCKET: '',
      TMUX: `${SOCKET_PATH},12345,0`
    })
    expect(result.exitCode).toBe(0)
  })

  it('handles send-keys command correctly', async () => {
    const received: string[] = []

    await new Promise<void>((resolve) => {
      server = createServer((conn) => {
        let buffer = ''
        conn.on('data', (data) => {
          buffer += data.toString()
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (line.trim()) {
              received.push(line)
              const req = JSON.parse(line)
              conn.write(
                JSON.stringify({
                  id: req.id,
                  exitCode: 0,
                  stdout: '',
                  stderr: ''
                }) + '\n'
              )
            }
          }
        })
      })
      server!.listen(SOCKET_PATH, resolve)
    })

    const result = await spawnFakeTmux([
      'send-keys',
      '-t',
      '%1',
      'claude --agent-id researcher',
      'Enter'
    ])
    expect(result.exitCode).toBe(0)

    const req = JSON.parse(received[0])
    expect(req.command).toBe('send-keys')
    expect(req.args.t).toBe('%1')
    expect(req.rawArgs).toContain('claude --agent-id researcher')
    expect(req.rawArgs).toContain('Enter')
  })
})
