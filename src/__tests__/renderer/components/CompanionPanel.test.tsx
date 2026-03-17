import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CompanionPanel } from '../../../renderer/src/components/CompanionPanel'
import {
  AppProvider,
  type ExtendedAppState,
  initialAppState
} from '../../../renderer/src/state/AppContext'
import type { AgentState } from '../../../shared/types'

vi.mock('../../../renderer/src/components/TerminalPane', () => ({
  TerminalPane: ({ agent }: { agent: AgentState }) => (
    <div data-testid={`terminal-pane-${agent.id}`}>{agent.name}</div>
  )
}))

function makeTeammate(id: string, overrides: Partial<AgentState> = {}): AgentState {
  return {
    id,
    name: `teammate-${id}`,
    role: 'test',
    avatar: 'robot-2',
    color: '#4ecdc4',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    isTeammate: true,
    agentType: 'general-purpose',
    ...overrides
  }
}

function makeStateWith(teammates: AgentState[], selectedId: string | null = null): ExtendedAppState {
  const agents = new Map<string, AgentState>()
  for (const t of teammates) {
    agents.set(t.id, t)
  }
  return {
    ...initialAppState,
    agents,
    layout: {
      ...initialAppState.layout,
      selectedTeammateId: selectedId
    }
  }
}

beforeEach(() => {
  Object.defineProperty(window, 'api', {
    value: {
      agentInput: vi.fn().mockResolvedValue(undefined)
    },
    writable: true,
    configurable: true
  })
})

describe('CompanionPanel', () => {
  it('shows empty state when no teammates', () => {
    render(
      <AppProvider initialState={makeStateWith([])}>
        <CompanionPanel teammates={[]} />
      </AppProvider>
    )
    expect(screen.getByText('Waiting for teammates...')).toBeInTheDocument()
  })

  it('renders teammate cards for each teammate', () => {
    const teammates = [makeTeammate('t1'), makeTeammate('t2')]
    render(
      <AppProvider initialState={makeStateWith(teammates)}>
        <CompanionPanel teammates={teammates} />
      </AppProvider>
    )
    expect(screen.getByTestId('teammate-card-t1')).toBeInTheDocument()
    expect(screen.getByTestId('teammate-card-t2')).toBeInTheDocument()
  })

  it('shows terminal pane for selected teammate', () => {
    const teammates = [makeTeammate('t1')]
    render(
      <AppProvider initialState={makeStateWith(teammates, 't1')}>
        <CompanionPanel teammates={teammates} />
      </AppProvider>
    )
    expect(screen.getByTestId('terminal-pane-t1')).toBeInTheDocument()
  })

  it('shows empty terminal area when no teammate is selected', () => {
    const teammates = [makeTeammate('t1')]
    render(
      <AppProvider initialState={makeStateWith(teammates, null)}>
        <CompanionPanel teammates={teammates} />
      </AppProvider>
    )
    expect(screen.getByText('Select a teammate to view output')).toBeInTheDocument()
  })

  it('sorts needs-input teammates to top', () => {
    const teammates = [
      makeTeammate('t1', { needsInput: false, name: 'normal' }),
      makeTeammate('t2', { needsInput: true, name: 'urgent' })
    ]
    render(
      <AppProvider initialState={makeStateWith(teammates)}>
        <CompanionPanel teammates={teammates} />
      </AppProvider>
    )
    const cards = screen.getAllByTestId(/^teammate-card-/)
    expect(cards[0]).toHaveAttribute('data-testid', 'teammate-card-t2')
    expect(cards[1]).toHaveAttribute('data-testid', 'teammate-card-t1')
  })

  it('dispatches SELECT_TEAMMATE when card is clicked', () => {
    const teammates = [makeTeammate('t1'), makeTeammate('t2')]
    render(
      <AppProvider initialState={makeStateWith(teammates, 't1')}>
        <CompanionPanel teammates={teammates} />
      </AppProvider>
    )
    fireEvent.click(screen.getByTestId('teammate-card-t2'))
    // After click, t2's terminal should render (state update happens)
    expect(screen.getByTestId('terminal-pane-t2')).toBeInTheDocument()
  })
})
