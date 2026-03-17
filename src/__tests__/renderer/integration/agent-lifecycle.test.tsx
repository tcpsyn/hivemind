import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, act, within } from '@testing-library/react'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import type { AgentState } from '../../../shared/types'

const mockTerminal = vi.hoisted(() => ({
  open: vi.fn(),
  write: vi.fn(),
  dispose: vi.fn(),
  onData: vi.fn(() => ({ dispose: vi.fn() })),
  loadAddon: vi.fn(),
  focus: vi.fn(),
  options: {}
}))

const mockFitAddon = vi.hoisted(() => ({
  fit: vi.fn(),
  dispose: vi.fn()
}))

vi.mock('@xterm/xterm', () => ({
  Terminal: function () {
    return mockTerminal
  }
}))

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: function () {
    return mockFitAddon
  }
}))

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

type StatusCb = (payload: { agentId: string; status: string; agent: AgentState; tabId: string }) => void
type InputCb = (payload: { agentId: string; agentName: string; prompt?: string; tabId: string }) => void

let capturedStatusCb: StatusCb | null = null
let capturedInputCb: InputCb | null = null

const mockApi = {
  agentCreate: vi.fn(),
  agentInput: vi.fn().mockResolvedValue(undefined),
  agentStop: vi.fn().mockResolvedValue(undefined),
  agentRestart: vi.fn().mockResolvedValue(undefined),
  agentResize: vi.fn().mockResolvedValue(undefined),
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
  onTeammateSpawned: vi.fn().mockReturnValue(vi.fn()),
  onTeammateExited: vi.fn().mockReturnValue(vi.fn()),
  onTeammateRenamed: vi.fn().mockReturnValue(vi.fn()),
  onTeammateStatus: vi.fn().mockReturnValue(vi.fn()),
  onTeammateOutput: vi.fn().mockReturnValue(vi.fn()),
  onTeamAutoStarted: vi.fn().mockReturnValue(vi.fn()),
  onMenuTeamStart: vi.fn().mockReturnValue(vi.fn()),
  onMenuTeamStop: vi.fn().mockReturnValue(vi.fn()),
  onFileChanged: vi.fn().mockReturnValue(vi.fn()),
  onFileTreeUpdate: vi.fn().mockReturnValue(vi.fn()),
  onGitStatusUpdate: vi.fn().mockReturnValue(vi.fn())
}

beforeEach(() => {
  capturedStatusCb = null
  capturedInputCb = null

  Object.defineProperty(window, 'api', {
    value: mockApi,
    writable: true,
    configurable: true
  })
})

const AppShell = (await import('../../../renderer/src/components/AppShell')).default

function renderApp() {
  return render(
    <AppProvider>
      <AppShell />
    </AppProvider>
  )
}

describe('Agent Lifecycle Integration', () => {
  describe('Team start → agent render flow', () => {
    it('renders agents in sidebar after status-change event', async () => {
      const agent1 = makeAgent({ id: 'agent-1', name: 'architect', status: 'running' })
      renderApp()

      const agentList = screen.getByTestId('agent-list')
      expect(within(agentList).getByText('No agents')).toBeInTheDocument()

      await act(async () => {
        capturedStatusCb?.({
          agentId: 'agent-1',
          status: 'running',
          agent: agent1,
          tabId: 'tab-default'
        })
      })

      expect(within(agentList).queryByText('No agents')).not.toBeInTheDocument()
    })

    it('renders terminal panes in the grid for running agents', async () => {
      const agent1 = makeAgent({ id: 'agent-1', name: 'architect' })
      renderApp()

      await act(async () => {
        capturedStatusCb?.({
          agentId: 'agent-1',
          status: 'running',
          agent: agent1,
          tabId: 'tab-default'
        })
      })

      expect(screen.getByTestId('terminal-pane-agent-1')).toBeInTheDocument()
    })
  })

  describe('Status change → UI update flow', () => {
    it('updates sidebar status badge when agent status changes', async () => {
      const agent = makeAgent({ id: 'agent-1', name: 'architect', status: 'running' })
      renderApp()

      await act(async () => {
        capturedStatusCb?.({
          agentId: 'agent-1',
          status: 'running',
          agent,
          tabId: 'tab-default'
        })
      })

      const listItem = screen.getByTestId('agent-list-item-agent-1')
      expect(within(listItem).getByTestId('status-badge')).toHaveClass('running')

      await act(async () => {
        capturedStatusCb?.({
          agentId: 'agent-1',
          status: 'stopped',
          agent: { ...agent, status: 'stopped' },
          tabId: 'tab-default'
        })
      })

      expect(within(listItem).getByTestId('status-badge')).toHaveClass('stopped')
    })

    it('updates bottom bar status counts when agents change', async () => {
      const agent1 = makeAgent({ id: 'agent-1', status: 'running' })
      const agent2 = makeAgent({ id: 'agent-2', name: 'coder', status: 'running' })
      renderApp()

      await act(async () => {
        capturedStatusCb?.({ agentId: 'agent-1', status: 'running', agent: agent1, tabId: 'tab-default' })
      })

      await act(async () => {
        capturedStatusCb?.({ agentId: 'agent-2', status: 'running', agent: agent2, tabId: 'tab-default' })
      })

      const bottombar = screen.getByTestId('bottombar')
      expect(within(bottombar).getByText('2 running')).toBeInTheDocument()
    })
  })

  describe('Input-needed → notification flow', () => {
    it('marks agent as needs-input when input-needed event fires', async () => {
      const agent = makeAgent({ id: 'agent-1', name: 'architect' })
      renderApp()

      await act(async () => {
        capturedStatusCb?.({ agentId: 'agent-1', status: 'running', agent, tabId: 'tab-default' })
      })

      await act(async () => {
        capturedInputCb?.({ agentId: 'agent-1', agentName: 'architect', tabId: 'tab-default' })
      })

      const listItem = screen.getByTestId('agent-list-item-agent-1')
      expect(listItem).toHaveClass('needs-input')
    })

    it('applies needs-input class to agent list item', async () => {
      const agent = makeAgent({ id: 'agent-1', name: 'architect' })
      renderApp()

      await act(async () => {
        capturedStatusCb?.({ agentId: 'agent-1', status: 'running', agent, tabId: 'tab-default' })
      })

      await act(async () => {
        capturedInputCb?.({ agentId: 'agent-1', agentName: 'architect', tabId: 'tab-default' })
      })

      const listItem = screen.getByTestId('agent-list-item-agent-1')
      expect(listItem).toHaveClass('needs-input')
    })

    it('applies needs-input class to terminal pane', async () => {
      const agent = makeAgent({ id: 'agent-1', name: 'architect' })
      renderApp()

      await act(async () => {
        capturedStatusCb?.({ agentId: 'agent-1', status: 'running', agent, tabId: 'tab-default' })
      })

      await act(async () => {
        capturedInputCb?.({ agentId: 'agent-1', agentName: 'architect', tabId: 'tab-default' })
      })

      const pane = screen.getByTestId('terminal-pane-agent-1')
      expect(pane).toHaveClass('needs-input')
    })
  })

  describe('Agent stop/restart flow', () => {
    it('keeps agent pane visible when status changes to stopped', async () => {
      const agent = makeAgent({ id: 'agent-1' })
      renderApp()

      await act(async () => {
        capturedStatusCb?.({ agentId: 'agent-1', status: 'running', agent, tabId: 'tab-default' })
      })
      expect(screen.getByTestId('terminal-pane-agent-1')).toBeInTheDocument()

      await act(async () => {
        capturedStatusCb?.({
          agentId: 'agent-1',
          status: 'stopped',
          agent: { ...agent, status: 'stopped' },
          tabId: 'tab-default'
        })
      })

      expect(screen.getByTestId('terminal-pane-agent-1')).toBeInTheDocument()
    })
  })
})
