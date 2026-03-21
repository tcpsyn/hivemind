import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'

vi.mock('node-pty', () => {
  const mockPty = {
    pid: 12345,
    cols: 80,
    rows: 24,
    onData: vi.fn(() => ({ dispose: vi.fn() })),
    onExit: vi.fn(() => ({ dispose: vi.fn() })),
    write: vi.fn(),
    resize: vi.fn(),
    kill: vi.fn()
  }
  return {
    spawn: vi.fn(() => mockPty),
    default: { spawn: vi.fn(() => mockPty) }
  }
})

vi.mock('simple-git', () => ({
  simpleGit: vi.fn(() => ({
    status: vi.fn().mockResolvedValue({ files: [] }),
    diff: vi.fn().mockResolvedValue('')
  }))
}))

vi.mock('../../../main/tmux/TeamSession', () => {
  return {
    TeamSession: vi.fn().mockImplementation(function () {
      const emitter = new EventEmitter()
      return Object.assign(emitter, {
        start: vi.fn().mockResolvedValue({
          id: 'lead-1',
          name: 'team-lead',
          role: 'lead',
          status: 'running',
          isTeammate: false
        }),
        stop: vi.fn().mockResolvedValue(undefined),
        getServer: vi.fn().mockReturnValue(null),
        sendTeammateInput: vi.fn().mockResolvedValue(undefined),
        isRunning: vi.fn().mockReturnValue(true)
      })
    })
  }
})

import { createIpcServices } from '../../../main/services/createIpcServices'
import { PtyManager } from '../../../main/pty/PtyManager'
import { FileService } from '../../../main/services/FileService'
import { GitService } from '../../../main/services/GitService'

function createMockDeps() {
  const teamConfigService = {
    enrichConfig: vi.fn((config: any) => config)
  }

  const onTabCreated = vi.fn()
  const onTabClosing = vi.fn()
  const onSessionCreated = vi.fn()

  const mockPtyManager = new PtyManager()
  const mockFileService = new FileService()
  const mockGitService = new GitService(process.cwd())

  return {
    teamConfigService,
    onTabCreated,
    onTabClosing,
    onSessionCreated,
    createTabServices: vi.fn(() => ({
      ptyManager: mockPtyManager,
      fileService: mockFileService,
      gitService: mockGitService
    }))
  }
}

describe('createIpcServices — error paths', () => {
  let deps: ReturnType<typeof createMockDeps>

  beforeEach(() => {
    vi.clearAllMocks()
    deps = createMockDeps()
  })

  describe('tab management errors', () => {
    it('throws when accessing non-existent tab', async () => {
      const services = createIpcServices(deps)

      await expect(
        services.onAgentInput({ tabId: 'nonexistent', agentId: 'a1', data: 'test' })
      ).rejects.toThrow('No tab context found')
    })

    it('ignores close for non-existent tab', async () => {
      const services = createIpcServices(deps)
      await expect(services.onTabClose({ tabId: 'nonexistent' })).resolves.not.toThrow()
    })
  })

  describe('tab lifecycle', () => {
    it('creates tab with correct project name', async () => {
      const services = createIpcServices(deps)
      const result = await services.onTabCreate({ projectPath: '/home/user/my-project' })

      expect(result.projectName).toBe('my-project')
      expect(result.projectPath).toBe('/home/user/my-project')
      expect(result.tabId).toBeDefined()
    })

    it('calls onTabCreated callback on tab creation', async () => {
      const services = createIpcServices(deps)
      const result = await services.onTabCreate({ projectPath: '/test' })

      expect(deps.onTabCreated).toHaveBeenCalledWith(result.tabId, expect.any(Object))
    })

    it('calls onTabClosing callback on tab close', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/test' })

      await services.onTabClose({ tabId: tab.tabId })

      expect(deps.onTabClosing).toHaveBeenCalledWith(tab.tabId)
    })

    it('destroys PTY manager on tab close', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/test' })

      const context = services.getTab!(tab.tabId)
      const destroySpy = vi.spyOn(context!.ptyManager, 'destroyAll')

      await services.onTabClose({ tabId: tab.tabId })

      expect(destroySpy).toHaveBeenCalled()
    })

    it('stops session on tab close if running', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/test' })

      // Start a team session
      await services.onTeamStart({
        tabId: tab.tabId,
        config: { name: 'test', project: '/test', agents: [] }
      })

      const context = services.getTab!(tab.tabId)
      const sessionStopSpy = context!.session!.stop as ReturnType<typeof vi.fn>

      await services.onTabClose({ tabId: tab.tabId })

      expect(sessionStopSpy).toHaveBeenCalled()
    })
  })

  describe('agent operations', () => {
    it('routes agent input to PTY manager', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/test' })

      const context = services.getTab!(tab.tabId)
      const inputSpy = vi.spyOn(context!.ptyManager, 'sendInput').mockImplementation(() => {})

      await services.onAgentInput({ tabId: tab.tabId, agentId: 'a1', data: 'hello' })

      expect(inputSpy).toHaveBeenCalledWith('a1', 'hello')
    })

    it('routes agent stop to PTY manager', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/test' })

      const context = services.getTab!(tab.tabId)
      const destroySpy = vi.spyOn(context!.ptyManager, 'destroyPty')

      await services.onAgentStop({ tabId: tab.tabId, agentId: 'a1' })

      expect(destroySpy).toHaveBeenCalledWith('a1')
    })
  })

  describe('team session operations', () => {
    it('throws when teammate input is sent with no active session', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/test' })

      await expect(
        services.onTeammateInput({ tabId: tab.tabId, paneId: '%1', data: 'test' })
      ).rejects.toThrow('No active team session')
    })

    it('stops existing session before starting new one', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/test' })

      await services.onTeamStart({
        tabId: tab.tabId,
        config: { name: 'test', project: '/test', agents: [] }
      })

      const firstSession = services.getTab!(tab.tabId)!.session
      const stopSpy = firstSession!.stop as ReturnType<typeof vi.fn>

      await services.onTeamStart({
        tabId: tab.tabId,
        config: { name: 'test2', project: '/test', agents: [] }
      })

      expect(stopSpy).toHaveBeenCalled()
    })

    it('calls onSessionCreated callback', async () => {
      const services = createIpcServices(deps)
      const tab = await services.onTabCreate({ projectPath: '/test' })

      await services.onTeamStart({
        tabId: tab.tabId,
        config: { name: 'test', project: '/test', agents: [] }
      })

      expect(deps.onSessionCreated).toHaveBeenCalledWith(tab.tabId, expect.any(Object))
    })
  })

  describe('destroyAllTabs', () => {
    it('destroys all tabs and clears the map', async () => {
      const services = createIpcServices(deps)

      await services.onTabCreate({ projectPath: '/a' })
      await services.onTabCreate({ projectPath: '/b' })

      expect(services.getTabs!().size).toBe(2)

      await services.destroyAllTabs!()

      expect(services.getTabs!().size).toBe(0)
    })
  })
})
