import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import * as net from 'net'
import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import * as crypto from 'crypto'
import { FakeTmuxServer } from '../../helpers/FakeTmuxServer'
import type { TmuxRequest, TmuxResponse } from '../../../shared/tmux-types'

function makeRequest(
  command: string,
  args: Record<string, string | boolean> = {},
  rawArgs: string[] = []
): TmuxRequest {
  return {
    id: crypto.randomUUID(),
    command,
    args,
    rawArgs: rawArgs.length > 0 ? rawArgs : [command]
  }
}

function sendRequest(socketPath: string, request: TmuxRequest): Promise<TmuxResponse> {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(socketPath)
    let buffer = ''

    client.on('connect', () => {
      client.write(JSON.stringify(request) + '\n')
    })

    client.on('data', (data) => {
      buffer += data.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (!line.trim()) continue
        try {
          const response = JSON.parse(line)
          if (response.id === request.id) {
            client.destroy()
            resolve(response)
            return
          }
        } catch {
          // ignore
        }
      }
    })

    client.on('error', reject)

    setTimeout(() => {
      client.destroy()
      reject(new Error('timeout'))
    }, 5000)
  })
}

describe('FakeTmuxServer', () => {
  let server: FakeTmuxServer
  let socketPath: string

  beforeEach(async () => {
    socketPath = path.join(os.tmpdir(), `cc-test-${crypto.randomUUID()}.sock`)
    server = new FakeTmuxServer(socketPath)
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
    try {
      fs.unlinkSync(socketPath)
    } catch {
      // ignore
    }
  })

  describe('new-session', () => {
    it('creates a session and returns exit code 0', async () => {
      const req = makeRequest('new-session', { d: true, s: 'main' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
      expect(res.id).toBe(req.id)
    })

    it('returns error for duplicate session name', async () => {
      const req1 = makeRequest('new-session', { d: true, s: 'main' })
      await sendRequest(socketPath, req1)

      const req2 = makeRequest('new-session', { d: true, s: 'main' })
      const res = await sendRequest(socketPath, req2)
      expect(res.exitCode).toBe(1)
      expect(res.stderr).toContain('duplicate session')
    })
  })

  describe('has-session', () => {
    it('returns exit code 0 when session exists', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))

      const req = makeRequest('has-session', { t: 'main' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
    })

    it('returns exit code 1 when session does not exist', async () => {
      const req = makeRequest('has-session', { t: 'nonexistent' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(1)
    })
  })

  describe('new-window', () => {
    it('allocates a pane ID and returns it in stdout', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))

      const req = makeRequest('new-window', { t: 'main', n: 'researcher' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
      expect(res.stdout).toMatch(/%\d+/)
    })

    it('returns error when target session does not exist', async () => {
      const req = makeRequest('new-window', { t: 'nonexistent', n: 'worker' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(1)
      expect(res.stderr).toContain('session not found')
    })

    it('allocates incrementing pane IDs', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))

      const res1 = await sendRequest(socketPath, makeRequest('new-window', { t: 'main', n: 'a' }))
      const res2 = await sendRequest(socketPath, makeRequest('new-window', { t: 'main', n: 'b' }))

      const id1 = parseInt(res1.stdout.trim().replace('%', ''))
      const id2 = parseInt(res2.stdout.trim().replace('%', ''))
      expect(id2).toBeGreaterThan(id1)
    })
  })

  describe('split-window', () => {
    it('allocates a pane ID like new-window', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))

      const req = makeRequest('split-window', { h: true, t: 'main' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
      expect(res.stdout).toMatch(/%\d+/)
    })
  })

  describe('send-keys', () => {
    it('returns exit code 0 for a valid pane', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))
      const winRes = await sendRequest(
        socketPath,
        makeRequest('new-window', { t: 'main', n: 'worker' })
      )
      const paneId = winRes.stdout.trim()

      const req = makeRequest('send-keys', { t: paneId }, [
        'claude --agent-id worker@team',
        'Enter'
      ])
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
    })

    it('returns error for nonexistent pane', async () => {
      const req = makeRequest('send-keys', { t: '%999' }, ['echo hello', 'Enter'])
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(1)
      expect(res.stderr).toContain('pane not found')
    })
  })

  describe('list-panes', () => {
    it('lists panes for a session', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))
      await sendRequest(socketPath, makeRequest('new-window', { t: 'main', n: 'a' }))
      await sendRequest(socketPath, makeRequest('new-window', { t: 'main', n: 'b' }))

      const req = makeRequest('list-panes', { t: 'main', F: '#{pane_id}' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
      const lines = res.stdout.trim().split('\n')
      // Session pane + two new-window panes
      expect(lines.length).toBeGreaterThanOrEqual(2)
      for (const line of lines) {
        expect(line).toMatch(/%\d+/)
      }
    })

    it('returns error for nonexistent session', async () => {
      const req = makeRequest('list-panes', { t: 'nope', F: '#{pane_id}' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(1)
    })
  })

  describe('list-sessions', () => {
    it('lists all sessions', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'alpha' }))
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'beta' }))

      const req = makeRequest('list-sessions')
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('alpha')
      expect(res.stdout).toContain('beta')
    })

    it('returns empty output when no sessions', async () => {
      const req = makeRequest('list-sessions')
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
      expect(res.stdout.trim()).toBe('')
    })
  })

  describe('capture-pane', () => {
    it('returns exit code 0 for a valid pane', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))
      const winRes = await sendRequest(
        socketPath,
        makeRequest('new-window', { t: 'main', n: 'worker' })
      )
      const paneId = winRes.stdout.trim()

      const req = makeRequest('capture-pane', { t: paneId, p: true })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
    })

    it('returns error for nonexistent pane', async () => {
      const req = makeRequest('capture-pane', { t: '%999', p: true })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(1)
    })
  })

  describe('display-message', () => {
    it('returns formatted pane info', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))

      const req = makeRequest('display-message', { p: true, t: 'main' }, [
        'display-message',
        '-p',
        '-t',
        'main',
        '#{session_name}'
      ])
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
      expect(res.stdout).toContain('main')
    })
  })

  describe('kill-session', () => {
    it('removes the session', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))

      const killReq = makeRequest('kill-session', { t: 'main' })
      const killRes = await sendRequest(socketPath, killReq)
      expect(killRes.exitCode).toBe(0)

      const hasReq = makeRequest('has-session', { t: 'main' })
      const hasRes = await sendRequest(socketPath, hasReq)
      expect(hasRes.exitCode).toBe(1)
    })

    it('returns error for nonexistent session', async () => {
      const req = makeRequest('kill-session', { t: 'nope' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(1)
    })
  })

  describe('kill-pane', () => {
    it('removes a pane from its session', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))
      const winRes = await sendRequest(
        socketPath,
        makeRequest('new-window', { t: 'main', n: 'worker' })
      )
      const paneId = winRes.stdout.trim()

      const killRes = await sendRequest(socketPath, makeRequest('kill-pane', { t: paneId }))
      expect(killRes.exitCode).toBe(0)

      // Pane should no longer be accessible
      const sendRes = await sendRequest(
        socketPath,
        makeRequest('send-keys', { t: paneId }, ['echo', 'Enter'])
      )
      expect(sendRes.exitCode).toBe(1)
    })

    it('returns error for nonexistent pane', async () => {
      const req = makeRequest('kill-pane', { t: '%999' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(1)
    })
  })

  describe('select-pane', () => {
    it('returns exit code 0 for a valid pane', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))
      const winRes = await sendRequest(
        socketPath,
        makeRequest('new-window', { t: 'main', n: 'worker' })
      )
      const paneId = winRes.stdout.trim()

      const req = makeRequest('select-pane', { t: paneId })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
    })

    it('returns error for nonexistent pane', async () => {
      const req = makeRequest('select-pane', { t: '%999' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(1)
    })
  })

  describe('resize-pane', () => {
    it('returns exit code 0 for a valid pane', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))
      const winRes = await sendRequest(
        socketPath,
        makeRequest('new-window', { t: 'main', n: 'worker' })
      )
      const paneId = winRes.stdout.trim()

      const req = makeRequest('resize-pane', { t: paneId, x: '120', y: '40' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
    })

    it('returns error for nonexistent pane', async () => {
      const req = makeRequest('resize-pane', { t: '%999', x: '120', y: '40' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(1)
    })
  })

  describe('unknown commands', () => {
    it('returns exit code 0 for unknown commands (graceful degradation)', async () => {
      const req = makeRequest('some-future-command', { t: 'main' })
      const res = await sendRequest(socketPath, req)
      expect(res.exitCode).toBe(0)
    })
  })

  describe('concurrent connections', () => {
    it('handles multiple simultaneous requests', async () => {
      await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'main' }))

      const promises = Array.from({ length: 5 }, (_, i) =>
        sendRequest(socketPath, makeRequest('new-window', { t: 'main', n: `worker-${i}` }))
      )

      const results = await Promise.all(promises)
      for (const res of results) {
        expect(res.exitCode).toBe(0)
        expect(res.stdout).toMatch(/%\d+/)
      }

      // All pane IDs should be unique
      const paneIds = results.map((r) => r.stdout.trim())
      const unique = new Set(paneIds)
      expect(unique.size).toBe(5)
    })
  })
})
