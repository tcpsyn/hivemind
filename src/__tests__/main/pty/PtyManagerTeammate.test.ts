import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'events'
import { PtyManager } from '../../../main/pty/PtyManager'
import type { AgentConfig } from '../../../shared/types'

// Mock node-pty
vi.mock('node-pty', () => ({
  spawn: vi.fn(() => {
    const pty = new EventEmitter() as EventEmitter & {
      pid: number
      cols: number
      rows: number
      write: ReturnType<typeof vi.fn>
      resize: ReturnType<typeof vi.fn>
      kill: ReturnType<typeof vi.fn>
      onData: ReturnType<typeof vi.fn>
      onExit: ReturnType<typeof vi.fn>
    }

    pty.pid = Math.floor(Math.random() * 10000)
    pty.cols = 80
    pty.rows = 24
    pty.write = vi.fn()
    pty.resize = vi.fn()
    pty.kill = vi.fn()

    const dataCallbacks: ((data: string) => void)[] = []
    const exitCallbacks: ((e: { exitCode: number; signal?: number }) => void)[] = []

    pty.onData = vi.fn((cb: (data: string) => void) => {
      dataCallbacks.push(cb)
      return { dispose: vi.fn() }
    })
    pty.onExit = vi.fn((cb: (e: { exitCode: number; signal?: number }) => void) => {
      exitCallbacks.push(cb)
      return { dispose: vi.fn() }
    })

    ;(pty as Record<string, unknown>)._dataCallbacks = dataCallbacks
    ;(pty as Record<string, unknown>)._exitCallbacks = exitCallbacks

    return pty
  })
}))

async function getSpawnedPty() {
  const nodePty = vi.mocked(await import('node-pty'))
  const lastCall = nodePty.spawn.mock.results.at(-1)
  return lastCall?.value as ReturnType<typeof nodePty.spawn> & {
    _dataCallbacks: ((data: string) => void)[]
    _exitCallbacks: ((e: { exitCode: number; signal?: number }) => void)[]
  }
}

const testConfig: AgentConfig = {
  name: 'test-agent',
  role: 'Test role',
  command: 'claude --team test --role tester'
}

describe('PtyManager teammate extensions', () => {
  let manager: PtyManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new PtyManager()
  })

  afterEach(() => {
    manager.destroyAll()
  })

  describe('createTeammatePty', () => {
    const teammateCommand =
      'claude --agent-id researcher@team --agent-name researcher --agent-color blue --agent-type Explore --team-name myteam'

    it('spawns PTY and returns agent state with isTeammate=true', async () => {
      const agent = await manager.createTeammatePty(
        teammateCommand,
        '/tmp',
        {},
        'myteam',
        '%1'
      )
      expect(agent.isTeammate).toBe(true)
      expect(agent.paneId).toBe('%1')
      expect(agent.sessionName).toBe('myteam')
      expect(agent.status).toBe('running')
      expect(agent.name).toBe('researcher')
      expect(agent.color).toBe('blue')
      expect(agent.agentType).toBe('Explore')
    })

    it('registers pane ID mapping', async () => {
      const agent = await manager.createTeammatePty(
        teammateCommand,
        '/tmp',
        {},
        'myteam',
        '%1'
      )
      const found = manager.getAgentByPaneId('%1')
      expect(found).toBeDefined()
      expect(found?.id).toBe(agent.id)
    })

    it('emits agent-spawned event', async () => {
      const handler = vi.fn()
      manager.on('agent-spawned', handler)

      const agent = await manager.createTeammatePty(
        teammateCommand,
        '/tmp',
        {},
        'myteam',
        '%1'
      )

      expect(handler).toHaveBeenCalledWith(agent.id, agent, '%1', 'myteam')
    })

    it('spawns PTY via shell login with -l -c flags', async () => {
      await manager.createTeammatePty(teammateCommand, '/tmp/project', {}, 'myteam', '%1')
      const nodePty = vi.mocked(await import('node-pty'))
      expect(nodePty.spawn).toHaveBeenCalledWith(
        expect.any(String),
        ['-l', '-c', teammateCommand],
        expect.objectContaining({
          cwd: '/tmp/project'
        })
      )
    })

    it('wires PTY output to output buffer', async () => {
      const agent = await manager.createTeammatePty(
        teammateCommand,
        '/tmp',
        {},
        'myteam',
        '%1'
      )
      const pty = await getSpawnedPty()

      pty._dataCallbacks.forEach((cb) => cb('hello output'))
      const captured = manager.capturePane(agent.id)
      expect(captured).toBe('hello output')
    })

    it('uses fallback name when no agent-name flag present', async () => {
      const agent = await manager.createTeammatePty(
        'claude --agent-id test@team',
        '/tmp',
        {},
        'myteam',
        '%2'
      )
      expect(agent.name).toBe('teammate')
    })
  })

  describe('registerPane', () => {
    it('maps pane ID to existing agent', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      manager.registerPane('%0', agent.id)
      const found = manager.getAgentByPaneId('%0')
      expect(found?.id).toBe(agent.id)
    })
  })

  describe('getAgentByPaneId', () => {
    it('returns correct agent', async () => {
      const agent = await manager.createTeammatePty(
        'claude --agent-name worker --agent-color red',
        '/tmp',
        {},
        'team1',
        '%3'
      )
      const found = manager.getAgentByPaneId('%3')
      expect(found?.id).toBe(agent.id)
    })

    it('returns undefined for unknown pane ID', () => {
      expect(manager.getAgentByPaneId('%99')).toBeUndefined()
    })
  })

  describe('capturePane', () => {
    it('returns buffered output', async () => {
      const agent = await manager.createTeammatePty(
        'claude --agent-name worker',
        '/tmp',
        {},
        'team1',
        '%1'
      )
      const pty = await getSpawnedPty()

      pty._dataCallbacks.forEach((cb) => cb('line 1\nline 2'))
      expect(manager.capturePane(agent.id)).toBe('line 1\nline 2')
    })

    it('returns empty string for unknown agent', () => {
      expect(manager.capturePane('nonexistent')).toBe('')
    })
  })

  describe('getPaneInfo', () => {
    it('returns correct metadata', async () => {
      const agent = await manager.createTeammatePty(
        'claude --agent-name researcher --agent-color blue',
        '/tmp',
        {},
        'team1',
        '%1'
      )
      const info = manager.getPaneInfo(agent.id)
      expect(info).not.toBeNull()
      expect(info!.paneId).toBe('%1')
      expect(info!.cols).toBe(80)
      expect(info!.rows).toBe(24)
      expect(info!.name).toBe('researcher')
      expect(info!.isActive).toBe(true)
      expect(info!.pid).toBeDefined()
    })

    it('returns null for unknown agent', () => {
      expect(manager.getPaneInfo('nonexistent')).toBeNull()
    })
  })

  describe('output buffer on regular createPty', () => {
    it('wires output to buffer automatically', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()

      pty._dataCallbacks.forEach((cb) => cb('regular output'))
      expect(manager.capturePane(agent.id)).toBe('regular output')
    })
  })

  describe('destroyPty cleans up teammate state', () => {
    it('cleans up pane ID mappings on destroy', async () => {
      const agent = await manager.createTeammatePty(
        'claude --agent-name worker',
        '/tmp',
        {},
        'team1',
        '%1'
      )
      manager.destroyPty(agent.id)
      expect(manager.getAgentByPaneId('%1')).toBeUndefined()
    })
  })
})
