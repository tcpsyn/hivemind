import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import type { ReactNode } from 'react'
import { AppProvider, useAppState } from '../../../renderer/src/state/AppContext'
import { useAgentManager } from '../../../renderer/src/hooks/useAgentManager'
import type { AgentState, TeamConfig } from '../../../shared/types'

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

const mockTeamConfig: TeamConfig = {
  name: 'test-team',
  project: '/tmp/project',
  agents: [
    { name: 'architect', role: 'Lead designer', command: 'claude --role architect' },
    { name: 'coder', role: 'Implementation', command: 'claude --role coder' }
  ]
}

type StatusCb = (payload: { agentId: string; status: string; agent: AgentState }) => void
type InputCb = (payload: { agentId: string; agentName: string; prompt?: string }) => void
type AutoStartCb = (data: { projectName: string; projectPath: string; agents: AgentState[] }) => void
type MenuStartCb = (config: unknown) => void
type MenuStopCb = () => void
type SpawnedCb = (payload: { agent: AgentState; paneId: string; sessionName: string }) => void
type ExitedCb = (payload: { agentId: string; paneId: string; sessionName: string; exitCode: number }) => void
type RenamedCb = (payload: { agentId: string; name: string }) => void
type TeammateStatusCb = (payload: { agentId: string; model?: string; contextPercent?: string; branch?: string }) => void
type TeammateOutputCb = (payload: { paneId: string; data: string }) => void

let capturedStatusCb: StatusCb | null = null
let capturedInputCb: InputCb | null = null
let capturedAutoStartCb: AutoStartCb | null = null
let capturedMenuStartCb: MenuStartCb | null = null
let capturedMenuStopCb: MenuStopCb | null = null
let capturedSpawnedCb: SpawnedCb | null = null
let capturedExitedCb: ExitedCb | null = null
let capturedRenamedCb: RenamedCb | null = null
let capturedTeammateStatusCb: TeammateStatusCb | null = null
// eslint-disable-next-line @typescript-eslint/no-unused-vars
let _capturedTeammateOutputCb: TeammateOutputCb | null = null

beforeEach(() => {
  capturedStatusCb = null
  capturedInputCb = null
  capturedAutoStartCb = null
  capturedMenuStartCb = null
  capturedMenuStopCb = null
  capturedSpawnedCb = null
  capturedExitedCb = null
  capturedRenamedCb = null
  capturedTeammateStatusCb = null
  _capturedTeammateOutputCb = null

  Object.defineProperty(window, 'api', {
    value: {
      agentCreate: vi.fn(),
      agentInput: vi.fn(),
      agentStop: vi.fn().mockResolvedValue(undefined),
      agentRestart: vi.fn().mockResolvedValue(undefined),
      agentResize: vi.fn(),
      fileRead: vi.fn(),
      fileWrite: vi.fn(),
      fileTreeRequest: vi.fn().mockResolvedValue([]),
      gitDiff: vi.fn(),
      gitStatus: vi.fn(),
      teamStart: vi.fn(),
      teamStop: vi.fn().mockResolvedValue(undefined),
      onAgentOutput: vi.fn().mockReturnValue(vi.fn()),
      onAgentStatusChange: vi.fn().mockImplementation((cb: StatusCb) => {
        capturedStatusCb = cb
        return vi.fn()
      }),
      onAgentInputNeeded: vi.fn().mockImplementation((cb: InputCb) => {
        capturedInputCb = cb
        return vi.fn()
      }),
      onFileChanged: vi.fn().mockReturnValue(vi.fn()),
      onFileTreeUpdate: vi.fn().mockReturnValue(vi.fn()),
      onGitStatusUpdate: vi.fn().mockReturnValue(vi.fn()),
      onTeamAutoStarted: vi.fn().mockImplementation((cb: AutoStartCb) => {
        capturedAutoStartCb = cb
        return vi.fn()
      }),
      onMenuTeamStart: vi.fn().mockImplementation((cb: MenuStartCb) => {
        capturedMenuStartCb = cb
        return vi.fn()
      }),
      onMenuTeamStop: vi.fn().mockImplementation((cb: MenuStopCb) => {
        capturedMenuStopCb = cb
        return vi.fn()
      }),
      onTeammateSpawned: vi.fn().mockImplementation((cb: SpawnedCb) => {
        capturedSpawnedCb = cb
        return vi.fn()
      }),
      onTeammateExited: vi.fn().mockImplementation((cb: ExitedCb) => {
        capturedExitedCb = cb
        return vi.fn()
      }),
      onTeammateRenamed: vi.fn().mockImplementation((cb: RenamedCb) => {
        capturedRenamedCb = cb
        return vi.fn()
      }),
      onTeammateStatus: vi.fn().mockImplementation((cb: TeammateStatusCb) => {
        capturedTeammateStatusCb = cb
        return vi.fn()
      }),
      onTeammateOutput: vi.fn().mockImplementation((cb: TeammateOutputCb) => {
        _capturedTeammateOutputCb = cb
        return vi.fn()
      }),
      sendTeammateInput: vi.fn().mockResolvedValue(undefined)
    },
    writable: true,
    configurable: true
  })
})

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

function renderAgentManager() {
  return renderHook(() => useAgentManager(), { wrapper })
}

function renderWithState() {
  return renderHook(
    () => ({
      manager: useAgentManager(),
      state: useAppState()
    }),
    { wrapper }
  )
}

describe('useAgentManager', () => {
  describe('IPC subscriptions', () => {
    it('subscribes to agent:status-change and agent:input-needed on mount', () => {
      renderAgentManager()

      expect(window.api.onAgentStatusChange).toHaveBeenCalledTimes(1)
      expect(window.api.onAgentInputNeeded).toHaveBeenCalledTimes(1)
    })

    it('unsubscribes from all events on unmount', () => {
      const unsubStatus = vi.fn()
      const unsubInput = vi.fn()

      ;(window.api.onAgentStatusChange as ReturnType<typeof vi.fn>).mockReturnValue(unsubStatus)
      ;(window.api.onAgentInputNeeded as ReturnType<typeof vi.fn>).mockReturnValue(unsubInput)

      const { unmount } = renderAgentManager()
      unmount()

      expect(unsubStatus).toHaveBeenCalledTimes(1)
      expect(unsubInput).toHaveBeenCalledTimes(1)
    })
  })

  describe('startTeam', () => {
    it('calls window.api.teamStart and dispatches ADD_AGENT for each returned agent', async () => {
      const agent1 = makeAgent({ id: 'agent-1', name: 'architect' })
      const agent2 = makeAgent({ id: 'agent-2', name: 'coder' })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent1, agent2]
      })

      const { result } = renderWithState()

      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })

      expect(window.api.teamStart).toHaveBeenCalledWith({ config: mockTeamConfig })
      expect(result.current.state.agents.size).toBe(2)
      expect(result.current.state.agents.get('agent-1')?.name).toBe('architect')
      expect(result.current.state.agents.get('agent-2')?.name).toBe('coder')
    })

    it('sets the project name and path from team config', async () => {
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({ agents: [] })

      const { result } = renderWithState()

      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })

      expect(result.current.state.project.name).toBe('test-team')
      expect(result.current.state.project.path).toBe('/tmp/project')
    })
  })

  describe('stopTeam', () => {
    it('calls window.api.teamStop and removes all agents from state', async () => {
      const agent1 = makeAgent({ id: 'agent-1' })
      const agent2 = makeAgent({ id: 'agent-2' })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent1, agent2]
      })

      const { result } = renderWithState()

      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })
      expect(result.current.state.agents.size).toBe(2)

      await act(async () => {
        await result.current.manager.stopTeam()
      })

      expect(window.api.teamStop).toHaveBeenCalled()
      expect(result.current.state.agents.size).toBe(0)
    })
  })

  describe('stopAgent', () => {
    it('calls window.api.agentStop with the agent ID', async () => {
      const { result } = renderAgentManager()

      await act(async () => {
        await result.current.stopAgent('agent-1')
      })

      expect(window.api.agentStop).toHaveBeenCalledWith({ agentId: 'agent-1' })
    })
  })

  describe('restartAgent', () => {
    it('calls window.api.agentRestart with the agent ID', async () => {
      const { result } = renderAgentManager()

      await act(async () => {
        await result.current.restartAgent('agent-1')
      })

      expect(window.api.agentRestart).toHaveBeenCalledWith({ agentId: 'agent-1' })
    })
  })

  describe('event handling', () => {
    it('dispatches UPDATE_AGENT on status-change for known agent', async () => {
      const agent1 = makeAgent({ id: 'agent-1', status: 'running' })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent1]
      })

      const { result } = renderWithState()

      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })
      expect(result.current.state.agents.get('agent-1')?.status).toBe('running')

      act(() => {
        capturedStatusCb?.({
          agentId: 'agent-1',
          status: 'stopped',
          agent: { ...agent1, status: 'stopped' }
        })
      })

      expect(result.current.state.agents.get('agent-1')?.status).toBe('stopped')
    })

    it('dispatches ADD_AGENT on status-change for unknown agent', () => {
      const agent = makeAgent({ id: 'agent-new', name: 'newcomer', status: 'running' })

      const { result } = renderWithState()

      act(() => {
        capturedStatusCb?.({
          agentId: 'agent-new',
          status: 'running',
          agent
        })
      })

      expect(result.current.state.agents.get('agent-new')?.name).toBe('newcomer')
    })

    it('dispatches UPDATE_AGENT with needsInput on input-needed event', async () => {
      const agent1 = makeAgent({ id: 'agent-1', needsInput: false })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent1]
      })

      const { result } = renderWithState()

      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })

      act(() => {
        capturedInputCb?.({
          agentId: 'agent-1',
          agentName: 'architect'
        })
      })

      expect(result.current.state.agents.get('agent-1')?.needsInput).toBe(true)
    })

    it('adds a notification on input-needed event', async () => {
      const agent1 = makeAgent({ id: 'agent-1' })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent1]
      })

      const { result } = renderWithState()

      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })

      act(() => {
        capturedInputCb?.({
          agentId: 'agent-1',
          agentName: 'architect'
        })
      })

      expect(result.current.state.notifications.length).toBe(1)
      expect(result.current.state.notifications[0].agentId).toBe('agent-1')
      expect(result.current.state.notifications[0].agentName).toBe('architect')
      expect(result.current.state.notifications[0].read).toBe(false)
    })
  })

  describe('isTeamRunning', () => {
    it('returns false initially', () => {
      const { result } = renderAgentManager()
      expect(result.current.isTeamRunning).toBe(false)
    })

    it('returns true after starting a team', async () => {
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [makeAgent()]
      })
      const { result } = renderAgentManager()

      await act(async () => {
        await result.current.startTeam(mockTeamConfig)
      })

      expect(result.current.isTeamRunning).toBe(true)
    })

    it('returns false after stopping a team', async () => {
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [makeAgent()]
      })
      const { result } = renderAgentManager()

      await act(async () => {
        await result.current.startTeam(mockTeamConfig)
      })
      await act(async () => {
        await result.current.stopTeam()
      })

      expect(result.current.isTeamRunning).toBe(false)
    })
  })

  describe('menu integration', () => {
    it('subscribes to onMenuTeamStart on mount', () => {
      renderAgentManager()
      expect(window.api.onMenuTeamStart).toHaveBeenCalledTimes(1)
    })

    it('subscribes to onMenuTeamStop on mount', () => {
      renderAgentManager()
      expect(window.api.onMenuTeamStop).toHaveBeenCalledTimes(1)
    })

    it('triggers team start when menu:team-start fires', async () => {
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [makeAgent({ id: 'menu-agent-1', name: 'lead' })]
      })

      const { result } = renderWithState()

      await act(async () => {
        capturedMenuStartCb?.(mockTeamConfig)
        // Allow the async teamStart to complete
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(window.api.teamStart).toHaveBeenCalledWith({ config: mockTeamConfig })
      expect(result.current.manager.isTeamRunning).toBe(true)
    })

    it('triggers team stop when menu:team-stop fires', async () => {
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [makeAgent()]
      })

      const { result } = renderWithState()

      // Start a team first
      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })
      expect(result.current.manager.isTeamRunning).toBe(true)

      // Fire menu stop
      await act(async () => {
        capturedMenuStopCb?.()
        await new Promise((resolve) => setTimeout(resolve, 10))
      })

      expect(window.api.teamStop).toHaveBeenCalled()
      expect(result.current.manager.isTeamRunning).toBe(false)
    })
  })

  describe('auto-start', () => {
    it('subscribes to onTeamAutoStarted on mount', () => {
      renderAgentManager()
      expect(window.api.onTeamAutoStarted).toHaveBeenCalledTimes(1)
    })

    it('adds agents and sets project when auto-start fires', () => {
      const agent1 = makeAgent({ id: 'auto-1', name: 'lead' })
      const agent2 = makeAgent({ id: 'auto-2', name: 'coder', isTeammate: true })

      const { result } = renderWithState()

      act(() => {
        capturedAutoStartCb?.({
          projectName: 'my-project',
          projectPath: '/home/user/my-project',
          agents: [agent1, agent2]
        })
      })

      expect(result.current.state.project.name).toBe('my-project')
      expect(result.current.state.project.path).toBe('/home/user/my-project')
      expect(result.current.state.agents.size).toBe(2)
      expect(result.current.manager.isTeamRunning).toBe(true)
    })

    it('sets first non-teammate agent as team lead', () => {
      const lead = makeAgent({ id: 'lead-1', name: 'lead', isTeammate: false })
      const teammate = makeAgent({ id: 'tm-1', name: 'researcher', isTeammate: true })

      const { result } = renderWithState()

      act(() => {
        capturedAutoStartCb?.({
          projectName: 'proj',
          projectPath: '/proj',
          agents: [lead, teammate]
        })
      })

      expect(result.current.state.layout.teamLeadId).toBe('lead-1')
    })
  })

  describe('teammate events', () => {
    it('adds agent when teammate-spawned fires', () => {
      const { result } = renderWithState()

      act(() => {
        capturedSpawnedCb?.({
          agent: makeAgent({ id: 'tmux-%1', name: 'researcher', isTeammate: true }),
          paneId: '%1',
          sessionName: 'test-team'
        })
      })

      expect(result.current.state.agents.has('tmux-%1')).toBe(true)
      expect(result.current.state.agents.get('tmux-%1')?.name).toBe('researcher')
    })

    it('removes agent when teammate-exited fires', async () => {
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [makeAgent({ id: 'tmux-%1', name: 'researcher', isTeammate: true })]
      })

      const { result } = renderWithState()

      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })

      act(() => {
        capturedExitedCb?.({
          agentId: 'tmux-%1',
          paneId: '%1',
          sessionName: 'test',
          exitCode: 0
        })
      })

      expect(result.current.state.agents.has('tmux-%1')).toBe(false)
    })

    it('updates agent name when teammate-renamed fires', async () => {
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [makeAgent({ id: 'tmux-%1', name: 'bash', isTeammate: true })]
      })

      const { result } = renderWithState()

      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })

      act(() => {
        capturedRenamedCb?.({ agentId: 'tmux-%1', name: 'researcher' })
      })

      expect(result.current.state.agents.get('tmux-%1')?.name).toBe('researcher')
    })

    it('updates agent status info when teammate-status fires', async () => {
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [makeAgent({ id: 'tmux-%1', name: 'researcher', isTeammate: true })]
      })

      const { result } = renderWithState()

      await act(async () => {
        await result.current.manager.startTeam(mockTeamConfig)
      })

      act(() => {
        capturedTeammateStatusCb?.({
          agentId: 'tmux-%1',
          model: 'Opus 4.6',
          contextPercent: '15%',
          branch: 'feature/test'
        })
      })

      const agent = result.current.state.agents.get('tmux-%1')
      expect(agent?.model).toBe('Opus 4.6')
      expect(agent?.contextPercent).toBe('15%')
      expect(agent?.branch).toBe('feature/test')
    })
  })
})
