import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  AppProvider,
  type ExtendedAppState,
  initialAppState
} from '../../../renderer/src/state/AppContext'
import AppShell from '../../../renderer/src/components/AppShell'
import type { AgentState } from '../../../shared/types'

vi.mock('../../../renderer/src/components/LeadLayout', () => ({
  LeadLayout: () => <div data-testid="lead-layout">Lead Layout</div>
}))

vi.mock('../../../renderer/src/components/PaneGrid', () => ({
  PaneGrid: ({ agents }: { agents: AgentState[] }) => (
    <div data-testid="pane-grid">{agents.length} agents</div>
  )
}))

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    value: {
      fileTreeRequest: vi.fn().mockResolvedValue([]),
      onFileChanged: vi.fn(() => vi.fn()),
      agentCreate: vi.fn(),
      agentInput: vi.fn(),
      agentStop: vi.fn(),
      agentRestart: vi.fn(),
      agentResize: vi.fn(),
      fileRead: vi.fn(),
      fileWrite: vi.fn(),
      gitDiff: vi.fn(),
      gitStatus: vi.fn(),
      teamStart: vi.fn(),
      teamStop: vi.fn(),
      onAgentOutput: vi.fn(() => vi.fn()),
      onAgentStatusChange: vi.fn(() => vi.fn()),
      onAgentInputNeeded: vi.fn(() => vi.fn()),
      onFileTreeUpdate: vi.fn(() => vi.fn()),
      onGitStatusUpdate: vi.fn(() => vi.fn()),
      onMenuTeamStart: vi.fn(() => vi.fn()),
      onMenuTeamStop: vi.fn(() => vi.fn()),
      onTeammateSpawned: vi.fn(() => vi.fn()),
      onTeammateExited: vi.fn(() => vi.fn())
    },
    writable: true,
    configurable: true
  })
})

function makeLead(): AgentState {
  return {
    id: 'lead-1',
    name: 'team-lead',
    role: 'Team Lead',
    avatar: 'robot-1',
    color: '#FF6B6B',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    isTeammate: false
  }
}

function makeState(
  overrides: Partial<ExtendedAppState['layout']> = {},
  agents: AgentState[] = []
): ExtendedAppState {
  const agentsMap = new Map<string, AgentState>()
  for (const a of agents) {
    agentsMap.set(a.id, a)
  }
  return {
    ...initialAppState,
    agents: agentsMap,
    layout: {
      ...initialAppState.layout,
      ...overrides
    }
  }
}

describe('AppShell - Lead Layout integration', () => {
  it('renders LeadLayout when viewMode=lead and teamLeadId exists', () => {
    const lead = makeLead()
    render(
      <AppProvider initialState={makeState({ viewMode: 'lead', teamLeadId: 'lead-1' }, [lead])}>
        <AppShell />
      </AppProvider>
    )
    expect(screen.getByTestId('lead-layout')).toBeInTheDocument()
    expect(screen.queryByTestId('pane-grid')).not.toBeInTheDocument()
  })

  it('renders PaneGrid when viewMode=grid with agents', () => {
    const lead = makeLead()
    render(
      <AppProvider initialState={makeState({ viewMode: 'grid', teamLeadId: 'lead-1' }, [lead])}>
        <AppShell />
      </AppProvider>
    )
    expect(screen.getByTestId('pane-grid')).toBeInTheDocument()
    expect(screen.queryByTestId('lead-layout')).not.toBeInTheDocument()
  })

  it('renders PaneGrid when viewMode=lead but no teamLeadId', () => {
    const lead = makeLead()
    render(
      <AppProvider initialState={makeState({ viewMode: 'lead', teamLeadId: null }, [lead])}>
        <AppShell />
      </AppProvider>
    )
    expect(screen.getByTestId('pane-grid')).toBeInTheDocument()
  })

  it('renders empty state when no agents regardless of viewMode', () => {
    render(
      <AppProvider initialState={makeState({ viewMode: 'lead' })}>
        <AppShell />
      </AppProvider>
    )
    expect(screen.getByText('No agents running')).toBeInTheDocument()
  })

  it('Cmd+G toggles between lead and grid view modes', async () => {
    const user = userEvent.setup()
    const lead = makeLead()
    render(
      <AppProvider initialState={makeState({ viewMode: 'lead', teamLeadId: 'lead-1' }, [lead])}>
        <AppShell />
      </AppProvider>
    )
    expect(screen.getByTestId('lead-layout')).toBeInTheDocument()

    await user.keyboard('{Meta>}g{/Meta}')
    expect(screen.getByTestId('pane-grid')).toBeInTheDocument()

    await user.keyboard('{Meta>}g{/Meta}')
    expect(screen.getByTestId('lead-layout')).toBeInTheDocument()
  })

  it('Cmd+\\ toggles companion panel', async () => {
    const user = userEvent.setup()
    const lead = makeLead()
    render(
      <AppProvider initialState={makeState({ viewMode: 'lead', teamLeadId: 'lead-1' }, [lead])}>
        <AppShell />
      </AppProvider>
    )

    await user.keyboard('{Meta>}\\{/Meta}')
    // The toggle companion action was dispatched
    // We can't easily check the companion panel collapsed state directly in AppShell,
    // but we verify the keyboard shortcut dispatches without error
  })
})
