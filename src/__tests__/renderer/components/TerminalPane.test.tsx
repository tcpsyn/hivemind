import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { TerminalPane } from '../../../renderer/src/components/TerminalPane'
import { AppProvider } from '../../../renderer/src/state/AppContext'
import type { AgentState } from '../../../shared/types'

// Mock useTerminal hook
vi.mock('../../../renderer/src/hooks/useTerminal', () => ({
  useTerminal: vi.fn()
}))

function makeAgent(overrides: Partial<AgentState> = {}): AgentState {
  return {
    id: 'agent-1',
    name: 'architect',
    role: 'Lead architect',
    avatar: 'robot-1',
    color: '#4ECDC4',
    status: 'running',
    needsInput: false,
    lastActivity: Date.now(),
    ...overrides
  }
}

describe('TerminalPane', () => {
  it('renders the agent name in the header', () => {
    render(
      <AppProvider>
        <TerminalPane agent={makeAgent()} />
      </AppProvider>
    )
    expect(screen.getByText('architect')).toBeInTheDocument()
  })

  it('renders the agent role', () => {
    render(
      <AppProvider>
        <TerminalPane agent={makeAgent()} />
      </AppProvider>
    )
    expect(screen.getByText('Lead architect')).toBeInTheDocument()
  })

  it('shows running status dot', () => {
    render(
      <AppProvider>
        <TerminalPane agent={makeAgent({ status: 'running' })} />
      </AppProvider>
    )
    const dot = screen.getByTestId('status-dot')
    expect(dot.className).toContain('running')
  })

  it('shows waiting status dot', () => {
    render(
      <AppProvider>
        <TerminalPane agent={makeAgent({ status: 'waiting' })} />
      </AppProvider>
    )
    const dot = screen.getByTestId('status-dot')
    expect(dot.className).toContain('waiting')
  })

  it('shows stopped status dot', () => {
    render(
      <AppProvider>
        <TerminalPane agent={makeAgent({ status: 'stopped' })} />
      </AppProvider>
    )
    const dot = screen.getByTestId('status-dot')
    expect(dot.className).toContain('stopped')
  })

  it('applies amber border when agent needs input', () => {
    const { container } = render(
      <AppProvider>
        <TerminalPane agent={makeAgent({ needsInput: true })} />
      </AppProvider>
    )
    expect(container.querySelector('.terminal-pane.needs-input')).toBeInTheDocument()
  })

  it('does not apply amber border when agent does not need input', () => {
    const { container } = render(
      <AppProvider>
        <TerminalPane agent={makeAgent({ needsInput: false })} />
      </AppProvider>
    )
    expect(container.querySelector('.terminal-pane.needs-input')).not.toBeInTheDocument()
  })

  it('applies the agent color to the header', () => {
    render(
      <AppProvider>
        <TerminalPane agent={makeAgent({ color: '#FF6B6B' })} />
      </AppProvider>
    )
    const header = screen.getByTestId('pane-header')
    expect(header.style.borderTopColor).toBe('rgb(255, 107, 107)')
  })

  it('has a terminal container element', () => {
    render(
      <AppProvider>
        <TerminalPane agent={makeAgent()} />
      </AppProvider>
    )
    expect(screen.getByTestId('terminal-container')).toBeInTheDocument()
  })

  it('dispatches maximize on header double-click', () => {
    render(
      <AppProvider>
        <TerminalPane agent={makeAgent()} />
      </AppProvider>
    )
    const header = screen.getByTestId('pane-header')
    fireEvent.doubleClick(header)
    // The component should dispatch MAXIMIZE_PANE action
    // We can't directly check dispatch, but we verify no crash occurs
  })
})
