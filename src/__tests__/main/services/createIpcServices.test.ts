import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import {
  createIpcServices,
  type ServiceDeps,
  type TabServices
} from '../../../main/services/createIpcServices'
import type { AgentState } from '../../../shared/types'

// Mock TeamSession so onTeamStart doesn't spawn real tmux
vi.mock('../../../main/tmux/TeamSession', () => {
  return {
    TeamSession: vi.fn().mockImplementation(function (this: any) {
      Object.assign(this, new EventEmitter())
      this.start = vi.fn().mockResolvedValue({
        id: 'lead-1',
        name: 'team-lead',
        role: 'lead',
        avatar: '',
        color: '',
        status: 'running',
        needsInput: false,
        lastActivity: Date.now(),
        pid: 12345
      })
      this.stop = vi.fn().mockResolvedValue(undefined)
      this.isRunning = vi.fn().mockReturnValue(true)
      this.getServer = vi.fn().mockReturnValue(null)
      this.getLeadAgent = vi.fn().mockReturnValue(null)
      this.getTeammates = vi.fn().mockReturnValue([])
      this.sendTeammateInput = vi.fn().mockResolvedValue(undefined)
      this.on = vi.fn().mockReturnThis()
      this.removeAllListeners = vi.fn().mockReturnThis()
    })
  }
})

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

function createMockTabServices(): TabServices {
  const agent = makeAgent()
  return {
    ptyManager: {
      createPty: vi.fn().mockResolvedValue(agent),
      sendInput: vi.fn(),
      destroyPty: vi.fn(),
      destroyAll: vi.fn(),
      resize: vi.fn(),
      getAll: vi.fn().mockReturnValue(new Map([['agent-1', agent]])),
      on: vi.fn(),
      emit: vi.fn(),
      removeListener: vi.fn()
    } as any,
    fileService: {
      readFile: vi.fn().mockResolvedValue('file content'),
      writeFile: vi.fn().mockResolvedValue(undefined),
      getFileTree: vi.fn().mockResolvedValue([])
    } as any,
    gitService: {
      getDiff: vi.fn().mockResolvedValue('diff output'),
      getStatus: vi.fn().mockResolvedValue({ files: [], branch: 'main', ahead: 0, behind: 0 })
    } as any
  }
}

function createMockDeps(tabServices?: TabServices): ServiceDeps {
  const mockTabServices = tabServices ?? createMockTabServices()
  return {
    teamConfigService: {
      enrichConfig: vi.fn().mockImplementation((config: any) => config)
    } as any,
    onSessionCreated: vi.fn(),
    createTabServices: vi.fn().mockReturnValue(mockTabServices)
  }
}

async function createServiceWithTab(deps: ServiceDeps) {
  const services = createIpcServices(deps)
  const tab = await services.onTabCreate({ projectPath: '/project' })
  return { services, tabId: tab.tabId, tab }
}

describe('createIpcServices', () => {
  let deps: ServiceDeps
  let tabServices: TabServices

  beforeEach(() => {
    tabServices = createMockTabServices()
    deps = createMockDeps(tabServices)
  })

  describe('onAgentInput', () => {
    it('sends input to the PTY manager', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      await services.onAgentInput({ tabId, agentId: 'agent-1', data: 'hello' })

      expect(tabServices.ptyManager.sendInput).toHaveBeenCalledWith('agent-1', 'hello')
    })
  })

  describe('onAgentStop', () => {
    it('destroys the PTY', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      await services.onAgentStop({ tabId, agentId: 'agent-1' })

      expect(tabServices.ptyManager.destroyPty).toHaveBeenCalledWith('agent-1')
    })
  })

  describe('onAgentRestart', () => {
    it('destroys and recreates the PTY', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      await services.onAgentRestart({ tabId, agentId: 'agent-1' })

      expect(tabServices.ptyManager.destroyPty).toHaveBeenCalledWith('agent-1')
      expect(tabServices.ptyManager.createPty).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'coder', role: 'Implementation', command: 'claude' }),
        '/project'
      )
    })

    it('throws when agent ID is not found', async () => {
      ;(tabServices.ptyManager.getAll as ReturnType<typeof vi.fn>).mockReturnValue(new Map())
      const { services, tabId } = await createServiceWithTab(deps)

      await expect(
        services.onAgentRestart({ tabId, agentId: 'nonexistent' })
      ).rejects.toThrow('Agent nonexistent not found')
    })
  })

  describe('onAgentResize', () => {
    it('resizes the PTY', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      await services.onAgentResize({ tabId, agentId: 'agent-1', cols: 120, rows: 40 })

      expect(tabServices.ptyManager.resize).toHaveBeenCalledWith('agent-1', 120, 40)
    })
  })

  describe('onFileRead', () => {
    it('reads a file and returns content', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      const result = await services.onFileRead({ tabId, filePath: '/project/index.ts' })

      expect(tabServices.fileService.readFile).toHaveBeenCalledWith('/project/index.ts')
      expect(result).toEqual({ content: 'file content', filePath: '/project/index.ts' })
    })
  })

  describe('onFileWrite', () => {
    it('writes content to a file', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      await services.onFileWrite({ tabId, filePath: '/project/index.ts', content: 'new content' })

      expect(tabServices.fileService.writeFile).toHaveBeenCalledWith(
        '/project/index.ts',
        'new content'
      )
    })
  })

  describe('onFileTreeRequest', () => {
    it('returns the file tree', async () => {
      const mockTree = [{ name: 'src', path: '/src', type: 'directory' as const }]
      ;(tabServices.fileService.getFileTree as ReturnType<typeof vi.fn>).mockResolvedValue(
        mockTree
      )

      const { services, tabId } = await createServiceWithTab(deps)
      const result = await services.onFileTreeRequest({ tabId, rootPath: '/project' })

      expect(tabServices.fileService.getFileTree).toHaveBeenCalledWith('/project')
      expect(result).toEqual(mockTree)
    })
  })

  describe('onGitDiff', () => {
    it('returns the diff for a file', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      const result = await services.onGitDiff({ tabId, filePath: '/project/index.ts' })

      expect(tabServices.gitService.getDiff).toHaveBeenCalledWith('/project/index.ts')
      expect(result).toEqual({ diff: 'diff output', filePath: '/project/index.ts' })
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
      ;(tabServices.ptyManager.createPty as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgent({ id: 'lead-1', name: 'lead' })
      )

      const { services, tabId } = await createServiceWithTab(deps)
      const result = await services.onTeamStart({ tabId, config })

      expect(deps.teamConfigService.enrichConfig).toHaveBeenCalledWith(config)
      expect(result.agents).toBeDefined()
    })
  })

  describe('onTeamStop', () => {
    it('does nothing when no active session', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      await expect(services.onTeamStop({ tabId })).resolves.not.toThrow()
    })
  })

  describe('onTeammateInput', () => {
    it('throws when no active session', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      await expect(
        services.onTeammateInput({ tabId, paneId: '%1', data: 'hello' })
      ).rejects.toThrow('No active team session')
    })
  })

  describe('tab accessors', () => {
    it('getTab returns null for unknown tabId', () => {
      const services = createIpcServices(deps)
      expect(services.getTab!('nonexistent')).toBeNull()
    })

    it('getTab returns the TabContext after creation', async () => {
      const { services, tabId } = await createServiceWithTab(deps)
      const tab = services.getTab!(tabId)

      expect(tab).not.toBeNull()
      expect(tab!.projectPath).toBe('/project')
      expect(tab!.projectName).toBe('project')
    })

    it('getTabs returns all tabs', async () => {
      const services = createIpcServices(deps)
      await services.onTabCreate({ projectPath: '/path/a' })
      await services.onTabCreate({ projectPath: '/path/b' })

      expect(services.getTabs!().size).toBe(2)
    })

    it('destroyAllTabs cleans up everything', async () => {
      const services = createIpcServices(deps)
      await services.onTabCreate({ projectPath: '/path/a' })
      await services.onTabCreate({ projectPath: '/path/b' })

      await services.destroyAllTabs!()

      expect(services.getTabs!().size).toBe(0)
    })
  })
})
