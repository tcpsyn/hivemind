import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RendererToMain, MainToRenderer } from '../../../shared/ipc-channels'

// Track registered handlers
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
  BrowserWindow: vi.fn()
}))

const { registerIpcHandlers, removeIpcHandlers, sendToRenderer } =
  await import('../../../main/ipc/handlers')

function createMockServices() {
  return {
    onAgentCreate: vi.fn().mockResolvedValue({ agentId: 'a1', agent: {} }),
    onAgentInput: vi.fn().mockResolvedValue(undefined),
    onAgentStop: vi.fn().mockResolvedValue(undefined),
    onAgentRestart: vi.fn().mockResolvedValue(undefined),
    onAgentResize: vi.fn().mockResolvedValue(undefined),
    onFileRead: vi.fn().mockResolvedValue({ content: '', filePath: '' }),
    onFileWrite: vi.fn().mockResolvedValue(undefined),
    onFileTreeRequest: vi.fn().mockResolvedValue([]),
    onGitDiff: vi.fn().mockResolvedValue({ diff: '', filePath: '' }),
    onGitStatus: vi.fn().mockResolvedValue({ files: [], branch: 'main', ahead: 0, behind: 0 }),
    onTeamStart: vi.fn().mockResolvedValue({ agents: [] }),
    onTeamStop: vi.fn().mockResolvedValue(undefined)
  }
}

describe('IPC Handlers', () => {
  beforeEach(() => {
    handlers.clear()
    removedHandlers.length = 0
    vi.clearAllMocks()
  })

  describe('registerIpcHandlers', () => {
    it('registers handlers for all Renderer→Main channels', () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const channels = Object.values(RendererToMain)
      for (const channel of channels) {
        expect(handlers.has(channel)).toBe(true)
      }
    })

    it('registers exactly 12 handlers', () => {
      const services = createMockServices()
      registerIpcHandlers(services)
      expect(handlers.size).toBe(12)
    })
  })

  describe('handler routing', () => {
    it('routes agent:create to onAgentCreate', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.AGENT_CREATE)!
      const req = { config: { name: 'a', role: 'r', command: 'c' }, cwd: '/tmp' }
      await handler({}, req)
      expect(services.onAgentCreate).toHaveBeenCalledWith(req)
    })

    it('routes agent:input to onAgentInput', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.AGENT_INPUT)!
      const req = { agentId: 'a1', data: 'hello' }
      await handler({}, req)
      expect(services.onAgentInput).toHaveBeenCalledWith(req)
    })

    it('routes agent:stop to onAgentStop', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.AGENT_STOP)!
      const req = { agentId: 'a1' }
      await handler({}, req)
      expect(services.onAgentStop).toHaveBeenCalledWith(req)
    })

    it('routes agent:resize to onAgentResize', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.AGENT_RESIZE)!
      const req = { agentId: 'a1', cols: 120, rows: 40 }
      await handler({}, req)
      expect(services.onAgentResize).toHaveBeenCalledWith(req)
    })

    it('routes file:read to onFileRead', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.FILE_READ)!
      const req = { filePath: '/test.ts' }
      await handler({}, req)
      expect(services.onFileRead).toHaveBeenCalledWith(req)
    })

    it('routes team:start to onTeamStart', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.TEAM_START)!
      const req = { config: { name: 'team', project: '/p', agents: [] } }
      await handler({}, req)
      expect(services.onTeamStart).toHaveBeenCalledWith(req)
    })

    it('routes team:stop to onTeamStop', async () => {
      const services = createMockServices()
      registerIpcHandlers(services)

      const handler = handlers.get(RendererToMain.TEAM_STOP)!
      await handler({})
      expect(services.onTeamStop).toHaveBeenCalled()
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
    })
  })

  describe('sendToRenderer', () => {
    it('sends a message to the renderer via webContents', () => {
      const send = vi.fn()
      const mockWindow = {
        isDestroyed: () => false,
        webContents: { send }
      }

      sendToRenderer(mockWindow as never, MainToRenderer.AGENT_OUTPUT, {
        agentId: 'a1',
        data: 'output'
      })

      expect(send).toHaveBeenCalledWith(MainToRenderer.AGENT_OUTPUT, {
        agentId: 'a1',
        data: 'output'
      })
    })

    it('does not send if window is destroyed', () => {
      const send = vi.fn()
      const mockWindow = {
        isDestroyed: () => true,
        webContents: { send }
      }

      sendToRenderer(mockWindow as never, MainToRenderer.AGENT_OUTPUT, {})
      expect(send).not.toHaveBeenCalled()
    })
  })
})
