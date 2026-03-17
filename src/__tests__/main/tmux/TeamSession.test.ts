import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync } from 'fs'
import { TeamSession } from '../../../main/tmux/TeamSession'

vi.mock('node-pty', () => {
  const mockPty = {
    pid: 12345,
    cols: 80,
    rows: 24,
    onData: vi.fn((cb: (data: string) => void) => {
      mockPty._dataCallback = cb
      return { dispose: vi.fn() }
    }),
    onExit: vi.fn((cb: (e: { exitCode: number; signal?: number }) => void) => {
      mockPty._exitCallback = cb
      return { dispose: vi.fn() }
    }),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn(),
    _dataCallback: null as ((data: string) => void) | null,
    _exitCallback: null as ((e: { exitCode: number; signal?: number }) => void) | null
  }

  return {
    spawn: vi.fn(() => mockPty),
    default: { spawn: vi.fn(() => mockPty) }
  }
})

describe('TeamSession', () => {
  let session: TeamSession

  beforeEach(() => {
    session = new TeamSession('test-team', '/tmp/test-project')
  })

  afterEach(async () => {
    try {
      await session.stop()
    } catch {
      // may already be stopped
    }
  })

  describe('start', () => {
    it('creates a socket file and starts the proxy server', async () => {
      const leadAgent = await session.start()
      expect(leadAgent).toBeDefined()
      expect(leadAgent.id).toBeDefined()
      expect(leadAgent.name).toBe('team-lead')
      expect(session.isRunning()).toBe(true)
    })

    it('returns a lead agent with correct properties', async () => {
      const lead = await session.start()
      expect(lead.status).toBe('running')
      expect(lead.isTeammate).toBeFalsy()
    })

    it('sets correct environment variables for lead', async () => {
      await session.start()

      // Test without tmuxEnvValue (called standalone)
      const envNoTmux = session.getLeadEnv()
      expect(envNoTmux.PATH).toContain('bin')
      expect(envNoTmux.CC_FRONTEND_SOCKET).toBeDefined()
      expect(envNoTmux.CC_FRONTEND_SOCKET).toContain('hivemind-test-team')
      expect(envNoTmux.REAL_TMUX).toBeDefined()
      expect(envNoTmux.REAL_TMUX).toContain('tmux')
      expect(envNoTmux.TMUX).toBeUndefined()
      expect(envNoTmux.TMUX_PANE).toBeUndefined()
      expect(envNoTmux.CC_TMUX_SOCKET).toBeDefined()
      expect(envNoTmux.CC_TMUX_SOCKET).toContain('hivemind-test-team')

      // Test with tmuxEnvValue (as called during start)
      const envWithTmux = session.getLeadEnv('/tmp/tmux-501/socket,12345,0')
      expect(envWithTmux.TMUX).toBe('/tmp/tmux-501/socket,12345,0')
      expect(envWithTmux.TMUX_PANE).toBe('%0')
    })

    it('creates socket file at expected path', async () => {
      await session.start()
      const socketPath = session.getSocketPath()
      expect(socketPath).toContain('hivemind-test-team')
      expect(existsSync(socketPath)).toBe(true)
    })
  })

  describe('stop', () => {
    it('cleans up socket file', async () => {
      await session.start()
      const socketPath = session.getSocketPath()
      expect(existsSync(socketPath)).toBe(true)

      await session.stop()
      expect(existsSync(socketPath)).toBe(false)
      expect(session.isRunning()).toBe(false)
    })

    it('is safe to call multiple times', async () => {
      await session.start()
      await session.stop()
      await session.stop() // should not throw
      expect(session.isRunning()).toBe(false)
    })
  })

  describe('getLeadAgent', () => {
    it('returns null before start', () => {
      expect(session.getLeadAgent()).toBeNull()
    })

    it('returns lead agent after start', async () => {
      const lead = await session.start()
      expect(session.getLeadAgent()).toEqual(lead)
    })
  })

  describe('getTeammates', () => {
    it('returns empty array initially', async () => {
      await session.start()
      expect(session.getTeammates()).toEqual([])
    })
  })

  describe('proxy server events', () => {
    it('emits teammate-spawned when proxy detects a new pane', async () => {
      await session.start()
      const server = session.getServer()
      expect(server).toBeDefined()

      const spawnedSpy = vi.fn()
      session.on('teammate-spawned', spawnedSpy)

      // Simulate TmuxProxyServer detecting a new teammate pane
      server!.emit('teammate-detected', {
        paneId: '%1',
        pid: 99999,
        windowName: 'researcher',
        tty: '/dev/ttys001',
        sessionName: 'test-team'
      })

      expect(spawnedSpy).toHaveBeenCalledTimes(1)
      const [agentId, agent, paneId, sessionName] = spawnedSpy.mock.calls[0]
      expect(agentId).toBe('tmux-%1')
      expect(agent.name).toBe('researcher')
      expect(agent.isTeammate).toBe(true)
      expect(paneId).toBe('%1')
      expect(sessionName).toBe('test-team')
    })

    it('emits teammate-output when proxy receives pane output', async () => {
      await session.start()
      const server = session.getServer()

      const outputSpy = vi.fn()
      session.on('teammate-output', outputSpy)

      server!.emit('teammate-output', { paneId: '%1', data: Buffer.from('hello world') })

      expect(outputSpy).toHaveBeenCalledWith('%1', 'hello world')
    })

    it('emits teammate-exited when proxy detects pane removal', async () => {
      await session.start()
      const server = session.getServer()

      // First detect a pane
      server!.emit('teammate-detected', {
        paneId: '%2',
        pid: 88888,
        windowName: 'coder',
        tty: '/dev/ttys002',
        sessionName: 'test-team'
      })

      const exitedSpy = vi.fn()
      session.on('teammate-exited', exitedSpy)

      // Then simulate it exiting
      server!.emit('teammate-exited', { paneId: '%2' })

      expect(exitedSpy).toHaveBeenCalledTimes(1)
      const [agentId, paneId, sessionName, exitCode] = exitedSpy.mock.calls[0]
      expect(agentId).toBe('tmux-%2')
      expect(paneId).toBe('%2')
      expect(sessionName).toBe('test-team')
      expect(exitCode).toBe(0)
    })

    it('tracks teammates in getTeammates()', async () => {
      await session.start()
      const server = session.getServer()

      server!.emit('teammate-detected', {
        paneId: '%1',
        pid: 11111,
        windowName: 'researcher',
        tty: '',
        sessionName: 'test-team'
      })
      server!.emit('teammate-detected', {
        paneId: '%2',
        pid: 22222,
        windowName: 'coder',
        tty: '',
        sessionName: 'test-team'
      })

      const teammates = session.getTeammates()
      expect(teammates).toHaveLength(2)
      expect(teammates.map((t) => t.name).sort()).toEqual(['coder', 'researcher'])
    })
  })

  describe('sendTeammateInput', () => {
    it('throws when session is not running', async () => {
      await expect(session.sendTeammateInput('%1', 'test')).rejects.toThrow('not running')
    })
  })

  describe('findRealTmux', () => {
    it('finds tmux on the system', () => {
      const path = TeamSession.findRealTmux()
      expect(path).toContain('tmux')
    })
  })
})
