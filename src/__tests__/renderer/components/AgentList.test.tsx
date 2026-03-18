import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { AppProvider, useAppDispatch } from '../../../renderer/src/state/AppContext'
import AgentList from '../../../renderer/src/components/AgentList'
import type { AgentState } from '../../../shared/types'

const TAB_ID = 'tab-default'

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'agent-1',
    name: 'architect',
    role: 'Lead architect',
    avatar: 'robot-1',
    color: '#FF6B6B',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    ...overrides
  }
}

function SetupAgents({ agents, children }: { agents: AgentState[]; children: React.ReactNode }) {
  const dispatch = useAppDispatch()
  agents.forEach((a) => dispatch({ type: 'ADD_AGENT', payload: a, tabId: TAB_ID }))
  return <>{children}</>
}

function renderAgentList(agents: AgentState[] = []) {
  return render(
    <AppProvider>
      <SetupAgents agents={agents}>
        <AgentList />
      </SetupAgents>
    </AppProvider>
  )
}

describe('AgentList', () => {
  it('renders with agent-list testid', () => {
    renderAgentList()
    expect(screen.getByTestId('agent-list')).toBeInTheDocument()
  })

  it('shows empty message when no agents', () => {
    renderAgentList()
    expect(screen.getByText(/no agents/i)).toBeInTheDocument()
  })

  it('renders all agents', () => {
    const agents = [
      makeAgent({ id: '1', name: 'architect' }),
      makeAgent({ id: '2', name: 'frontend' }),
      makeAgent({ id: '3', name: 'backend' })
    ]
    renderAgentList(agents)
    expect(screen.getByText('architect')).toBeInTheDocument()
    expect(screen.getByText('frontend')).toBeInTheDocument()
    expect(screen.getByText('backend')).toBeInTheDocument()
  })

  it('sorts agents needing input to the top', () => {
    const agents = [
      makeAgent({ id: '1', name: 'architect', status: 'running', needsInput: false }),
      makeAgent({ id: '2', name: 'frontend', status: 'waiting', needsInput: true }),
      makeAgent({ id: '3', name: 'backend', status: 'idle', needsInput: false })
    ]
    renderAgentList(agents)

    const items = screen.getAllByTestId(/^agent-list-item-/)
    expect(items[0]).toHaveAttribute('data-testid', 'agent-list-item-2')
  })

  it('maintains order for agents with same needsInput status', () => {
    const agents = [
      makeAgent({ id: '1', name: 'architect', needsInput: false }),
      makeAgent({ id: '2', name: 'frontend', needsInput: false }),
      makeAgent({ id: '3', name: 'backend', needsInput: false })
    ]
    renderAgentList(agents)

    const items = screen.getAllByTestId(/^agent-list-item-/)
    expect(items).toHaveLength(3)
  })

  it('is scrollable', () => {
    renderAgentList()
    const list = screen.getByTestId('agent-list')
    expect(list).toHaveClass('agent-list')
  })

  it('renders each agent as an AgentListItem', () => {
    const agents = [
      makeAgent({ id: '1', name: 'architect', color: '#FF6B6B' }),
      makeAgent({ id: '2', name: 'frontend', color: '#4ECDC4' })
    ]
    renderAgentList(agents)

    expect(screen.getByTestId('agent-list-item-1')).toBeInTheDocument()
    expect(screen.getByTestId('agent-list-item-2')).toBeInTheDocument()
  })
})
