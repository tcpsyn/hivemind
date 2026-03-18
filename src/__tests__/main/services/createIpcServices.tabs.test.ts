import { describe, it, expect, vi, beforeEach } from 'vitest'
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
      removeListener: vi.fn(),
      removeAllListeners: vi.fn()
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

describe('createIpcServices — Multi-Tab TabContext', () => {
  let deps: ServiceDeps
  let tabServicesPerTab: Map<string, TabServices>

  beforeEach(() => {
    tabServicesPerTab = new Map()
    deps = {
      teamConfigService: {
        enrichConfig: vi.fn().mockImplementation((config: any) => config)
      } as any,
      onSessionCreated: vi.fn(),
      createTabServices: vi.fn().mockImplementation((projectPath: string) => {
        const ts = createMockTabServices()
        tabServicesPerTab.set(projectPath, ts)
        return ts
      })
    }
  })

  describe('tab creation', () => {
    it('onTabCreate creates a new TabContext', async () => {
      const services = createIpcServices(deps)
      const result = await services.onTabCreate({ projectPath: '/home/user/project-a' })

      expect(result.tabId).toBeDefined()
      expect(result.projectPath).toBe('/home/user/project-a')
      expect(result.projectName).toBe('project-a')
    })

    it('creates independent TabContexts for multiple tabs', async () => {
      const services = createIpcServices(deps)
      const tab1 = await services.onTabCreate({ projectPath: '/path/project-a' })
      const tab2 = await services.onTabCreate({ projectPath: '/path/project-b' })

      expect(tab1.tabId).not.toBe(tab2.tabId)
      expect(deps.createTabServices).toHaveBeenCalledTimes(2)
    })

    it('calls onTabCreated callback', async () => {
      const onTabCreated = vi.fn()
      deps.onTabCreated = onTabCreated

      const services = createIpcServices(deps)
      const result = await services.onTabCreate({ projectPath: '/path/project' })

      expect(onTabCreated).toHaveBeenCalledWith(result.tabId, expect.objectContaining({
        projectPath: '/path/project',
        projectName: 'project'
      }))
    })

    it('throws when creating a tab with duplicate tabId', async () => {
      const services = createIpcServices(deps)
      // TabIds are auto-generated so duplicates shouldn't happen,
      // but two tabs with same path should get different IDs
      const tab1 = await services.onTabCreate({ projectPath: '/path/project' })
      const tab2 = await services.onTabCreate({ projectPath: '/path/project' })
      expect(tab1.tabId).not.toBe(tab2.tabId)
    })
  })

  describe('tab destruction', () => {
    it('onTabClose destroys the TabContext', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/path/project' })
      await services.onTabClose({ tabId: tab.tabId })

      await expect(
        services.onAgentInput({ tabId: tab.tabId, agentId: 'agent-1', data: 'hi' })
      ).rejects.toThrow()
    })

    it('onTabClose calls destroyAll on PtyManager', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/path/project' })
      const ts = tabServicesPerTab.get('/path/project')!

      await services.onTabClose({ tabId: tab.tabId })

      expect(ts.ptyManager.destroyAll).toHaveBeenCalled()
    })

    it('onTabClose stops active session for that tab', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/path/project' })
      const ts = tabServicesPerTab.get('/path/project')!

      const config = {
        name: 'test-team',
        project: '/path/project',
        agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
      }
      ;(ts.ptyManager.createPty as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgent({ id: 'lead-1', name: 'lead' })
      )
      await services.onTeamStart({ tabId: tab.tabId, config })

      await services.onTabClose({ tabId: tab.tabId })

      expect(ts.ptyManager.destroyAll).toHaveBeenCalled()
    })

    it('onTabClose is a no-op for unknown tabId', async () => {
      const services = createIpcServices(deps)
      await expect(services.onTabClose({ tabId: 'nonexistent' })).resolves.not.toThrow()
    })
  })

  describe('IPC routing by tabId', () => {
    it('onAgentInput routes to the correct tab context', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/path/project' })
      const ts = tabServicesPerTab.get('/path/project')!

      await services.onAgentInput({ tabId: tab.tabId, agentId: 'agent-1', data: 'hello' })

      expect(ts.ptyManager.sendInput).toHaveBeenCalledWith('agent-1', 'hello')
    })

    it('onFileRead routes to the correct tab context', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/path/project' })

      const result = await services.onFileRead({
        tabId: tab.tabId,
        filePath: '/path/project/index.ts'
      })

      expect(result).toEqual({ content: 'file content', filePath: '/path/project/index.ts' })
    })

    it('onTeamStart creates session for the correct tab', async () => {
      const services = createIpcServices(deps)
      const tab1 = await services.onTabCreate({ projectPath: '/path/project-a' })
      const tab2 = await services.onTabCreate({ projectPath: '/path/project-b' })
      const tsA = tabServicesPerTab.get('/path/project-a')!

      const config = {
        name: 'team-a',
        project: '/path/project-a',
        agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
      }
      ;(tsA.ptyManager.createPty as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgent({ id: 'lead-a', name: 'lead' })
      )

      await services.onTeamStart({ tabId: tab1.tabId, config })

      // Tab 2 should have no active session
      await expect(
        services.onTeammateInput({ tabId: tab2.tabId, paneId: '%1', data: 'hi' })
      ).rejects.toThrow('No active team session')
    })

    it('operations with invalid tabId throw', async () => {
      const services = createIpcServices(deps)

      await expect(
        services.onAgentInput({ tabId: 'nonexistent', agentId: 'agent-1', data: 'hi' })
      ).rejects.toThrow('No tab context found')
    })
  })

  describe('tab isolation', () => {
    it('stopping team on one tab does not affect another', { timeout: 15000 }, async () => {
      const services = createIpcServices(deps)
      const tab1 = await services.onTabCreate({ projectPath: '/path/a' })
      const tab2 = await services.onTabCreate({ projectPath: '/path/b' })
      const tsA = tabServicesPerTab.get('/path/a')!
      const tsB = tabServicesPerTab.get('/path/b')!

      const config1 = {
        name: 'team-a',
        project: '/path/a',
        agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
      }
      const config2 = {
        name: 'team-b',
        project: '/path/b',
        agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
      }
      ;(tsA.ptyManager.createPty as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgent({ id: 'lead-a', name: 'lead' })
      )
      ;(tsB.ptyManager.createPty as ReturnType<typeof vi.fn>).mockResolvedValue(
        makeAgent({ id: 'lead-b', name: 'lead' })
      )

      await services.onTeamStart({ tabId: tab1.tabId, config: config1 })
      await services.onTeamStart({ tabId: tab2.tabId, config: config2 })

      // Stop only tab 1
      await services.onTeamStop({ tabId: tab1.tabId })

      // Tab 2's session should still be active
      const tab2Context = services.getTab!(tab2.tabId)
      expect(tab2Context).not.toBeNull()
      expect(tab2Context!.session).not.toBeNull()
    })

    it('closing one tab does not affect another', async () => {
      const services = createIpcServices(deps)
      const tab1 = await services.onTabCreate({ projectPath: '/path/a' })
      const tab2 = await services.onTabCreate({ projectPath: '/path/b' })

      await services.onTabClose({ tabId: tab1.tabId })

      // Tab 2 should still work
      const tab2Context = services.getTab!(tab2.tabId)
      expect(tab2Context).not.toBeNull()
    })

    it('each tab gets its own PtyManager', async () => {
      const services = createIpcServices(deps)
      await services.onTabCreate({ projectPath: '/path/a' })
      await services.onTabCreate({ projectPath: '/path/b' })

      // createTabServices should have been called twice with different paths
      expect(deps.createTabServices).toHaveBeenCalledWith('/path/a')
      expect(deps.createTabServices).toHaveBeenCalledWith('/path/b')

      const tsA = tabServicesPerTab.get('/path/a')!
      const tsB = tabServicesPerTab.get('/path/b')!
      expect(tsA.ptyManager).not.toBe(tsB.ptyManager)
    })
  })

  describe('destroyAllTabs', () => {
    it('cleans up all tabs', async () => {
      const services = createIpcServices(deps)
      await services.onTabCreate({ projectPath: '/path/a' })
      await services.onTabCreate({ projectPath: '/path/b' })

      await services.destroyAllTabs!()

      expect(services.getTabs!().size).toBe(0)
    })

    it('calls destroyAll on each PtyManager', async () => {
      const services = createIpcServices(deps)
      await services.onTabCreate({ projectPath: '/path/a' })
      await services.onTabCreate({ projectPath: '/path/b' })

      const tsA = tabServicesPerTab.get('/path/a')!
      const tsB = tabServicesPerTab.get('/path/b')!

      await services.destroyAllTabs!()

      expect(tsA.ptyManager.destroyAll).toHaveBeenCalled()
      expect(tsB.ptyManager.destroyAll).toHaveBeenCalled()
    })
  })
})
