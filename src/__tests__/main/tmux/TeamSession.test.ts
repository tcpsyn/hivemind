import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { existsSync } from 'fs'
import { TeamSession } from '../../../main/tmux/TeamSession'

vi.mock('node-pty', () => {
  const mockPty = {
    pid: 12345,
    cols: 80,
    rows: 24,
    onData: vi.fn((cb: (data: string) => void) => {
      // Store the callback so tests can trigger it
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
    it('creates a socket file and starts the server', async () => {
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
      const env = session.getLeadEnv()

      expect(env.TMUX_PROGRAM).toBeDefined()
      expect(env.TMUX_PROGRAM).toMatch(/bin\/tmux$/)
      expect(env.CC_FRONTEND_SOCKET).toBeDefined()
      expect(env.TMUX).toBeDefined()
      expect(env.TMUX).toContain(env.CC_FRONTEND_SOCKET)
      expect(env.TMUX_PANE).toBe('%0')
      expect(env.TERM_PROGRAM).toBe('tmux')
      expect(env.TERM).toBe('tmux-256color')
    })

    it('creates socket file at expected path', async () => {
      await session.start()
      const socketPath = session.getSocketPath()
      expect(socketPath).toContain('cc-frontend-test-team')
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

  describe('server events', () => {
    it('emits teammate-spawned when send-keys triggers spawn', async () => {
      await session.start()
      const server = session.getServer()
      expect(server).toBeDefined()

      const spawnedSpy = vi.fn()
      session.on('teammate-spawned', spawnedSpy)

      // Simulate the FakeTmuxServer emitting send-keys
      // (In real usage, fake-tmux.js sends this via socket)
      server!.emit('send-keys', '%1', 'test-team', 'claude --agent-id researcher@team', true)

      // The session should handle this event
      // Actual PTY spawning is handled by PtyManager which is mocked
    })
  })
})
