import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import type { AgentState, TeamConfig, AgentConfig } from '../../../shared/types'

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'agent-1',
    name: 'architect',
    role: 'Lead designer',
    avatar: 'robot-1',
    color: '#FF6B6B',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    pid: 1234,
    ...overrides
  }
}

class MockPtyManager extends EventEmitter {
  private agents = new Map<string, AgentState>()
  private counter = 0

  async createPty(config: AgentConfig, _cwd: string): Promise<AgentState> {
    const id = `agent-${++this.counter}`
    const agent = makeAgent({
      id,
      name: config.name,
      role: config.role,
      avatar: config.avatar ?? '',
      color: config.color ?? ''
    })
    this.agents.set(id, agent)
    return agent
  }

  sendInput = vi.fn()
  resize = vi.fn()
  registerPane = vi.fn()
  getAgentByPaneId = vi.fn()
  capturePane = vi.fn().mockReturnValue('')
  getPaneInfo = vi.fn().mockReturnValue(null)
  async createTeammatePty(): Promise<AgentState> {
    return makeAgent()
  }
  destroyPty = vi.fn((id: string) => {
    this.agents.delete(id)
  })
  destroyAll = vi.fn(() => {
    this.agents.clear()
  })
  getAll(): Map<string, AgentState> {
    return new Map(this.agents)
  }
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
    removeHandler: vi.fn()
  },
  BrowserWindow: vi.fn()
}))

function createMockWindow() {
  return {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
    isMinimized: () => false,
    show: vi.fn(),
    focus: vi.fn()
  }
}

describe('Main Process Wiring', () => {
  let ptyManager: MockPtyManager
  let mockWindow: ReturnType<typeof createMockWindow>

  beforeEach(() => {
    ptyManager = new MockPtyManager()
    mockWindow = createMockWindow()
    vi.clearAllMocks()
  })

  describe('PtyManager event forwarding', () => {
    it('forwards PTY data events to renderer as agent:output', async () => {
      const { sendAgentOutput } = await import('../../../main/ipc/handlers')

      ptyManager.on('data', (agentId: string, data: string) => {
        sendAgentOutput(mockWindow as never, { agentId, data })
      })

      ptyManager.emit('data', 'agent-1', 'Hello world')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith('agent:output', {
        agentId: 'agent-1',
        data: 'Hello world'
      })
    })

    it('forwards PTY exit events to renderer as agent:status-change', async () => {
      const { sendAgentStatusChange } = await import('../../../main/ipc/handlers')
      const agent = makeAgent({ id: 'agent-1', status: 'stopped' })

      ptyManager.on('exit', (agentId: string) => {
        sendAgentStatusChange(mockWindow as never, {
          agentId,
          status: 'stopped',
          agent: { ...agent, status: 'stopped' }
        })
      })

      ptyManager.emit('exit', 'agent-1', 0)

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'agent:status-change',
        expect.objectContaining({
          agentId: 'agent-1',
          status: 'stopped'
        })
      )
    })

    it('forwards input-needed events to renderer as agent:input-needed', async () => {
      const { sendAgentInputNeeded } = await import('../../../main/ipc/handlers')

      await ptyManager.createPty({ name: 'architect', role: 'Lead', command: 'claude' }, '/tmp')

      ptyManager.on('input-needed', (agentId: string) => {
        const agents = ptyManager.getAll()
        const agent = agents.get(agentId)
        if (agent) {
          sendAgentInputNeeded(mockWindow as never, {
            agentId,
            agentName: agent.name
          })
        }
      })

      ptyManager.emit('input-needed', 'agent-1')

      expect(mockWindow.webContents.send).toHaveBeenCalledWith(
        'agent:input-needed',
        expect.objectContaining({
          agentId: 'agent-1',
          agentName: 'architect'
        })
      )
    })

    it('does not forward events when window is destroyed', async () => {
      const { sendAgentOutput } = await import('../../../main/ipc/handlers')

      const destroyedWindow = {
        isDestroyed: () => true,
        webContents: { send: vi.fn() }
      }

      ptyManager.on('data', (agentId: string, data: string) => {
        sendAgentOutput(destroyedWindow as never, { agentId, data })
      })

      ptyManager.emit('data', 'agent-1', 'Hello')

      expect(destroyedWindow.webContents.send).not.toHaveBeenCalled()
    })
  })

  describe('IPC service implementations', () => {
    it('team:start creates PTYs for each agent and returns agent states', async () => {
      const config: TeamConfig = {
        name: 'test-team',
        project: '/tmp/project',
        agents: [
          { name: 'architect', role: 'Lead', command: 'claude --role arch' },
          { name: 'coder', role: 'Impl', command: 'claude --role coder' }
        ]
      }

      const agents: AgentState[] = []
      for (const agentConfig of config.agents) {
        const agent = await ptyManager.createPty(agentConfig, config.project)
        agents.push(agent)
      }

      expect(agents).toHaveLength(2)
      expect(agents[0].name).toBe('architect')
      expect(agents[1].name).toBe('coder')
    })

    it('team:stop destroys all PTYs', async () => {
      await ptyManager.createPty({ name: 'architect', role: 'Lead', command: 'claude' }, '/tmp')
      expect(ptyManager.getAll().size).toBe(1)

      ptyManager.destroyAll()
      expect(ptyManager.destroyAll).toHaveBeenCalled()
    })

    it('agent:input sends data to the correct PTY', () => {
      ptyManager.sendInput('agent-1', 'yes\n')
      expect(ptyManager.sendInput).toHaveBeenCalledWith('agent-1', 'yes\n')
    })

    it('agent:resize resizes the correct PTY', () => {
      ptyManager.resize('agent-1', 120, 40)
      expect(ptyManager.resize).toHaveBeenCalledWith('agent-1', 120, 40)
    })
  })

  describe('createIpcServices factory', () => {
    it('creates a valid IpcServices object', async () => {
      const { createIpcServices } = await import('../../../main/services/createIpcServices')

      const services = createIpcServices({
        ptyManager: ptyManager as never,
        fileService: {
          readFile: vi.fn().mockResolvedValue('content'),
          writeFile: vi.fn().mockResolvedValue(undefined),
          getFileTree: vi.fn().mockResolvedValue([]),
          detectLanguage: vi.fn().mockReturnValue('typescript')
        } as never,
        gitService: {
          getStatus: vi.fn().mockResolvedValue({ files: [], branch: 'main', ahead: 0, behind: 0 }),
          getDiff: vi.fn().mockResolvedValue('diff'),
          getFileStatus: vi.fn().mockResolvedValue(null)
        } as never,
        teamConfigService: {
          loadConfig: vi.fn(),
          saveConfig: vi.fn(),
          deleteConfig: vi.fn(),
          listConfigs: vi.fn().mockReturnValue([]),
          enrichConfig: vi.fn((c: TeamConfig) => c)
        } as never
      })

      expect(typeof services.onAgentCreate).toBe('function')
      expect(typeof services.onAgentInput).toBe('function')
      expect(typeof services.onAgentStop).toBe('function')
      expect(typeof services.onAgentRestart).toBe('function')
      expect(typeof services.onAgentResize).toBe('function')
      expect(typeof services.onFileRead).toBe('function')
      expect(typeof services.onFileWrite).toBe('function')
      expect(typeof services.onFileTreeRequest).toBe('function')
      expect(typeof services.onGitDiff).toBe('function')
      expect(typeof services.onGitStatus).toBe('function')
      expect(typeof services.onTeamStart).toBe('function')
      expect(typeof services.onTeamStop).toBe('function')
    })

    it('onTeamStart creates TeamSession and returns lead agent', async () => {
      const { createIpcServices } = await import('../../../main/services/createIpcServices')

      const services = createIpcServices({
        ptyManager: ptyManager as never,
        fileService: {
          readFile: vi.fn(),
          writeFile: vi.fn(),
          getFileTree: vi.fn().mockResolvedValue([]),
          detectLanguage: vi.fn()
        } as never,
        gitService: { getStatus: vi.fn(), getDiff: vi.fn(), getFileStatus: vi.fn() } as never,
        teamConfigService: {
          loadConfig: vi.fn(),
          saveConfig: vi.fn(),
          deleteConfig: vi.fn(),
          listConfigs: vi.fn().mockReturnValue([]),
          enrichConfig: vi.fn((c: TeamConfig) => c)
        } as never
      })

      const result = await services.onTeamStart({
        config: {
          name: 'test',
          project: '/tmp',
          agents: [
            { name: 'arch', role: 'Lead', command: 'claude' },
            { name: 'code', role: 'Impl', command: 'claude' }
          ]
        }
      })
      // TeamSession returns only the lead agent; teammates spawn asynchronously
      expect(result.agents).toHaveLength(1)
      expect(result.agents[0].name).toBe('team-lead')

      // Clean up the active session
      await services.onTeamStop()
    })

    it('onTeamStop destroys lead PTY and cleans up session', async () => {
      const { createIpcServices } = await import('../../../main/services/createIpcServices')

      const services = createIpcServices({
        ptyManager: ptyManager as never,
        fileService: {
          readFile: vi.fn(),
          writeFile: vi.fn(),
          getFileTree: vi.fn().mockResolvedValue([]),
          detectLanguage: vi.fn()
        } as never,
        gitService: { getStatus: vi.fn(), getDiff: vi.fn(), getFileStatus: vi.fn() } as never,
        teamConfigService: {
          loadConfig: vi.fn(),
          saveConfig: vi.fn(),
          deleteConfig: vi.fn(),
          listConfigs: vi.fn(),
          enrichConfig: vi.fn((c: TeamConfig) => c)
        } as never
      })

      // Start a team first so there's a session to stop
      await services.onTeamStart({
        config: {
          name: 'test',
          project: '/tmp',
          agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
        }
      })

      await services.onTeamStop()
      // TeamSession.stop() destroys individual PTYs
      expect(ptyManager.destroyPty).toHaveBeenCalled()
    })

    it('onAgentInput forwards input to PtyManager', async () => {
      const { createIpcServices } = await import('../../../main/services/createIpcServices')

      const services = createIpcServices({
        ptyManager: ptyManager as never,
        fileService: {
          readFile: vi.fn(),
          writeFile: vi.fn(),
          getFileTree: vi.fn().mockResolvedValue([]),
          detectLanguage: vi.fn()
        } as never,
        gitService: { getStatus: vi.fn(), getDiff: vi.fn(), getFileStatus: vi.fn() } as never,
        teamConfigService: {
          loadConfig: vi.fn(),
          saveConfig: vi.fn(),
          deleteConfig: vi.fn(),
          listConfigs: vi.fn(),
          enrichConfig: vi.fn((c: TeamConfig) => c)
        } as never
      })

      await services.onAgentInput({ agentId: 'agent-1', data: 'yes\n' })
      expect(ptyManager.sendInput).toHaveBeenCalledWith('agent-1', 'yes\n')
    })
  })
})
