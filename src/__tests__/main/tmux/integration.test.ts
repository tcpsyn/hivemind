import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import * as net from 'net'
import * as crypto from 'crypto'
import * as path from 'path'
import * as os from 'os'
import * as fs from 'fs'
import { FakeTmuxServer } from '../../../main/tmux/FakeTmuxServer'
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

describe('Integration: multiple teammate spawning flow', () => {
  let server: FakeTmuxServer
  let socketPath: string

  beforeEach(async () => {
    socketPath = path.join(os.tmpdir(), `cc-multi-${Date.now()}.sock`)
    server = new FakeTmuxServer(socketPath)
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('spawns multiple teammates sequentially', async () => {
    await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'team' }))

    const paneIds: string[] = []
    for (const name of ['researcher', 'coder', 'reviewer']) {
      const res = await sendRequest(socketPath, makeRequest('new-window', { t: 'team', n: name }))
      expect(res.exitCode).toBe(0)
      paneIds.push(res.stdout.trim())
    }

    // All pane IDs should be unique
    expect(new Set(paneIds).size).toBe(3)

    // Send-keys to each (would spawn teammates in real flow)
    const sendKeysSpy = vi.fn()
    server.on('send-keys', sendKeysSpy)

    for (let i = 0; i < paneIds.length; i++) {
      const names = ['researcher', 'coder', 'reviewer']
      await sendRequest(socketPath, {
        ...makeRequest('send-keys', { t: paneIds[i] }),
        rawArgs: [`claude --agent-id ${names[i]}@team`, 'Enter']
      })
    }

    expect(sendKeysSpy).toHaveBeenCalledTimes(3)
  })

  it('kill-session removes all panes', async () => {
    await sendRequest(socketPath, makeRequest('new-session', { d: true, s: 'team' }))
    await sendRequest(socketPath, makeRequest('new-window', { t: 'team', n: 'a' }))
    await sendRequest(socketPath, makeRequest('new-window', { t: 'team', n: 'b' }))

    const killedSpy = vi.fn()
    server.on('session-killed', killedSpy)

    const res = await sendRequest(socketPath, makeRequest('kill-session', { t: 'team' }))
    expect(res.exitCode).toBe(0)
    expect(killedSpy).toHaveBeenCalledTimes(1)

    const [, paneIds] = killedSpy.mock.calls[0]
    expect(paneIds.length).toBe(3) // session pane + 2 windows
  })
})

describe('Integration: error handling', () => {
  let server: FakeTmuxServer
  let socketPath: string

  beforeEach(async () => {
    socketPath = path.join(os.tmpdir(), `cc-err-${Date.now()}.sock`)
    server = new FakeTmuxServer(socketPath)
    await server.start()
  })

  afterEach(async () => {
    await server.stop()
  })

  it('handles malformed JSON gracefully', async () => {
    // Send garbage to the socket — server should not crash
    await new Promise<void>((resolve) => {
      const client = net.createConnection(socketPath, () => {
        client.write('this is not json\n')
        client.write('{"also": "incomplete\n')
        // Send a valid request after garbage
        const req = makeRequest('list-sessions')
        client.write(JSON.stringify(req) + '\n')

        let buffer = ''
        client.on('data', (data) => {
          buffer += data.toString()
          if (buffer.includes('\n')) {
            client.destroy()
            const response = JSON.parse(buffer.split('\n')[0])
            expect(response.exitCode).toBe(0)
            resolve()
          }
        })
      })
    })
  })

  it('returns error for send-keys to nonexistent pane', async () => {
    const res = await sendRequest(socketPath, {
      ...makeRequest('send-keys', { t: '%999' }),
      rawArgs: ['echo hello', 'Enter']
    })
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('pane not found')
  })

  it('returns error for operations on nonexistent session', async () => {
    const res = await sendRequest(
      socketPath,
      makeRequest('new-window', { t: 'nonexistent', n: 'worker' })
    )
    expect(res.exitCode).toBe(1)
    expect(res.stderr).toContain('session not found')
  })

  it('handles unknown commands gracefully', async () => {
    const res = await sendRequest(socketPath, makeRequest('wait-for', { t: 'something' }))
    expect(res.exitCode).toBe(0)
  })
})

describe('Integration: socket cleanup', () => {
  it('cleans up stale socket on server start', async () => {
    const socketPath = path.join(os.tmpdir(), `cc-stale-${Date.now()}.sock`)

    // Create a stale socket file
    fs.writeFileSync(socketPath, '')
    expect(fs.existsSync(socketPath)).toBe(true)

    // Start server — should clean up the stale socket and bind successfully
    const server = new FakeTmuxServer(socketPath)
    await server.start()

    // Verify server works
    const res = await sendRequest(socketPath, makeRequest('list-sessions'))
    expect(res.exitCode).toBe(0)

    await server.stop()
    expect(fs.existsSync(socketPath)).toBe(false)
  })

  it('removes socket on server stop', async () => {
    const socketPath = path.join(os.tmpdir(), `cc-cleanup-${Date.now()}.sock`)
    const server = new FakeTmuxServer(socketPath)
    await server.start()
    expect(fs.existsSync(socketPath)).toBe(true)

    await server.stop()
    expect(fs.existsSync(socketPath)).toBe(false)
  })

  it('stop is idempotent', async () => {
    const socketPath = path.join(os.tmpdir(), `cc-idem-${Date.now()}.sock`)
    const server = new FakeTmuxServer(socketPath)
    await server.start()

    await server.stop()
    await server.stop() // should not throw
    expect(fs.existsSync(socketPath)).toBe(false)
  })
})
