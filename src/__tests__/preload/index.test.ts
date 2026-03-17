import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RendererToMain, MainToRenderer } from '../../shared/ipc-channels'

// Track registered listeners so we can simulate events
const listeners = new Map<string, ((...args: unknown[]) => void)[]>()

const mockIpcRenderer = {
  invoke: vi.fn(),
  on: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
    if (!listeners.has(channel)) listeners.set(channel, [])
    listeners.get(channel)!.push(handler)
  }),
  removeListener: vi.fn((channel: string, handler: (...args: unknown[]) => void) => {
    const cbs = listeners.get(channel)
    if (cbs) {
      const idx = cbs.indexOf(handler)
      if (idx !== -1) cbs.splice(idx, 1)
    }
  })
}

let exposeInMainWorldArg: Record<string, any> | null = null

const mockContextBridge = {
  exposeInMainWorld: vi.fn((_key: string, api: Record<string, any>) => {
    exposeInMainWorldArg = api
  })
}

vi.mock('electron', () => ({
  ipcRenderer: mockIpcRenderer,
  contextBridge: mockContextBridge
}))

function emitIpcEvent(channel: string, payload: unknown) {
  const cbs = listeners.get(channel)
  if (cbs) {
    for (const cb of [...cbs]) {
      cb({}, payload) // first arg is IpcRendererEvent
    }
  }
}

// Import the preload module once — it will execute its side effects with the mocks
// We set contextIsolated before the dynamic import
Object.defineProperty(process, 'contextIsolated', { value: true, configurable: true })

// We need to use a dynamic import so our vi.mock is applied first
const preloadImport = import('../../preload/index')

describe('Preload bridge', () => {
  let api: Record<string, any>

  beforeEach(async () => {
    await preloadImport
    api = exposeInMainWorldArg!
    vi.clearAllMocks()
    listeners.clear()
  })

  describe('context-isolated mode', () => {
    it('exposes api via contextBridge.exposeInMainWorld', () => {
      expect(api).toBeDefined()
      expect(typeof api).toBe('object')
    })

    it('has all expected invoke methods', () => {
      const expectedInvokeMethods = [
        'agentInput', 'agentStop', 'agentRestart', 'agentResize',
        'fileRead', 'fileWrite', 'fileTreeRequest',
        'gitDiff',
        'teamStart', 'teamStop',
        'sendTeammateInput', 'teammateResize'
      ]

      for (const method of expectedInvokeMethods) {
        expect(api).toHaveProperty(method)
        expect(typeof api[method]).toBe('function')
      }
    })

    it('has all expected event listener methods', () => {
      const expectedListenerMethods = [
        'onAgentOutput', 'onAgentStatusChange', 'onAgentInputNeeded',
        'onFileChanged', 'onFileTreeUpdate', 'onGitStatusUpdate',
        'onTeammateSpawned', 'onTeammateExited', 'onTeammateOutput',
        'onTeammateRenamed', 'onTeammateStatus',
        'onTeamAutoStarted', 'onMenuTeamStart', 'onMenuTeamStop'
      ]

      for (const method of expectedListenerMethods) {
        expect(api).toHaveProperty(method)
        expect(typeof api[method]).toBe('function')
      }
    })
  })

  describe('invoke channel wiring', () => {
    it('agentInput invokes AGENT_INPUT', async () => {
      const req = { agentId: 'a1', data: 'hello' }
      await api.agentInput(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.AGENT_INPUT, req)
    })

    it('agentStop invokes AGENT_STOP', async () => {
      const req = { agentId: 'a1' }
      await api.agentStop(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.AGENT_STOP, req)
    })

    it('agentRestart invokes AGENT_RESTART', async () => {
      const req = { agentId: 'a1' }
      await api.agentRestart(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.AGENT_RESTART, req)
    })

    it('agentResize invokes AGENT_RESIZE', async () => {
      const req = { agentId: 'a1', cols: 120, rows: 40 }
      await api.agentResize(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.AGENT_RESIZE, req)
    })

    it('fileRead invokes FILE_READ', async () => {
      const req = { filePath: '/test.ts' }
      await api.fileRead(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.FILE_READ, req)
    })

    it('fileWrite invokes FILE_WRITE', async () => {
      const req = { filePath: '/test.ts', content: 'code' }
      await api.fileWrite(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.FILE_WRITE, req)
    })

    it('fileTreeRequest invokes FILE_TREE_REQUEST', async () => {
      const req = { rootPath: '/project' }
      await api.fileTreeRequest(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.FILE_TREE_REQUEST, req)
    })

    it('gitDiff invokes GIT_DIFF', async () => {
      const req = { filePath: '/test.ts' }
      await api.gitDiff(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.GIT_DIFF, req)
    })

    it('teamStart invokes TEAM_START', async () => {
      const req = { config: { name: 'team', project: '/p', agents: [] } }
      await api.teamStart(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.TEAM_START, req)
    })

    it('teamStop invokes TEAM_STOP', async () => {
      await api.teamStop()
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.TEAM_STOP)
    })

    it('sendTeammateInput invokes TEAMMATE_INPUT', async () => {
      const req = { paneId: '%1', data: 'test' }
      await api.sendTeammateInput(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.TEAMMATE_INPUT, req)
    })

    it('teammateResize invokes TEAMMATE_RESIZE', async () => {
      const req = { paneId: '%1', cols: 100, rows: 30 }
      await api.teammateResize(req)
      expect(mockIpcRenderer.invoke).toHaveBeenCalledWith(RendererToMain.TEAMMATE_RESIZE, req)
    })
  })

  describe('event listener subscriptions (createOnHandler)', () => {
    it('onAgentOutput subscribes to the correct channel and delivers payload', () => {
      const cb = vi.fn()
      api.onAgentOutput(cb)

      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.AGENT_OUTPUT, expect.any(Function))

      emitIpcEvent(MainToRenderer.AGENT_OUTPUT, { agentId: 'a1', data: 'hello' })
      expect(cb).toHaveBeenCalledWith({ agentId: 'a1', data: 'hello' })
    })

    it('onAgentStatusChange subscribes correctly', () => {
      const cb = vi.fn()
      api.onAgentStatusChange(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.AGENT_STATUS_CHANGE, expect.any(Function))
    })

    it('onAgentInputNeeded subscribes correctly', () => {
      const cb = vi.fn()
      api.onAgentInputNeeded(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.AGENT_INPUT_NEEDED, expect.any(Function))
    })

    it('onFileChanged subscribes correctly', () => {
      const cb = vi.fn()
      api.onFileChanged(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.FILE_CHANGED, expect.any(Function))
    })

    it('onFileTreeUpdate subscribes correctly', () => {
      const cb = vi.fn()
      api.onFileTreeUpdate(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.FILE_TREE_UPDATE, expect.any(Function))
    })

    it('onGitStatusUpdate subscribes correctly', () => {
      const cb = vi.fn()
      api.onGitStatusUpdate(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.GIT_STATUS_UPDATE, expect.any(Function))
    })

    it('onTeammateSpawned subscribes correctly', () => {
      const cb = vi.fn()
      api.onTeammateSpawned(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.TEAM_TEAMMATE_SPAWNED, expect.any(Function))
    })

    it('onTeammateExited subscribes correctly', () => {
      const cb = vi.fn()
      api.onTeammateExited(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.TEAM_TEAMMATE_EXITED, expect.any(Function))
    })

    it('onTeammateOutput subscribes correctly', () => {
      const cb = vi.fn()
      api.onTeammateOutput(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.TEAMMATE_OUTPUT, expect.any(Function))
    })

    it('onTeammateRenamed subscribes correctly', () => {
      const cb = vi.fn()
      api.onTeammateRenamed(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.TEAM_TEAMMATE_RENAMED, expect.any(Function))
    })

    it('onTeammateStatus subscribes correctly', () => {
      const cb = vi.fn()
      api.onTeammateStatus(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith(MainToRenderer.TEAM_TEAMMATE_STATUS, expect.any(Function))
    })

    it('onTeamAutoStarted subscribes to team:auto-started', () => {
      const cb = vi.fn()
      api.onTeamAutoStarted(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith('team:auto-started', expect.any(Function))
    })

    it('onMenuTeamStart subscribes to menu:team-start', () => {
      const cb = vi.fn()
      api.onMenuTeamStart(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith('menu:team-start', expect.any(Function))
    })

    it('onMenuTeamStop subscribes to menu:team-stop', () => {
      const cb = vi.fn()
      api.onMenuTeamStop(cb)
      expect(mockIpcRenderer.on).toHaveBeenCalledWith('menu:team-stop', expect.any(Function))
    })
  })

  describe('unsubscribe (cleanup) functions', () => {
    it('returns an unsubscribe function that calls removeListener', () => {
      const cb = vi.fn()
      const unsub = api.onAgentOutput(cb)

      expect(typeof unsub).toBe('function')
      unsub()

      expect(mockIpcRenderer.removeListener).toHaveBeenCalledWith(
        MainToRenderer.AGENT_OUTPUT,
        expect.any(Function)
      )
    })

    it('unsubscribe prevents further event delivery', () => {
      const cb = vi.fn()
      const unsub = api.onAgentOutput(cb)

      // First event should be delivered
      emitIpcEvent(MainToRenderer.AGENT_OUTPUT, { agentId: 'a1', data: 'first' })
      expect(cb).toHaveBeenCalledTimes(1)

      // Unsubscribe
      unsub()

      // Second event should not be delivered (handler was removed from our tracking)
      emitIpcEvent(MainToRenderer.AGENT_OUTPUT, { agentId: 'a1', data: 'second' })
      expect(cb).toHaveBeenCalledTimes(1)
    })

    it('multiple subscriptions each get independent unsubscribe', () => {
      const cb1 = vi.fn()
      const cb2 = vi.fn()
      const unsub1 = api.onTeammateOutput(cb1)
      api.onTeammateOutput(cb2)

      // Unsub first, second should still work
      unsub1()

      emitIpcEvent(MainToRenderer.TEAMMATE_OUTPUT, { paneId: '%1', data: 'test' })
      expect(cb1).not.toHaveBeenCalled()
      expect(cb2).toHaveBeenCalledWith({ paneId: '%1', data: 'test' })
    })
  })
})
