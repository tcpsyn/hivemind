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

    // Expose callbacks for testing
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

describe('PtyManager', () => {
  let manager: PtyManager

  beforeEach(() => {
    vi.clearAllMocks()
    manager = new PtyManager()
  })

  afterEach(() => {
    manager.destroyAll()
  })

  describe('createPty', () => {
    it('creates a PTY and returns an agent state', async () => {
      const agent = await manager.createPty(testConfig, '/tmp/test')
      expect(agent.id).toBeDefined()
      expect(agent.name).toBe('test-agent')
      expect(agent.role).toBe('Test role')
      expect(agent.status).toBe('running')
      expect(agent.pid).toBeDefined()
    })

    it('spawns node-pty with the correct command', async () => {
      await manager.createPty(testConfig, '/tmp/test')
      const nodePty = vi.mocked(await import('node-pty'))
      expect(nodePty.spawn).toHaveBeenCalledWith(
        expect.any(String),
        expect.any(Array),
        expect.objectContaining({
          cwd: '/tmp/test',
          cols: 80,
          rows: 24
        })
      )
    })

    it('assigns unique IDs to each PTY', async () => {
      const agent1 = await manager.createPty(testConfig, '/tmp')
      const agent2 = await manager.createPty({ ...testConfig, name: 'agent-2' }, '/tmp')
      expect(agent1.id).not.toBe(agent2.id)
    })
  })

  describe('sendInput', () => {
    it('writes data to the PTY', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()
      manager.sendInput(agent.id, 'hello\n')
      expect(pty.write).toHaveBeenCalledWith('hello\n')
    })

    it('throws for unknown agent ID', () => {
      expect(() => manager.sendInput('nonexistent', 'data')).toThrow()
    })
  })

  describe('resize', () => {
    it('resizes the PTY', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()
      manager.resize(agent.id, 120, 40)
      expect(pty.resize).toHaveBeenCalledWith(120, 40)
    })

    it('throws for unknown agent ID', () => {
      expect(() => manager.resize('nonexistent', 80, 24)).toThrow()
    })
  })

  describe('destroyPty', () => {
    it('kills the PTY process', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()
      manager.destroyPty(agent.id)
      expect(pty.kill).toHaveBeenCalled()
    })

    it('removes the agent from the manager', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      manager.destroyPty(agent.id)
      expect(manager.getAll().size).toBe(0)
    })

    it('does not throw for unknown agent ID', () => {
      expect(() => manager.destroyPty('nonexistent')).not.toThrow()
    })
  })

  describe('getAll', () => {
    it('returns all managed agents', async () => {
      await manager.createPty(testConfig, '/tmp')
      await manager.createPty({ ...testConfig, name: 'agent-2' }, '/tmp')
      expect(manager.getAll().size).toBe(2)
    })

    it('returns empty map when no agents', () => {
      expect(manager.getAll().size).toBe(0)
    })
  })

  describe('events', () => {
    it('emits data events from PTY output', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()
      const handler = vi.fn()
      manager.on('data', handler)

      pty._dataCallbacks.forEach((cb) => cb('some output'))
      expect(handler).toHaveBeenCalledWith(agent.id, 'some output')
    })

    it('emits exit events when PTY exits', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()
      const handler = vi.fn()
      manager.on('exit', handler)

      pty._exitCallbacks.forEach((cb) => cb({ exitCode: 0 }))
      expect(handler).toHaveBeenCalledWith(agent.id, 0)
    })

    it('updates agent status to stopped on exit', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()

      pty._exitCallbacks.forEach((cb) => cb({ exitCode: 0 }))
      const agents = manager.getAll()
      expect(agents.get(agent.id)?.status).toBe('stopped')
    })
  })

  describe('input detection', () => {
    it('emits input-needed when prompt pattern is detected', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()
      const handler = vi.fn()
      manager.on('input-needed', handler)

      pty._dataCallbacks.forEach((cb) => cb('Do you approve? (y/n)'))
      expect(handler).toHaveBeenCalledWith(agent.id)
    })

    it('sets needsInput flag on agent state', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()

      pty._dataCallbacks.forEach((cb) => cb('Continue? [Y/n]'))
      const agents = manager.getAll()
      expect(agents.get(agent.id)?.needsInput).toBe(true)
    })

    it('clears needsInput when input is sent', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()

      pty._dataCallbacks.forEach((cb) => cb('Continue? [Y/n]'))
      manager.sendInput(agent.id, 'y\n')
      const agents = manager.getAll()
      expect(agents.get(agent.id)?.needsInput).toBe(false)
    })

    it('detects multiple prompt patterns', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()
      const handler = vi.fn()
      manager.on('input-needed', handler)

      const patterns = ['❯ ', '$ ', '> ', '? ']
      for (const pattern of patterns) {
        handler.mockClear()
        pty._dataCallbacks.forEach((cb) => cb(`prompt ${pattern}`))
        expect(handler).toHaveBeenCalledWith(agent.id)
      }
    })
  })

  describe('crash recovery', () => {
    it('emits error event on unexpected exit', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()
      const handler = vi.fn()
      manager.on('error', handler)

      pty._exitCallbacks.forEach((cb) => cb({ exitCode: 1 }))
      expect(handler).toHaveBeenCalledWith(agent.id, expect.any(Error))
    })

    it('does not emit error on clean exit', async () => {
      await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()
      const handler = vi.fn()
      manager.on('error', handler)

      pty._exitCallbacks.forEach((cb) => cb({ exitCode: 0 }))
      expect(handler).not.toHaveBeenCalled()
    })

    it('allows restart after crash', async () => {
      const agent = await manager.createPty(testConfig, '/tmp')
      const pty = await getSpawnedPty()

      // Add error listener to prevent unhandled error
      manager.on('error', () => {})
      pty._exitCallbacks.forEach((cb) => cb({ exitCode: 1 }))
      expect(manager.getAll().get(agent.id)?.status).toBe('stopped')

      // Restart by creating with same name
      const restarted = await manager.createPty(testConfig, '/tmp')
      expect(restarted.status).toBe('running')
    })
  })

  describe('destroyAll', () => {
    it('kills all PTY processes', async () => {
      await manager.createPty(testConfig, '/tmp')
      await manager.createPty({ ...testConfig, name: 'agent-2' }, '/tmp')
      manager.destroyAll()
      expect(manager.getAll().size).toBe(0)
    })
  })
})
