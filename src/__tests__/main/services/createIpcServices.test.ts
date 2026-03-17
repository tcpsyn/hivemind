import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createIpcServices, type ServiceDeps } from '../../../main/services/createIpcServices'
import type { AgentState } from '../../../shared/types'

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'agent-1',
    name: 'coder',
    role: 'Implementation',
    avatar: 'robot-1',
    color: '#FF6B6B',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    pid: 1234,
    ...overrides
  }
}

function createMockDeps(): ServiceDeps {
  const agent = makeAgent()
  return {
    ptyManager: {
      createPty: vi.fn().mockResolvedValue(agent),
      sendInput: vi.fn(),
      destroyPty: vi.fn(),
      resize: vi.fn(),
      getAll: vi.fn().mockReturnValue(new Map([['agent-1', agent]]))
    } as any,
    fileService: {
      readFile: vi.fn().mockResolvedValue('file content'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      getFileTree: vi.fn().mockResolvedValue([])
    } as any,
    gitService: {
      getDiff: vi.fn().mockResolvedValue('diff output'),
      getStatus: vi.fn().mockResolvedValue({ files: [], branch: 'main', ahead: 0, behind: 0 })
    } as any,
    teamConfigService: {
      enrichConfig: vi.fn().mockImplementation((config: any) => config)
    } as any,
    onSessionCreated: vi.fn()
  }
}

describe('createIpcServices', () => {
  let deps: ServiceDeps

  beforeEach(() => {
    deps = createMockDeps()
  })

  describe('onAgentCreate', () => {
    it('creates a PTY and returns agent info', async () => {
      const services = createIpcServices(deps)
      const result = await services.onAgentCreate({
        config: { name: 'coder', role: 'Implementation', command: 'claude' },
        cwd: '/project'
      })

      expect(deps.ptyManager.createPty).toHaveBeenCalledWith(
        { name: 'coder', role: 'Implementation', command: 'claude' },
        '/project'
      )
      expect(result.agentId).toBe('agent-1')
      expect(result.agent).toBeDefined()
    })
  })

  describe('onAgentInput', () => {
    it('sends input to the PTY manager', async () => {
      const services = createIpcServices(deps)
      await services.onAgentInput({ agentId: 'agent-1', data: 'hello' })

      expect(deps.ptyManager.sendInput).toHaveBeenCalledWith('agent-1', 'hello')
    })
  })

  describe('onAgentStop', () => {
    it('destroys the PTY', async () => {
      const services = createIpcServices(deps)
      await services.onAgentStop({ agentId: 'agent-1' })

      expect(deps.ptyManager.destroyPty).toHaveBeenCalledWith('agent-1')
    })
  })

  describe('onAgentRestart', () => {
    it('destroys and recreates the PTY', async () => {
      const services = createIpcServices(deps)
      await services.onAgentRestart({ agentId: 'agent-1' })

      expect(deps.ptyManager.destroyPty).toHaveBeenCalledWith('agent-1')
      expect(deps.ptyManager.createPty).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'coder', role: 'Implementation', command: 'claude' }),
        expect.any(String)
      )
    })

    it('throws when agent ID is not found', async () => {
      ;(deps.ptyManager.getAll as ReturnType<typeof vi.fn>).mockReturnValue(new Map())
      const services = createIpcServices(deps)

      await expect(services.onAgentRestart({ agentId: 'nonexistent' })).rejects.toThrow(
        'Agent nonexistent not found'
      )
    })
  })

  describe('onAgentResize', () => {
    it('resizes the PTY', async () => {
      const services = createIpcServices(deps)
      await services.onAgentResize({ agentId: 'agent-1', cols: 120, rows: 40 })

      expect(deps.ptyManager.resize).toHaveBeenCalledWith('agent-1', 120, 40)
    })
  })

  describe('onFileRead', () => {
    it('reads a file and returns content', async () => {
      const services = createIpcServices(deps)
      const result = await services.onFileRead({ filePath: '/project/index.ts' })

      expect(deps.fileService.readFile).toHaveBeenCalledWith('/project/index.ts')
      expect(result).toEqual({ content: 'file content', filePath: '/project/index.ts' })
    })
  })

  describe('onFileWrite', () => {
    it('writes content to a file', async () => {
      const services = createIpcServices(deps)
      await services.onFileWrite({ filePath: '/project/index.ts', content: 'new content' })

      expect(deps.fileService.writeFile).toHaveBeenCalledWith('/project/index.ts', 'new content')
    })
  })

  describe('onFileTreeRequest', () => {
    it('returns the file tree', async () => {
      const mockTree = [{ name: 'src', path: '/src', type: 'directory' as const }]
      ;(deps.fileService.getFileTree as ReturnType<typeof vi.fn>).mockResolvedValue(mockTree)

      const services = createIpcServices(deps)
      const result = await services.onFileTreeRequest({ rootPath: '/project' })

      expect(deps.fileService.getFileTree).toHaveBeenCalledWith('/project')
      expect(result).toEqual(mockTree)
    })
  })

  describe('onGitDiff', () => {
    it('returns the diff for a file', async () => {
      const services = createIpcServices(deps)
      const result = await services.onGitDiff({ filePath: '/project/index.ts' })

      expect(deps.gitService.getDiff).toHaveBeenCalledWith('/project/index.ts')
      expect(result).toEqual({ diff: 'diff output', filePath: '/project/index.ts' })
    })
  })

  describe('onGitStatus', () => {
    it('returns git status', async () => {
      const services = createIpcServices(deps)
      const result = await services.onGitStatus({ rootPath: '/project' })

      expect(result).toEqual({ files: [], branch: 'main', ahead: 0, behind: 0 })
    })
  })

  describe('onTeamStart', () => {
    it('enriches config and starts a team session', async () => {
      const config = {
        name: 'test-team',
        project: '/project',
        agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
      }
      ;(deps.teamConfigService.enrichConfig as ReturnType<typeof vi.fn>).mockReturnValue(config)

      const services = createIpcServices(deps)
      // Mock the TeamSession constructor — createIpcServices creates a TeamSession internally.
      // The start method is called, so we need ptyManager.createPty to succeed.
      ;(deps.ptyManager.createPty as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgent({ id: 'lead-1', name: 'lead' })
      )

      const result = await services.onTeamStart({ config })

      expect(deps.teamConfigService.enrichConfig).toHaveBeenCalledWith(config)
      expect(result.agents).toBeDefined()
    })
  })

  describe('onTeamStop', () => {
    it('does nothing when no active session', async () => {
      const services = createIpcServices(deps)
      await expect(services.onTeamStop()).resolves.not.toThrow()
    })
  })

  describe('onTeammateInput', () => {
    it('throws when no active session', async () => {
      const services = createIpcServices(deps)
      await expect(
        services.onTeammateInput({ paneId: '%1', data: 'hello' })
      ).rejects.toThrow('No active team session')
    })
  })

  describe('getActiveSession', () => {
    it('returns null initially', () => {
      const services = createIpcServices(deps)
      expect(services.getActiveSession()).toBeNull()
    })
  })
})
