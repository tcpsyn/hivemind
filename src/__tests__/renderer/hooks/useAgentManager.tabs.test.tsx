import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { type ReactNode } from 'react'
import { AppProvider, useAppState, useAppDispatch } from '../../../renderer/src/state/AppContext'
import { useAgentManager } from '../../../renderer/src/hooks/useAgentManager'
import type { AgentState, TeamConfig } from '../../../shared/types'
import type {
  AgentStatusChangePayload,
  AgentInputNeededPayload,
  TeammateSpawnedPayload,
  TeammateExitedPayload,
  TeammateRenamedPayload
} from '../../../shared/ipc-channels'

type StatusCb = (payload: AgentStatusChangePayload) => void
type InputCb = (payload: AgentInputNeededPayload) => void
type SpawnedCb = (payload: TeammateSpawnedPayload) => void
type ExitedCb = (payload: TeammateExitedPayload) => void
type RenamedCb = (payload: TeammateRenamedPayload) => void

let capturedStatusCb: StatusCb | null = null
let capturedInputCb: InputCb | null = null
let capturedSpawnedCb: SpawnedCb | null = null
let capturedExitedCb: ExitedCb | null = null
let capturedRenamedCb: RenamedCb | null = null

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
    ...overrides
  }
}

beforeEach(() => {
  capturedStatusCb = null
  capturedInputCb = null
  capturedSpawnedCb = null
  capturedExitedCb = null
  capturedRenamedCb = null
  Object.defineProperty(window, 'api', {
    value: {
      teamStart: vi.fn().mockResolvedValue({ agents: [] }),
      teamStop: vi.fn().mockResolvedValue(undefined),
      agentStop: vi.fn().mockResolvedValue(undefined),
      agentRestart: vi.fn().mockResolvedValue(undefined),
      onAgentStatusChange: vi.fn().mockImplementation((cb: StatusCb) => {
        capturedStatusCb = cb
        return vi.fn()
      }),
      onAgentInputNeeded: vi.fn().mockImplementation((cb: InputCb) => {
        capturedInputCb = cb
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
      onTeammateStatus: vi.fn(() => vi.fn()),
      onTeammateOutput: vi.fn(() => vi.fn()),
      onTeamAutoStarted: vi.fn(() => vi.fn()),
      onMenuTeamStart: vi.fn(() => vi.fn()),
      onMenuTeamStop: vi.fn(() => vi.fn())
    },
    writable: true,
    configurable: true
  })
})

function wrapper({ children }: { children: ReactNode }) {
  return <AppProvider>{children}</AppProvider>
}

function renderWithState() {
  return renderHook(
    () => ({
      manager: useAgentManager(),
      state: useAppState(),
      dispatch: useAppDispatch()
    }),
    { wrapper }
  )
}

describe('useAgentManager — Tab-Aware', () => {
  describe('IPC subscriptions', () => {
    it('subscribes to all IPC events on mount', () => {
      renderWithState()

      expect(window.api.onAgentStatusChange).toHaveBeenCalled()
      expect(window.api.onAgentInputNeeded).toHaveBeenCalled()
      expect(window.api.onTeammateSpawned).toHaveBeenCalled()
      expect(window.api.onTeammateExited).toHaveBeenCalled()
      expect(window.api.onTeammateRenamed).toHaveBeenCalled()
      expect(window.api.onTeammateStatus).toHaveBeenCalled()
    })
  })

  describe('startTeam', () => {
    it('includes tabId in teamStart IPC call', async () => {
      const agent = makeAgent({ id: 'lead-1', name: 'lead' })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent]
      })

      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId

      const config: TeamConfig = {
        name: 'test-team',
        project: '/path',
        agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
      }

      await act(async () => {
        await result.current.manager.startTeam(config)
      })

      expect(window.api.teamStart).toHaveBeenCalledWith({ tabId, config })
    })

    it('adds agents to the active tab state', async () => {
      const agent = makeAgent({ id: 'lead-1', name: 'lead' })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent]
      })

      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId

      await act(async () => {
        await result.current.manager.startTeam({
          name: 'test',
          project: '/path',
          agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
        })
      })

      const tab = result.current.state.tabs.get(tabId)!
      expect(tab.agents.has('lead-1')).toBe(true)
      expect(tab.teamStatus).toBe('running')
    })

    it('sets team lead on the correct tab', async () => {
      const agent = makeAgent({ id: 'lead-1', name: 'lead', isTeammate: false })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent]
      })

      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId

      await act(async () => {
        await result.current.manager.startTeam({
          name: 'test',
          project: '/path',
          agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
        })
      })

      expect(result.current.state.tabs.get(tabId)!.layout.teamLeadId).toBe('lead-1')
    })
  })

  describe('stopTeam', () => {
    it('includes tabId in teamStop IPC call', async () => {
      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId

      await act(async () => {
        await result.current.manager.stopTeam()
      })

      expect(window.api.teamStop).toHaveBeenCalledWith({ tabId })
    })

    it('clears agents and sets status to stopped', async () => {
      const agent = makeAgent({ id: 'lead-1' })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent]
      })

      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId

      await act(async () => {
        await result.current.manager.startTeam({
          name: 'test',
          project: '/path',
          agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
        })
      })

      expect(result.current.state.tabs.get(tabId)!.agents.size).toBe(1)

      await act(async () => {
        await result.current.manager.stopTeam()
      })

      expect(result.current.state.tabs.get(tabId)!.agents.size).toBe(0)
      expect(result.current.state.tabs.get(tabId)!.teamStatus).toBe('stopped')
    })
  })

  describe('event routing by tabId', () => {
    it('agent status change routes to correct tab via payload.tabId', async () => {
      const { result } = renderWithState()

      // Create a second tab
      act(() => {
        result.current.dispatch({
          type: 'CREATE_TAB',
          payload: { id: 'tab-2', projectPath: '/b', projectName: 'b' }
        })
      })

      const defaultTabId = result.current.state.globalLayout.tabOrder[0]
      const agent = makeAgent({ id: 'new-agent', status: 'running' })

      // Fire status event targeting the default tab
      act(() => {
        capturedStatusCb?.({
          tabId: defaultTabId,
          agentId: 'new-agent',
          status: 'running',
          agent
        })
      })

      // Agent should be in the default tab, not tab-2
      expect(result.current.state.tabs.get(defaultTabId)!.agents.has('new-agent')).toBe(true)
      expect(result.current.state.tabs.get('tab-2')!.agents.has('new-agent')).toBe(false)
    })

    it('input needed event routes notification to correct tab', () => {
      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId

      // First, add the agent
      const agent = makeAgent({ id: 'agent-1' })
      act(() => {
        capturedStatusCb?.({
          tabId,
          agentId: 'agent-1',
          status: 'running',
          agent
        })
      })

      // Fire input needed
      act(() => {
        capturedInputCb?.({
          tabId,
          agentId: 'agent-1',
          agentName: 'coder'
        })
      })

      const tab = result.current.state.tabs.get(tabId)!
      expect(tab.agents.get('agent-1')!.needsInput).toBe(true)
      expect(tab.notifications).toHaveLength(1)
      expect(tab.notifications[0].message).toContain('needs input')
    })

    it('teammate spawned routes to correct tab', () => {
      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId
      const teammate = makeAgent({ id: 'tm-1', isTeammate: true, paneId: '%1' })

      act(() => {
        capturedSpawnedCb?.({
          tabId,
          agentId: 'tm-1',
          agent: teammate,
          paneId: '%1',
          sessionName: 'test-session'
        })
      })

      expect(result.current.state.tabs.get(tabId)!.agents.has('tm-1')).toBe(true)
    })

    it('teammate exited removes from correct tab', () => {
      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId
      const teammate = makeAgent({ id: 'tm-1', isTeammate: true, paneId: '%1' })

      // Spawn then exit
      act(() => {
        capturedSpawnedCb?.({
          tabId,
          agentId: 'tm-1',
          agent: teammate,
          paneId: '%1',
          sessionName: 'test-session'
        })
      })
      act(() => {
        capturedExitedCb?.({
          tabId,
          agentId: 'tm-1',
          paneId: '%1',
          sessionName: 'test-session',
          exitCode: 0
        })
      })

      expect(result.current.state.tabs.get(tabId)!.agents.has('tm-1')).toBe(false)
    })

    it('teammate renamed updates correct tab', () => {
      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId
      const teammate = makeAgent({ id: 'tm-1', name: 'old-name', isTeammate: true })

      act(() => {
        capturedSpawnedCb?.({
          tabId,
          agentId: 'tm-1',
          agent: teammate,
          paneId: '%1',
          sessionName: 'sess'
        })
      })
      act(() => {
        capturedRenamedCb?.({
          tabId,
          agentId: 'tm-1',
          name: 'new-name',
          paneId: '%1'
        })
      })

      expect(result.current.state.tabs.get(tabId)!.agents.get('tm-1')!.name).toBe('new-name')
    })
  })

  describe('isTeamRunning', () => {
    it('derives from active tab teamStatus', async () => {
      const agent = makeAgent({ id: 'lead-1' })
      ;(window.api.teamStart as ReturnType<typeof vi.fn>).mockResolvedValue({
        agents: [agent]
      })

      const { result } = renderWithState()

      expect(result.current.manager.isTeamRunning).toBe(false)

      await act(async () => {
        await result.current.manager.startTeam({
          name: 'test',
          project: '/path',
          agents: [{ name: 'lead', role: 'Lead', command: 'claude' }]
        })
      })

      expect(result.current.manager.isTeamRunning).toBe(true)
    })
  })

  describe('stopAgent / restartAgent include tabId', () => {
    it('stopAgent passes tabId', async () => {
      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId

      await act(async () => {
        await result.current.manager.stopAgent('agent-1')
      })

      expect(window.api.agentStop).toHaveBeenCalledWith({ tabId, agentId: 'agent-1' })
    })

    it('restartAgent passes tabId', async () => {
      const { result } = renderWithState()
      const tabId = result.current.state.activeTabId

      await act(async () => {
        await result.current.manager.restartAgent('agent-1')
      })

      expect(window.api.agentRestart).toHaveBeenCalledWith({ tabId, agentId: 'agent-1' })
    })
  })
})
