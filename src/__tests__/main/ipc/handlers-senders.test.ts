import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RendererToMain } from '../../../shared/ipc-channels'

const handlers = new Map<string, (...args: unknown[]) => unknown>()
const removedHandlers: string[] = []

vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn((channel: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(channel, handler)
    }),
    removeHandler: vi.fn((channel: string) => {
      removedHandlers.push(channel)
      handlers.delete(channel)
    })
  },
  BrowserWindow: vi.fn(),
  dialog: {
    showOpenDialog: vi.fn().mockResolvedValue({ canceled: true, filePaths: [] })
  }
}))

const {
  registerIpcHandlers,
  removeIpcHandlers,
  sendToRenderer,
  sendAgentOutput,
  sendAgentStatusChange,
  sendAgentInputNeeded,
  sendFileChanged,
  sendFileTreeUpdate,
  sendGitStatusUpdate,
  sendTeammateSpawned,
  sendTeammateExited,
  sendTeammateOutput,
  sendTeammateRenamed,
  sendTeammateStatus
} = await import('../../../main/ipc/handlers')

function createMockServices() {
  return {
    onTabCreate: vi.fn().mockResolvedValue({ tabId: 't1', projectPath: '/p', projectName: 'p' }),
    onTabClose: vi.fn().mockResolvedValue(undefined),
    onAgentInput: vi.fn().mockResolvedValue(undefined),
    onAgentStop: vi.fn().mockResolvedValue(undefined),
    onAgentRestart: vi.fn().mockResolvedValue(undefined),
    onAgentResize: vi.fn().mockResolvedValue(undefined),
    onFileRead: vi.fn().mockResolvedValue({ content: '', filePath: '' }),
    onFileWrite: vi.fn().mockResolvedValue(undefined),
    onFileTreeRequest: vi.fn().mockResolvedValue([]),
    onGitDiff: vi.fn().mockResolvedValue({ diff: '', filePath: '' }),
    onTeamStart: vi.fn().mockResolvedValue({ agents: [] }),
    onTeamStop: vi.fn().mockResolvedValue(undefined),
    onTeammateInput: vi.fn().mockResolvedValue(undefined),
    onTeammateResize: vi.fn().mockResolvedValue(undefined)
  }
}

function createMockWindow(destroyed = false) {
  return {
    isDestroyed: vi.fn().mockReturnValue(destroyed),
    webContents: { send: vi.fn() }
  } as unknown as Electron.BrowserWindow
}

describe('IPC Handler sender functions', () => {
  beforeEach(() => {
    handlers.clear()
    removedHandlers.length = 0
    vi.clearAllMocks()
  })

  describe('sendToRenderer', () => {
    it('sends data to window webContents', () => {
      const win = createMockWindow()
      sendToRenderer(win, 'test:channel', { data: 'hello' })
      expect(win.webContents.send).toHaveBeenCalledWith('test:channel', { data: 'hello' })
    })

    it('does not send when window is destroyed', () => {
      const win = createMockWindow(true)
      sendToRenderer(win, 'test:channel', { data: 'hello' })
      expect(win.webContents.send).not.toHaveBeenCalled()
    })
  })

  describe('sendAgentOutput', () => {
    it('sends agent output to renderer', () => {
      const win = createMockWindow()
      sendAgentOutput(win, { tabId: 't1', agentId: 'a1', data: 'output' })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'agent:output',
        expect.objectContaining({ tabId: 't1', agentId: 'a1', data: 'output' })
      )
    })
  })

  describe('sendAgentStatusChange', () => {
    it('sends agent status change to renderer', () => {
      const win = createMockWindow()
      const payload = { tabId: 't1', agentId: 'a1', status: 'stopped' as const, agent: {} as any }
      sendAgentStatusChange(win, payload)
      expect(win.webContents.send).toHaveBeenCalledWith('agent:status-change', payload)
    })
  })

  describe('sendAgentInputNeeded', () => {
    it('sends input needed event to renderer', () => {
      const win = createMockWindow()
      sendAgentInputNeeded(win, { tabId: 't1', agentId: 'a1', agentName: 'lead' })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'agent:input-needed',
        expect.objectContaining({ agentId: 'a1' })
      )
    })
  })

  describe('sendFileChanged', () => {
    it('sends file changed event to renderer', () => {
      const win = createMockWindow()
      sendFileChanged(win, { tabId: 't1', event: { type: 'change', path: '/a.ts' } as any })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'file:changed',
        expect.objectContaining({ tabId: 't1' })
      )
    })
  })

  describe('sendFileTreeUpdate', () => {
    it('sends file tree update to renderer', () => {
      const win = createMockWindow()
      sendFileTreeUpdate(win, { tabId: 't1', tree: [] })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'file:tree-update',
        expect.objectContaining({ tabId: 't1', tree: [] })
      )
    })
  })

  describe('sendGitStatusUpdate', () => {
    it('sends git status update to renderer', () => {
      const win = createMockWindow()
      sendGitStatusUpdate(win, {
        tabId: 't1',
        status: { branch: 'main', ahead: 0, behind: 0, files: [] }
      })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'git:status-update',
        expect.objectContaining({ tabId: 't1' })
      )
    })
  })

  describe('sendTeammateSpawned', () => {
    it('sends teammate spawned event to renderer', () => {
      const win = createMockWindow()
      sendTeammateSpawned(win, {
        tabId: 't1',
        agentId: 'a1',
        agent: {} as any,
        paneId: '%1',
        sessionName: 'main'
      })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'team:teammate-spawned',
        expect.objectContaining({ agentId: 'a1', paneId: '%1' })
      )
    })
  })

  describe('sendTeammateExited', () => {
    it('sends teammate exited event to renderer', () => {
      const win = createMockWindow()
      sendTeammateExited(win, {
        tabId: 't1',
        agentId: 'a1',
        paneId: '%1',
        sessionName: 'main',
        exitCode: 0
      })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'team:teammate-exited',
        expect.objectContaining({ exitCode: 0 })
      )
    })
  })

  describe('sendTeammateOutput', () => {
    it('sends teammate output to renderer', () => {
      const win = createMockWindow()
      sendTeammateOutput(win, { tabId: 't1', paneId: '%1', data: 'output' })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'teammate:output',
        expect.objectContaining({ paneId: '%1', data: 'output' })
      )
    })
  })

  describe('sendTeammateRenamed', () => {
    it('sends teammate renamed event to renderer', () => {
      const win = createMockWindow()
      sendTeammateRenamed(win, { tabId: 't1', agentId: 'a1', name: 'researcher', paneId: '%1' })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'team:teammate-renamed',
        expect.objectContaining({ name: 'researcher' })
      )
    })
  })

  describe('sendTeammateStatus', () => {
    it('sends teammate status to renderer', () => {
      const win = createMockWindow()
      sendTeammateStatus(win, { tabId: 't1', agentId: 'a1', model: 'Opus 4.6' })
      expect(win.webContents.send).toHaveBeenCalledWith(
        'team:teammate-status',
        expect.objectContaining({ model: 'Opus 4.6' })
      )
    })
  })

  describe('removeIpcHandlers', () => {
    it('removes all registered handlers', () => {
      const services = createMockServices()
      registerIpcHandlers(services)
      removeIpcHandlers()

      const channels = Object.values(RendererToMain)
      for (const channel of channels) {
        expect(removedHandlers).toContain(channel)
      }
      expect(removedHandlers).toContain('dialog:open-folder')
    })
  })

  describe('handler error propagation', () => {
    it('propagates service errors to IPC caller', async () => {
      const services = createMockServices()
      services.onFileRead.mockRejectedValue(new Error('File not found'))
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.FILE_READ)!
      await expect(handler({}, { tabId: 't1', filePath: '/missing.ts' })).rejects.toThrow(
        'File not found'
      )
    })

    it('propagates team start errors', async () => {
      const services = createMockServices()
      services.onTeamStart.mockRejectedValue(new Error('Invalid config'))
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.TEAM_START)!
      const validReq = {
        tabId: 't1',
        config: { name: 'team', project: '/p', agents: [{ name: 'a', role: 'r', command: 'c' }] }
      }
      await expect(handler({}, validReq)).rejects.toThrow('Invalid config')
    })

    it('rejects invalid payloads before reaching service', () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.TEAM_START)!
      expect(() => handler({}, { tabId: 't1', config: {} })).toThrow('IPC validation failed')
      expect(services.onTeamStart).not.toHaveBeenCalled()
    })
  })

  describe('handler routing completeness', () => {
    it('routes tab:create to onTabCreate', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.TAB_CREATE)!
      await handler({}, { projectPath: '/test' })
      expect(services.onTabCreate).toHaveBeenCalledWith({ projectPath: '/test' })
    })

    it('routes tab:close to onTabClose', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.TAB_CLOSE)!
      await handler({}, { tabId: 't1' })
      expect(services.onTabClose).toHaveBeenCalledWith({ tabId: 't1' })
    })

    it('routes teammate:input to onTeammateInput', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.TEAMMATE_INPUT)!
      const req = { tabId: 't1', paneId: '%1', data: 'hello' }
      await handler({}, req)
      expect(services.onTeammateInput).toHaveBeenCalledWith(req)
    })

    it('routes teammate:resize to onTeammateResize', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.TEAMMATE_RESIZE)!
      const req = { tabId: 't1', paneId: '%1', cols: 120, rows: 40 }
      await handler({}, req)
      expect(services.onTeammateResize).toHaveBeenCalledWith(req)
    })
  })
})
