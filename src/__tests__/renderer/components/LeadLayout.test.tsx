import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import { LeadLayout } from '../../../renderer/src/components/LeadLayout'
import {
  AppProvider,
  initialAppState
} from '../../../renderer/src/state/AppContext'
import type { AgentState, AppState } from '../../../shared/types'

vi.mock('../../../renderer/src/components/TerminalPane', () => ({
  TerminalPane: ({ agent }: { agent: AgentState }) => (
    <div data-testid={`terminal-pane-${agent.id}`}>{agent.name}</div>
  )
}))

vi.mock('../../../renderer/src/components/CompanionPanel', () => ({
  CompanionPanel: ({ teammates }: { teammates: AgentState[] }) => (
    <div data-testid="companion-panel">
      {teammates.map((t) => (
        <span key={t.id}>{t.name}</span>
      ))}
    </div>
  )
}))

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

function makeTeammate(id: string): AgentState {
  return {
    id,
    name: `teammate-${id}`,
    role: 'Agent',
    avatar: 'robot-2',
    color: '#4ecdc4',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    isTeammate: true,
    agentType: 'general-purpose'
  }
}

function makeState(
  leadId: string | null,
  agents: AgentState[],
  companionCollapsed = false
): AppState {
  const agentsMap = new Map<string, AgentState>()
  for (const a of agents) {
    agentsMap.set(a.id, a)
  }
  const defaultTab = initialAppState.tabs.get('tab-default')!
  const tabs = new Map(initialAppState.tabs)
  tabs.set('tab-default', {
    ...defaultTab,
    agents: agentsMap,
    layout: {
      ...defaultTab.layout,
      viewMode: 'lead',
      teamLeadId: leadId,
      companionPanelCollapsed: companionCollapsed
    }
  })
  return { ...initialAppState, tabs }
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

describe('LeadLayout', () => {
  it('renders the lead terminal pane', () => {
    const lead = makeLead()
    render(
      <AppProvider initialState={makeState('lead-1', [lead])}>
        <LeadLayout />
      </AppProvider>
    )
    expect(screen.getByTestId('terminal-pane-lead-1')).toBeInTheDocument()
  })

  it('hides companion panel when no teammates', () => {
    const lead = makeLead()
    render(
      <AppProvider initialState={makeState('lead-1', [lead])}>
        <LeadLayout />
      </AppProvider>
    )
    expect(screen.queryByTestId('companion-panel')).not.toBeInTheDocument()
  })

  it('shows companion panel when teammates exist', () => {
    const lead = makeLead()
    const teammate = makeTeammate('t1')
    render(
      <AppProvider initialState={makeState('lead-1', [lead, teammate])}>
        <LeadLayout />
      </AppProvider>
    )
    expect(screen.getByTestId('companion-panel')).toBeInTheDocument()
  })

  it('hides companion panel when collapsed', () => {
    const lead = makeLead()
    const teammate = makeTeammate('t1')
    render(
      <AppProvider initialState={makeState('lead-1', [lead, teammate], true)}>
        <LeadLayout />
      </AppProvider>
    )
    const container = screen.getByTestId('lead-layout')
    expect(container).toHaveClass('companion-collapsed')
  })

  it('passes only teammates (not lead) to companion panel', () => {
    const lead = makeLead()
    const t1 = makeTeammate('t1')
    const t2 = makeTeammate('t2')
    render(
      <AppProvider initialState={makeState('lead-1', [lead, t1, t2])}>
        <LeadLayout />
      </AppProvider>
    )
    const panel = screen.getByTestId('companion-panel')
    expect(panel).toHaveTextContent('teammate-t1')
    expect(panel).toHaveTextContent('teammate-t2')
    expect(panel).not.toHaveTextContent('team-lead')
  })

  it('renders lead-layout container', () => {
    const lead = makeLead()
    render(
      <AppProvider initialState={makeState('lead-1', [lead])}>
        <LeadLayout />
      </AppProvider>
    )
    expect(screen.getByTestId('lead-layout')).toBeInTheDocument()
  })
})
