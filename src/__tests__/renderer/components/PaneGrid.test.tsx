import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PaneGrid } from '../../../renderer/src/components/PaneGrid'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import type { AgentState } from '../../../shared/types'

// Mock TerminalPane to avoid xterm.js dependency
vi.mock('../../../renderer/src/components/TerminalPane', () => ({
  TerminalPane: ({ agent }: { agent: AgentState }) => (
    <div data-testid={`terminal-pane-${agent.id}`}>{agent.name}</div>
  )
}))

function makeAgent(id: string, overrides: Partial<AgentState> = {}): AgentState {
  return {
    id,
    name: `agent-${id}`,
    role: 'test',
    avatar: 'robot-1',
    color: '#FF6B6B',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    ...overrides
  }
}

describe('PaneGrid', () => {
  it('renders nothing when no agents', () => {
    const { container } = render(
      <AppProvider>
        <PaneGrid agents={[]} />
      </AppProvider>
    )
    expect(container.querySelector('.pane-grid')).toBeInTheDocument()
  })

  it('renders terminal panes for each agent', () => {
    const agents = [makeAgent('1'), makeAgent('2'), makeAgent('3')]
    render(
      <AppProvider>
        <PaneGrid agents={agents} />
      </AppProvider>
    )
    expect(screen.getByTestId('terminal-pane-1')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane-2')).toBeInTheDocument()
    expect(screen.getByTestId('terminal-pane-3')).toBeInTheDocument()
  })

  it('uses 1x1 grid for 1 agent', () => {
    const { container } = render(
      <AppProvider>
        <PaneGrid agents={[makeAgent('1')]} />
      </AppProvider>
    )
    const grid = container.querySelector('.pane-grid') as HTMLElement
    expect(grid.style.getPropertyValue('--grid-cols')).toBe('1')
    expect(grid.style.getPropertyValue('--grid-rows')).toBe('1')
  })

  it('uses 2x1 grid for 2 agents', () => {
    const { container } = render(
      <AppProvider>
        <PaneGrid agents={[makeAgent('1'), makeAgent('2')]} />
      </AppProvider>
    )
    const grid = container.querySelector('.pane-grid') as HTMLElement
    expect(grid.style.getPropertyValue('--grid-cols')).toBe('2')
    expect(grid.style.getPropertyValue('--grid-rows')).toBe('1')
  })

  it('uses 2x2 grid for 3-4 agents', () => {
    const agents = [makeAgent('1'), makeAgent('2'), makeAgent('3')]
    const { container } = render(
      <AppProvider>
        <PaneGrid agents={agents} />
      </AppProvider>
    )
    const grid = container.querySelector('.pane-grid') as HTMLElement
    expect(grid.style.getPropertyValue('--grid-cols')).toBe('2')
    expect(grid.style.getPropertyValue('--grid-rows')).toBe('2')
  })

  it('uses 3x2 grid for 5-6 agents', () => {
    const agents = Array.from({ length: 5 }, (_, i) => makeAgent(String(i)))
    const { container } = render(
      <AppProvider>
        <PaneGrid agents={agents} />
      </AppProvider>
    )
    const grid = container.querySelector('.pane-grid') as HTMLElement
    expect(grid.style.getPropertyValue('--grid-cols')).toBe('3')
    expect(grid.style.getPropertyValue('--grid-rows')).toBe('2')
  })
})
